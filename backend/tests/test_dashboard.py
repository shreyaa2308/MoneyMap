def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def register(client, email):
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def category_id(client, token, name):
    categories = client.get("/api/categories", headers=auth_header(token)).json()
    return next(category["id"] for category in categories if category["name"] == name)


def add_transaction(client, token, account_id, category, amount_cents, direction, occurred_on, description):
    response = client.post(
        "/api/transactions",
        headers=auth_header(token),
        json={
            "account_id": account_id,
            "category_id": category,
            "amount_cents": amount_cents,
            "direction": direction,
            "description": description,
            "occurred_on": occurred_on,
        },
    )
    assert response.status_code == 201


def test_dashboard_totals_budgets_and_empty_month(client):
    token = register(client, "ada@example.com")
    headers = auth_header(token)
    account_id = client.get("/api/accounts", headers=headers).json()[0]["id"]
    pay = category_id(client, token, "Pay")
    groceries = category_id(client, token, "Groceries")
    rent = category_id(client, token, "Rent")
    transit = category_id(client, token, "Transit")

    add_transaction(client, token, account_id, pay, 250000, "income", "2026-10-01", "Payroll")
    add_transaction(client, token, account_id, groceries, 6432, "expense", "2026-10-03", "Market")
    add_transaction(client, token, account_id, rent, 120000, "expense", "2026-10-01", "Apartment")
    add_transaction(client, token, account_id, pay, 5000, "income", "2026-09-15", "September pay")

    for category, limit in ((groceries, 8000), (rent, 100000), (transit, 10000)):
        created = client.post(
            "/api/budgets",
            headers=headers,
            json={"category_id": category, "month": "2026-10", "limit_cents": limit},
        )
        assert created.status_code == 201

    dashboard = client.get("/api/dashboard", headers=headers, params={"month": "2026-10"})
    assert dashboard.status_code == 200
    body = dashboard.json()
    assert body["total_income_cents"] == 250000
    assert body["total_expenses_cents"] == 126432
    assert body["net_cents"] == 123568
    assert body["recent_transactions"][0]["description"] == "Market"
    assert [item["description"] for item in body["recent_transactions"]] == [
        "Market",
        "Apartment",
        "Payroll",
    ]

    by_name = {item["category_name"]: item for item in body["budgets"]}
    assert by_name["Groceries"]["spent_cents"] == 6432
    assert by_name["Groceries"]["percent_used"] == 80
    assert by_name["Groceries"]["status"] == "approaching"
    assert by_name["Rent"]["spent_cents"] == 120000
    assert by_name["Rent"]["remaining_cents"] == -20000
    assert by_name["Rent"]["status"] == "over"
    assert by_name["Transit"]["spent_cents"] == 0
    assert by_name["Transit"]["remaining_cents"] == 10000
    assert by_name["Transit"]["status"] == "under"

    spending = {item["category_name"]: item["spent_cents"] for item in body["spending_by_category"]}
    assert spending == {"Rent": 120000, "Groceries": 6432}
    assert "Transit" not in spending

    comparison = {item["month"]: item for item in body["monthly_comparison"]}
    assert comparison["2026-09"]["income_cents"] == 5000
    assert comparison["2026-09"]["expenses_cents"] == 0
    assert comparison["2026-10"]["income_cents"] == 250000
    assert comparison["2026-05"]["income_cents"] == 0
    assert list(comparison)[-1] == "2026-10"

    empty = client.get("/api/dashboard", headers=headers, params={"month": "2026-01"}).json()
    assert empty["total_income_cents"] == 0
    assert empty["total_expenses_cents"] == 0
    assert empty["net_cents"] == 0
    assert empty["spending_by_category"] == []
    assert empty["budgets"] == []
    assert empty["recent_transactions"] == []


def test_dashboard_is_private(client):
    ada = register(client, "ada@example.com")
    bea = register(client, "bea@example.com")
    account_id = client.get("/api/accounts", headers=auth_header(ada)).json()[0]["id"]
    pay = category_id(client, ada, "Pay")
    add_transaction(client, ada, account_id, pay, 9000, "income", "2026-10-02", "Ada only")

    ada_dashboard = client.get(
        "/api/dashboard",
        headers=auth_header(ada),
        params={"month": "2026-10"},
    ).json()
    bea_dashboard = client.get(
        "/api/dashboard",
        headers=auth_header(bea),
        params={"month": "2026-10"},
    ).json()
    assert ada_dashboard["total_income_cents"] == 9000
    assert bea_dashboard["total_income_cents"] == 0
    assert bea_dashboard["recent_transactions"] == []
    assert client.get("/api/dashboard", params={"month": "2026-10"}).status_code == 401
    assert client.get(
        "/api/dashboard",
        headers=auth_header(ada),
        params={"month": "October"},
    ).status_code == 422
