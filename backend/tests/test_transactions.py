from app.models import Account, Transaction, User
from app.seed import DEMO_EMAIL, DEMO_PASSWORD, seed_demo_data
from app.security import verify_password


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def register(client, email):
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def starter_ids(client, token):
    headers = auth_header(token)
    accounts = client.get("/api/accounts", headers=headers).json()
    categories = client.get("/api/categories", headers=headers).json()
    pay = next(category for category in categories if category["name"] == "Pay")
    groceries = next(category for category in categories if category["name"] == "Groceries")
    return accounts[0]["id"], pay, groceries


def test_seed_is_idempotent_and_fictional(db):
    _engine, session = db
    seed_demo_data(session)
    seed_demo_data(session)

    user = session.query(User).filter(User.email == DEMO_EMAIL).one()
    assert verify_password(DEMO_PASSWORD, user.password_hash)
    assert session.query(Transaction).filter(Transaction.user_id == user.id).count() == 6

    checking = session.query(Account).filter_by(user_id=user.id, name="Everyday Checking").one()
    savings = session.query(Account).filter_by(user_id=user.id, name="Rainy Day Savings").one()
    assert checking.balance_cents == 120768
    assert savings.balance_cents == 50325


def test_transaction_crud_search_and_filter(client):
    token = register(client, "ada@example.com")
    headers = auth_header(token)
    account_id, pay, groceries = starter_ids(client, token)

    created = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": account_id,
            "category_id": pay["id"],
            "amount_cents": 2500,
            "direction": "income",
            "description": "Saturday market stall",
            "occurred_on": "2026-10-04",
        },
    )
    assert created.status_code == 201
    created_body = created.json()
    assert created_body["amount_cents"] == 2500
    transaction_id = created_body["id"]

    expense = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": account_id,
            "category_id": groceries["id"],
            "amount_cents": 499,
            "direction": "expense",
            "description": "Harbor apples",
            "occurred_on": "2026-10-05",
        },
    )
    assert expense.status_code == 201
    assert expense.json()["amount_cents"] == -499

    accounts = client.get("/api/accounts", headers=headers).json()
    assert accounts[0]["balance_cents"] == 2001

    search = client.get("/api/transactions", headers=headers, params={"q": "harbor"})
    assert search.status_code == 200
    assert [item["description"] for item in search.json()] == ["Harbor apples"]

    income_only = client.get("/api/transactions", headers=headers, params={"kind": "income"})
    assert [item["description"] for item in income_only.json()] == ["Saturday market stall"]

    mismatch = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": account_id,
            "category_id": groceries["id"],
            "amount_cents": 100,
            "direction": "income",
            "description": "Wrong category",
            "occurred_on": "2026-10-06",
        },
    )
    assert mismatch.status_code == 400

    updated = client.put(
        f"/api/transactions/{transaction_id}",
        headers=headers,
        json={
            "account_id": account_id,
            "category_id": pay["id"],
            "amount_cents": 3000,
            "direction": "income",
            "description": "Saturday market stall",
            "occurred_on": "2026-10-04",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["amount_cents"] == 3000
    assert client.get("/api/accounts", headers=headers).json()[0]["balance_cents"] == 2501

    deleted = client.delete(f"/api/transactions/{transaction_id}", headers=headers)
    assert deleted.status_code == 204
    remaining = client.get("/api/transactions", headers=headers).json()
    assert [item["description"] for item in remaining] == ["Harbor apples"]
    assert client.get("/api/accounts", headers=headers).json()[0]["balance_cents"] == -499


def test_users_cannot_see_or_edit_each_others_records(client):
    ada = register(client, "ada@example.com")
    bea = register(client, "bea@example.com")
    account_id, pay, _groceries = starter_ids(client, ada)

    created = client.post(
        "/api/transactions",
        headers=auth_header(ada),
        json={
            "account_id": account_id,
            "category_id": pay["id"],
            "amount_cents": 1000,
            "direction": "income",
            "description": "Ada's paycheck",
            "occurred_on": "2026-10-01",
        },
    )
    transaction_id = created.json()["id"]

    bea_list = client.get("/api/transactions", headers=auth_header(bea))
    assert bea_list.status_code == 200
    assert bea_list.json() == []

    bea_accounts = client.get("/api/accounts", headers=auth_header(bea)).json()
    assert account_id not in [account["id"] for account in bea_accounts]

    stolen = client.put(
        f"/api/transactions/{transaction_id}",
        headers=auth_header(bea),
        json={
            "account_id": bea_accounts[0]["id"],
            "category_id": pay["id"],
            "amount_cents": 1000,
            "direction": "income",
            "description": "Stolen",
            "occurred_on": "2026-10-01",
        },
    )
    assert stolen.status_code == 404
    assert client.delete(
        f"/api/transactions/{transaction_id}",
        headers=auth_header(bea),
    ).status_code == 404

    using_adas_account = client.post(
        "/api/transactions",
        headers=auth_header(bea),
        json={
            "account_id": account_id,
            "category_id": pay["id"],
            "amount_cents": 1000,
            "direction": "income",
            "description": "Wrong account",
            "occurred_on": "2026-10-02",
        },
    )
    assert using_adas_account.status_code == 404

    still_adas = client.get("/api/transactions", headers=auth_header(ada)).json()
    assert [item["description"] for item in still_adas] == ["Ada's paycheck"]


def test_reassigning_a_transaction_updates_both_balances(client):
    token = register(client, "ada@example.com")
    headers = auth_header(token)
    cash_id, pay, _groceries = starter_ids(client, token)
    savings = client.post(
        "/api/accounts",
        headers=headers,
        json={"name": "Savings", "account_type": "savings"},
    )
    assert savings.status_code == 201
    savings_id = savings.json()["id"]

    created = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": cash_id,
            "category_id": pay["id"],
            "amount_cents": 1500,
            "direction": "income",
            "description": "Transfer in",
            "occurred_on": "2026-10-04",
        },
    )
    assert created.status_code == 201
    transaction_id = created.json()["id"]

    moved = client.put(
        f"/api/transactions/{transaction_id}",
        headers=headers,
        json={
            "account_id": savings_id,
            "category_id": pay["id"],
            "amount_cents": 1500,
            "direction": "income",
            "description": "Transfer in",
            "occurred_on": "2026-10-04",
        },
    )
    assert moved.status_code == 200
    balances = {
        account["id"]: account["balance_cents"]
        for account in client.get("/api/accounts", headers=headers).json()
    }
    assert balances[cash_id] == 0
    assert balances[savings_id] == 1500

    savings_only = client.get("/api/transactions", headers=headers, params={"account_id": savings_id})
    assert [item["description"] for item in savings_only.json()] == ["Transfer in"]


