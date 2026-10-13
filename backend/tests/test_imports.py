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
    assert any("Date must be YYYY-MM-DD" in error for error in body["rows"][2]["errors"])
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


def test_invalid_rows_are_not_imported(client):
    headers = register(client, "ada@example.com")
    csv = "date,description,amount,type,category,account\nbad,Broken,nope,expense,Groceries,Cash\n"
    response = client.post(
        "/api/imports",
        headers=headers,
        files={"file": ("bad.csv", csv, "text/csv")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["imported_count"] == 0
    assert body["invalid_count"] == 1
    assert client.get("/api/transactions", headers=headers).json() == []
    assert client.get("/api/accounts", headers=headers).json()[0]["balance_cents"] == 0


BANK = """Transaction Date,Description,Amount,Transaction Type
10/09/2026,Riverbend Coffee,-6.40,Debit
10/10/2026,Northline Side Gig,180.00,Credit
10/09/2026,Riverbend Coffee,-6.40,Debit
10/11/2026,Greenline Grocery,-24.15,Debit
13/40/2026,Broken Date,-5.00,Debit
10/12/2026,City Library,not-money,Debit
"""

COLUMNS = """Posted Date,Memo,Debit,Credit
10/09/2026,Corner Bakery,8.25,
10/10/2026,Client Refund,,40.00
"""


def _ids(client, headers):
    account_id = client.get("/api/accounts", headers=headers).json()[0]["id"]
    categories = client.get("/api/categories", headers=headers).json()
    groceries = next(category["id"] for category in categories if category["name"] == "Groceries")
    pay = next(category["id"] for category in categories if category["name"] == "Pay")
    return account_id, groceries, pay


def test_bank_statement_maps_columns_and_reports_every_row(client):
    ada = register(client, "ada@example.com")
    bea = register(client, "bea@example.com")
    account_id, groceries, pay = _ids(client, ada)
    bea_account = client.get("/api/accounts", headers=bea).json()[0]["id"]
    mapping = {
        "account_id": str(account_id),
        "expense_category_id": str(groceries),
        "income_category_id": str(pay),
    }
    stolen = client.post(
        "/api/imports/preview",
        headers=ada,
        data={"account_id": str(bea_account)},
        files={"file": ("statement.csv", BANK, "text/csv")},
    )
    assert stolen.status_code == 404
    assert client.get("/api/transactions", headers=ada).json() == []

    preview = client.post(
        "/api/imports/preview",
        headers=ada,
        data=mapping,
        files={"file": ("statement.csv", BANK, "text/csv")},
    )
    assert preview.status_code == 200
    body = preview.json()
    assert body["imported_count"] == 0
    assert body["valid_count"] == 3
    assert body["duplicate_count"] == 1
    assert body["invalid_count"] == 2
    assert "Date must be YYYY-MM-DD or MM/DD/YYYY" in body["rows"][4]["errors"]
    assert "Amount must be a positive number" in " ".join(body["rows"][5]["errors"])
    assert "A matching transaction already exists" in body["rows"][2]["errors"]
    assert client.get("/api/transactions", headers=ada).json() == []

    imported = client.post(
        "/api/imports",
        headers=ada,
        data=mapping,
        files={"file": ("statement.csv", BANK, "text/csv")},
    )
    assert imported.status_code == 200
    assert imported.json()["imported_count"] == 3
    assert imported.json()["invalid_count"] == 2
    assert imported.json()["duplicate_count"] == 1
    transactions = client.get("/api/transactions", headers=ada).json()
    assert len(transactions) == 3
    assert {row["description"] for row in transactions} == {
        "Riverbend Coffee",
        "Northline Side Gig",
        "Greenline Grocery",
    }
    balance = client.get("/api/accounts", headers=ada).json()[0]["balance_cents"]
    assert balance == 18000 - 640 - 2415
    assert client.get("/api/transactions", headers=bea).json() == []
    dashboard = client.get("/api/dashboard?month=2026-10", headers=ada).json()
    assert dashboard["total_income_cents"] == 18000
    assert dashboard["total_expenses_cents"] == 640 + 2415

    again = client.post(
        "/api/imports",
        headers=ada,
        data=mapping,
        files={"file": ("statement.csv", BANK, "text/csv")},
    )
    assert again.json()["imported_count"] == 0
    assert again.json()["duplicate_count"] == 4
    assert len(client.get("/api/transactions", headers=ada).json()) == 3


def test_bank_statement_without_a_chosen_account_imports_nothing(client):
    headers = register(client, "ada@example.com")
    response = client.post(
        "/api/imports",
        headers=headers,
        files={"file": ("statement.csv", BANK, "text/csv")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["imported_count"] == 0
    assert body["valid_count"] == 0
    assert body["invalid_count"] == 6
    assert any("Choose an account" in " ".join(row["errors"]) for row in body["rows"])
    assert client.get("/api/transactions", headers=headers).json() == []
    assert client.get("/api/accounts", headers=headers).json()[0]["balance_cents"] == 0


def test_debit_and_credit_columns_use_the_selected_categories(client):
    headers = register(client, "ada@example.com")
    account_id, groceries, pay = _ids(client, headers)
    response = client.post(
        "/api/imports",
        headers=headers,
        data={
            "account_id": str(account_id),
            "expense_category_id": str(groceries),
            "income_category_id": str(pay),
        },
        files={"file": ("statement.csv", COLUMNS, "text/csv")},
    )
    assert response.status_code == 200
    assert response.json()["imported_count"] == 2
    assert response.json()["invalid_count"] == 0
    balance = client.get("/api/accounts", headers=headers).json()[0]["balance_cents"]
    assert balance == 4000 - 825
    kinds = {row["description"]: row["kind"] for row in client.get("/api/transactions", headers=headers).json()}
    assert kinds["Corner Bakery"] == "expense"
    assert kinds["Client Refund"] == "income"


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
