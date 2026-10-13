from datetime import date, timedelta


def register(client, email):
    response = client.post("/api/auth/register", json={"email": email, "password": "password123"})
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def expense_category(client, headers):
    categories = client.get("/api/categories", headers=headers).json()
    return next(category["id"] for category in categories if category["kind"] == "expense")


def test_bill_status_and_explicit_payment(client):
    headers = register(client, "ada@example.com")
    category_id = expense_category(client, headers)
    account_id = client.get("/api/accounts", headers=headers).json()[0]["id"]
    overdue = client.post(
        "/api/bills",
        headers=headers,
        json={
            "name": "Late Rent",
            "amount_cents": 1000,
            "frequency": "monthly",
            "category_id": category_id,
            "next_due_on": str(date.today() - timedelta(days=1)),
        },
    )
    assert overdue.status_code == 201
    assert overdue.json()["status"] == "overdue"

    upcoming = client.post(
        "/api/bills",
        headers=headers,
        json={
            "name": "Stream",
            "amount_cents": 500,
            "frequency": "weekly",
            "category_id": category_id,
            "next_due_on": str(date.today() + timedelta(days=3)),
        },
    )
    bill = upcoming.json()
    assert bill["status"] == "upcoming"
    due_on = bill["next_due_on"]

    income_id = next(
        category["id"]
        for category in client.get("/api/categories", headers=headers).json()
        if category["kind"] == "income"
    )
    assert client.post(
        "/api/bills",
        headers=headers,
        json={
            "name": "Bad",
            "amount_cents": 100,
            "frequency": "yearly",
            "category_id": income_id,
            "next_due_on": "2026-11-01",
        },
    ).status_code == 400

    paid = client.post(f"/api/bills/{bill['id']}/pay", headers=headers, json={"account_id": account_id})
    assert paid.status_code == 200
    assert paid.json()["amount_cents"] == -500
    assert paid.json()["occurred_on"] == due_on
    assert paid.json()["description"] == "Stream"

    again = client.put(
        f"/api/bills/{bill['id']}",
        headers=headers,
        json={
            "name": "Stream",
            "amount_cents": 500,
            "frequency": "weekly",
            "category_id": category_id,
            "next_due_on": due_on,
        },
    )
    assert again.status_code == 200
    duplicate = client.post(f"/api/bills/{bill['id']}/pay", headers=headers, json={"account_id": account_id})
    assert duplicate.status_code == 409
    transactions = client.get("/api/transactions", headers=headers).json()
    assert len(transactions) == 1

    payments = client.get("/api/bills/payments", headers=headers).json()
    assert payments[0]["status"] == "paid"
    assert payments[0]["due_on"] == due_on

    assert client.delete(f"/api/bills/{bill['id']}", headers=headers).status_code == 204
    assert client.get("/api/transactions", headers=headers).json()[0]["description"] == "Stream"


def test_bills_are_private(client):
    ada = register(client, "ada@example.com")
    bea = register(client, "bea@example.com")
    category_id = expense_category(client, ada)
    bill_id = client.post(
        "/api/bills",
        headers=ada,
        json={
            "name": "Ada Power",
            "amount_cents": 100,
            "frequency": "monthly",
            "category_id": category_id,
            "next_due_on": "2026-12-01",
        },
    ).json()["id"]
    bea_account = client.get("/api/accounts", headers=bea).json()[0]["id"]
    assert client.get("/api/bills").status_code == 401
    assert client.post(f"/api/bills/{bill_id}/pay", headers=bea, json={"account_id": bea_account}).status_code == 404
    assert client.delete(f"/api/bills/{bill_id}", headers=bea).status_code == 404
    assert client.get("/api/bills", headers=bea).json() == []
    assert client.get("/api/bills/payments", headers=bea).json() == []