def test_transaction_rejects_bad_input_and_missing_rows(client):
    assert client.get("/api/transactions").status_code == 401
    token = register(client, "ada@example.com")
    headers = auth_header(token)
    account_id, pay, _groceries = starter_ids(client, token)
    rejected = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": account_id,
            "category_id": pay["id"],
            "amount_cents": 0,
            "direction": "income",
            "description": "Zero",
            "occurred_on": "2026-10-04",
        },
    )
    assert rejected.status_code == 422
    missing = {
        "account_id": account_id,
        "category_id": pay["id"],
        "amount_cents": 100,
        "direction": "income",
        "description": "Missing",
        "occurred_on": "2026-10-04",
    }
    assert client.put("/api/transactions/999999", headers=headers, json=missing).status_code == 404
    assert client.delete("/api/transactions/999999", headers=headers).status_code == 404
    assert client.get("/api/accounts", headers=headers).json()[0]["balance_cents"] == 0


def test_new_category_is_private(client):
    ada = register(client, "ada@example.com")
    bea = register(client, "bea@example.com")
    created = client.post(
        "/api/categories",
        headers=auth_header(ada),
        json={"name": "Freelance", "kind": "income"},
    )
    assert created.status_code == 201
    ada_names = [category["name"] for category in client.get("/api/categories", headers=auth_header(ada)).json()]
    bea_names = [category["name"] for category in client.get("/api/categories", headers=auth_header(bea)).json()]
    assert "Freelance" in ada_names
    assert "Freelance" not in bea_names
    duplicate = client.post(
        "/api/categories",
        headers=auth_header(ada),
        json={"name": "freelance", "kind": "income"},
    )
    assert duplicate.status_code == 409
