from datetime import date


def register(client, email, password="password123"):
    response = client.post("/api/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_account_crud_balance_and_net_worth(client):
    headers = register(client, "ada@example.com")
    created = client.post(
        "/api/accounts",
        headers=headers,
        json={"name": "Rainy Day", "account_type": "savings"},
    )
    assert created.status_code == 201
    savings = created.json()
    assert savings["balance_cents"] == 0

    cash = client.get("/api/accounts", headers=headers).json()
    cash_id = next(account["id"] for account in cash if account["name"] == "Cash")
    category_id = next(
        category["id"]
        for category in client.get("/api/categories", headers=headers).json()
        if category["name"] == "Pay"
    )
    income = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": cash_id,
            "category_id": category_id,
            "amount_cents": 2500,
            "direction": "income",
            "description": "Paycheck",
            "occurred_on": "2026-10-01",
        },
    )
    assert income.status_code == 201

    renamed = client.put(
        f"/api/accounts/{savings['id']}",
        headers=headers,
        json={"name": "Emergency", "account_type": "savings"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Emergency"

    worth = client.get("/api/net-worth", headers=headers).json()
    assert worth["cash_cents"] == 2500
    assert worth["investments_cents"] == 0
    assert worth["net_worth_cents"] == 2500

    duplicate = client.post(
        "/api/accounts",
        headers=headers,
        json={"name": "Emergency", "account_type": "cash"},
    )
    assert duplicate.status_code == 409
    assert client.post("/api/accounts", headers=headers, json={"name": "Bad", "account_type": "brokerage"}).status_code == 422


def test_delete_blocks_transactions_until_confirmed(client):
    headers = register(client, "ada@example.com")
    accounts = client.get("/api/accounts", headers=headers).json()
    cash_id = accounts[0]["id"]
    category_id = client.get("/api/categories", headers=headers).json()[1]["id"]
    client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": cash_id,
            "category_id": category_id,
            "amount_cents": 500,
            "direction": "expense",
            "description": "Snack",
            "occurred_on": str(date(2026, 10, 2)),
        },
    )
    blocked = client.delete(f"/api/accounts/{cash_id}", headers=headers)
    assert blocked.status_code == 409

    other = client.post(
        "/api/accounts",
        headers=headers,
        json={"name": "Backup", "account_type": "checking"},
    ).json()
    moved = client.delete(f"/api/accounts/{cash_id}?reassign_to={other['id']}", headers=headers)
    assert moved.status_code == 204
    remaining = client.get("/api/accounts", headers=headers).json()
    assert len(remaining) == 1
    assert remaining[0]["balance_cents"] == -500
    transactions = client.get("/api/transactions", headers=headers).json()
    assert transactions[0]["account_id"] == other["id"]

    removed = client.delete(
        f"/api/accounts/{other['id']}?confirm=delete-transactions",
        headers=headers,
    )
    assert removed.status_code == 204
    assert client.get("/api/transactions", headers=headers).json() == []
    assert client.get("/api/net-worth", headers=headers).json()["cash_cents"] == 0


def test_accounts_are_private(client):
    ada = register(client, "ada@example.com")
    bea = register(client, "bea@example.com")
    account_id = client.get("/api/accounts", headers=ada).json()[0]["id"]
    assert client.get("/api/net-worth").status_code == 401
    assert client.get("/api/accounts").status_code == 401
    assert client.put(
        f"/api/accounts/{account_id}",
        headers=bea,
        json={"name": "Stolen", "account_type": "cash"},
    ).status_code == 404
    assert client.delete(f"/api/accounts/{account_id}", headers=bea).status_code == 404
    assert client.get("/api/net-worth", headers=bea).json()["cash_cents"] == 0
