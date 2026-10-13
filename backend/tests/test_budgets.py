from app.seed import seed_demo_budgets, seed_demo_data


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def register(client, email):
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def expense_category(client, token, name="Groceries"):
    categories = client.get("/api/categories", headers=auth_header(token)).json()
    return next(category for category in categories if category["name"] == name)


def test_budget_crud_and_duplicate_month(client):
    token = register(client, "ada@example.com")
    headers = auth_header(token)
    groceries = expense_category(client, token)

    created = client.post(
        "/api/budgets",
        headers=headers,
        json={"category_id": groceries["id"], "month": "2026-10", "limit_cents": 8000},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["spent_cents"] == 0
    assert body["remaining_cents"] == 8000
    assert body["percent_used"] == 0
    assert body["status"] == "under"
    budget_id = body["id"]

    duplicate = client.post(
        "/api/budgets",
        headers=headers,
        json={"category_id": groceries["id"], "month": "2026-10", "limit_cents": 9000},
    )
    assert duplicate.status_code == 409

    listed = client.get("/api/budgets", headers=headers, params={"month": "2026-10"})
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [budget_id]

    other_month = client.get("/api/budgets", headers=headers, params={"month": "2026-11"})
    assert other_month.json() == []

    updated = client.put(
        f"/api/budgets/{budget_id}",
        headers=headers,
        json={"limit_cents": 5000},
    )
    assert updated.status_code == 200
    assert updated.json()["limit_cents"] == 5000
    assert updated.json()["remaining_cents"] == 5000

    deleted = client.delete(f"/api/budgets/{budget_id}", headers=headers)
    assert deleted.status_code == 204
    assert client.get("/api/budgets", headers=headers, params={"month": "2026-10"}).json() == []


def test_budget_validation(client):
    token = register(client, "ada@example.com")
    headers = auth_header(token)
    groceries = expense_category(client, token)
    pay = expense_category(client, token, "Pay")

    zero = client.post(
        "/api/budgets",
        headers=headers,
        json={"category_id": groceries["id"], "month": "2026-10", "limit_cents": 0},
    )
    bad_month = client.post(
        "/api/budgets",
        headers=headers,
        json={"category_id": groceries["id"], "month": "2026-13", "limit_cents": 1000},
    )
    income = client.post(
        "/api/budgets",
        headers=headers,
        json={"category_id": pay["id"], "month": "2026-10", "limit_cents": 1000},
    )
    assert zero.status_code == 422
    assert bad_month.status_code == 422
    assert income.status_code == 400


def test_budget_spending_uses_only_that_month(client):
    token = register(client, "ada@example.com")
    headers = auth_header(token)
    accounts = client.get("/api/accounts", headers=headers).json()
    groceries = expense_category(client, token)
    account_id = accounts[0]["id"]

    def add_expense(amount_cents, occurred_on):
        response = client.post(
            "/api/transactions",
            headers=headers,
            json={
                "account_id": account_id,
                "category_id": groceries["id"],
                "amount_cents": amount_cents,
                "direction": "expense",
                "description": "Store",
                "occurred_on": occurred_on,
            },
        )
        assert response.status_code == 201

    add_expense(2500, "2026-10-03")
    add_expense(1000, "2026-09-30")

    created = client.post(
        "/api/budgets",
        headers=headers,
        json={"category_id": groceries["id"], "month": "2026-10", "limit_cents": 3000},
    )
    body = created.json()
    assert body["spent_cents"] == 2500
    assert body["remaining_cents"] == 500
    assert body["percent_used"] == 83
    assert body["status"] == "approaching"


def test_users_cannot_read_or_change_another_budget(client):
    ada = register(client, "ada@example.com")
    bea = register(client, "bea@example.com")
    groceries = expense_category(client, ada)
    created = client.post(
        "/api/budgets",
        headers=auth_header(ada),
        json={"category_id": groceries["id"], "month": "2026-10", "limit_cents": 4000},
    )
    budget_id = created.json()["id"]

    bea_list = client.get("/api/budgets", headers=auth_header(bea), params={"month": "2026-10"})
    assert bea_list.json() == []

    stolen_category = client.post(
        "/api/budgets",
        headers=auth_header(bea),
        json={"category_id": groceries["id"], "month": "2026-10", "limit_cents": 1000},
    )
    assert stolen_category.status_code == 404
    assert client.put(
        f"/api/budgets/{budget_id}",
        headers=auth_header(bea),
        json={"limit_cents": 1000},
    ).status_code == 404
    assert client.delete(f"/api/budgets/{budget_id}", headers=auth_header(bea)).status_code == 404
    assert client.get("/api/budgets", params={"month": "2026-10"}).status_code == 401


def test_demo_budgets_are_added_once(db):
    _engine, session = db
    seed_demo_data(session)
    seed_demo_budgets(session)
    seed_demo_budgets(session)
    from app.models import Budget, User

    user = session.query(User).filter_by(email="demo@moneymap.example").one()
    budgets = session.query(Budget).filter_by(user_id=user.id).all()
    assert len(budgets) == 3
    limits = {budget.category.name: budget.limit_cents for budget in budgets}
    assert limits == {"Groceries": 8000, "Rent": 100000, "Transit": 10000}
