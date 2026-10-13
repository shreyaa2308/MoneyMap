def register(client, email):
    response = client.post("/api/auth/register", json={"email": email, "password": "password123"})
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


CSV = """date,description,amount,type,category,account
2026-10-03,Harbor Market,12.50,expense,Groceries,Cash
2026-10-03,Harbor Market,12.50,expense,Groceries,Cash
not-a-date,Broken,nope,expense,Groceries,Cash
2026-10-04,Payroll,100.00,income,Pay,Cash
2026-10-05,Unknown,5.00,expense,Missing,Cash
"""


def test_csv_preview_and_import(client):
    headers = register(client, "ada@example.com")
    files = {"file": ("transactions.csv", CSV, "text/csv")}
    preview = client.post("/api/imports/preview", headers=headers, files=files)
    assert preview.status_code == 200
    body = preview.json()
    assert body["imported_count"] == 0
    assert body["valid_count"] == 2
    assert body["duplicate_count"] == 1
    assert body["invalid_count"] == 2
    assert "Date must be YYYY-MM-DD" in body["rows"][2]["errors"]
    assert client.get("/api/transactions", headers=headers).json() == []

    imported = client.post("/api/imports", headers=headers, files={"file": ("transactions.csv", CSV, "text/csv")})
    assert imported.status_code == 200
    assert imported.json()["imported_count"] == 2
    transactions = client.get("/api/transactions", headers=headers).json()
    assert len(transactions) == 2
    balance = client.get("/api/accounts", headers=headers).json()[0]["balance_cents"]
    assert balance == 10000 - 1250

    again = client.post("/api/imports", headers=headers, files={"file": ("transactions.csv", CSV, "text/csv")})
    assert again.json()["imported_count"] == 0
    assert again.json()["duplicate_count"] >= 2
    assert len(client.get("/api/transactions", headers=headers).json()) == 2


def test_csv_rejects_bad_files_and_other_users(client):
    ada = register(client, "ada@example.com")
    bea = register(client, "bea@example.com")
    assert client.post("/api/imports/preview").status_code == 401
    assert client.post(
        "/api/imports/preview",
        headers=ada,
        files={"file": ("notes.txt", b"date,description\n", "text/plain")},
    ).status_code == 400
    assert client.post(
        "/api/imports/preview",
        headers=ada,
        files={"file": ("rows.csv", b"date,description,amount,type,category,account\n", "text/csv")},
    ).status_code == 400

    private = "date,description,amount,type,category,account\n2026-10-01,Secret,9.00,expense,Groceries,Cash\n"
    client.post("/api/imports", headers=ada, files={"file": ("rows.csv", private, "text/csv")})
    assert client.get("/api/transactions", headers=bea).json() == []
    worth = client.get("/api/net-worth", headers=bea).json()
    assert worth["cash_cents"] == 0
    assert client.get("/api/budgets?month=2026-10", headers=bea).json() == []
    assert client.get("/api/dashboard?month=2026-10", headers=bea).json()["total_expenses_cents"] == 0
    ada_dashboard = client.get("/api/dashboard?month=2026-10", headers=ada).json()
    assert ada_dashboard["total_expenses_cents"] == 900
