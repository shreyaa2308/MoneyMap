import os
import sqlite3

import httpx

from app.plaid_client import PlaidServiceError
from app.plaid_sync import plaid_amount_to_cents
from app.token_cipher import decrypt_token


def register(client, email):
    response = client.post("/api/auth/register", json={"email": email, "password": "password123"})
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def enable_plaid(monkeypatch, handler):
    monkeypatch.setenv("PLAID_CLIENT_ID", "client-test")
    monkeypatch.setenv("PLAID_SECRET", "secret-test")
    monkeypatch.setenv("PLAID_ENV", "sandbox")
    monkeypatch.setattr("app.plaid_client.plaid_request", handler)


def assert_no_secrets(response):
    text = response.text
    assert "secret-test" not in text
    assert "client-test" not in text
    assert "access-sandbox" not in text


CHECKING = {
    "account_id": "acc-checking",
    "name": "Plaid Checking",
    "mask": "0000",
    "type": "depository",
    "subtype": "checking",
    "balances": {"current": 99999.99, "iso_currency_code": "USD"},
}
CREDIT = {
    "account_id": "acc-credit",
    "name": "Plaid Credit Card",
    "type": "credit",
    "subtype": "credit card",
    "balances": {"current": 50},
}
GROCERY = {
    "transaction_id": "txn-grocery",
    "account_id": "acc-checking",
    "amount": 12.50,
    "iso_currency_code": "USD",
    "date": "2026-10-03",
    "name": "Harbor Market",
    "merchant_name": "Harbor Market",
    "pending": False,
    "personal_finance_category": {"primary": "FOOD_AND_DRINK"},
}
PAYROLL = {
    "transaction_id": "txn-payroll",
    "account_id": "acc-checking",
    "amount": -100,
    "iso_currency_code": "USD",
    "date": "2026-10-04",
    "name": "Payroll",
    "pending": False,
    "personal_finance_category": {"primary": "INCOME"},
}
PENDING = {
    "transaction_id": "txn-pending",
    "account_id": "acc-checking",
    "amount": 4,
    "iso_currency_code": "USD",
    "date": "2026-10-05",
    "name": "Pending Coffee",
    "pending": True,
}
CREDIT_TXN = {
    "transaction_id": "txn-credit",
    "account_id": "acc-credit",
    "amount": 20,
    "iso_currency_code": "USD",
    "date": "2026-10-05",
    "name": "Card charge",
    "pending": False,
}


def plaid_page(added=None, modified=None, removed=None, cursor="cursor-1"):
    return {
        "added": list(added or []),
        "modified": list(modified or []),
        "removed": list(removed or []),
        "next_cursor": cursor,
        "has_more": False,
        "accounts": [CHECKING, CREDIT],
    }


def scripted_handler(sync_page, access_token="access-sandbox-test", item_id="item-1"):
    calls = []

    def handler(path, payload):
        calls.append((path, payload))
        if path == "/link/token/create":
            assert payload["products"] == ["transactions"]
            assert payload["user"]["client_user_id"].isdigit()
            assert "email" not in payload
            return {"link_token": "link-sandbox-test"}
        if path == "/item/public_token/exchange":
            assert payload["public_token"] == "public-sandbox-test"
            return {"access_token": access_token, "item_id": item_id}
        if path == "/transactions/sync":
            assert payload["access_token"] == access_token
            page = sync_page() if callable(sync_page) else sync_page
            return page
        if path == "/item/remove":
            assert payload["access_token"] == access_token
            return {"removed": True}
        raise AssertionError(path)

    return handler, calls


def connect(client, headers):
    token = client.post("/api/plaid/link-token", headers=headers)
    assert token.status_code == 200
    assert_no_secrets(token)
    assert token.json()["link_token"] == "link-sandbox-test"
    created = client.post(
        "/api/plaid/items",
        headers=headers,
        json={"public_token": "public-sandbox-test", "institution_name": "First Platypus Bank"},
    )
    assert created.status_code == 201
    assert_no_secrets(created)
    assert set(created.json()) == {"id", "institution_name"}
    assert created.json()["institution_name"] == "First Platypus Bank"
    return created.json()["id"]


def test_env_file_changes_fill_missing_plaid_keys(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("OPENAI_MODEL=gpt-4o-mini\n")
    monkeypatch.setattr("app.config.BACKEND_DIR", tmp_path)
    monkeypatch.setattr("app.config._environment_loaded", False)
    monkeypatch.setattr("app.config._environment_mtime", None)
    monkeypatch.setenv("OPENAI_MODEL", "kept-model")
    monkeypatch.delenv("PLAID_CLIENT_ID", raising=False)
    monkeypatch.delenv("PLAID_SECRET", raising=False)
    monkeypatch.delenv("PLAID_ENV", raising=False)

    from app.config import openai_settings, plaid_settings

    assert plaid_settings()["configured"] is False
    assert openai_settings()["model"] == "kept-model"

    env_file.write_text(
        "OPENAI_MODEL=file-model\n"
        "PLAID_CLIENT_ID=client-from-file\n"
        "PLAID_SECRET=secret-from-file\n"
        "PLAID_ENV=sandbox\n"
    )
    later = env_file.stat().st_mtime + 5
    os.utime(env_file, (later, later))

    settings = plaid_settings()
    assert settings["configured"] is True
    assert settings["client_id"] == "client-from-file"
    assert settings["env"] == "sandbox"
    assert openai_settings()["model"] == "kept-model"


def test_plaid_amount_sign_matches_moneymap():
    assert plaid_amount_to_cents(12.50) == -1250
    assert plaid_amount_to_cents(-100) == 10000
    assert plaid_amount_to_cents("12.10") == -1210
    assert plaid_amount_to_cents(12.10) == -1210


def test_plaid_is_optional_and_requires_login(client, monkeypatch):
    monkeypatch.setenv("PLAID_CLIENT_ID", "")
    monkeypatch.setenv("PLAID_SECRET", "")
    monkeypatch.setenv("PLAID_ENV", "sandbox")

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("Plaid should not be called")

    monkeypatch.setattr("app.plaid_client.httpx.post", fail_if_called)
    assert client.get("/api/plaid/status").status_code == 401
    assert client.post("/api/plaid/link-token").status_code == 401
    assert client.post("/api/plaid/items", json={"public_token": "public-sandbox-test"}).status_code == 401
    assert client.post("/api/plaid/items/1/sync").status_code == 401
    assert client.delete("/api/plaid/items/1").status_code == 401

    headers = register(client, "ada@example.com")
    status = client.get("/api/plaid/status", headers=headers)
    assert status.status_code == 200
    assert status.json()["available"] is False
    assert status.json()["connections"] == []
    assert "PLAID_CLIENT_ID" in status.json()["message"]
    assert_no_secrets(status)

    link = client.post("/api/plaid/link-token", headers=headers)
    assert link.status_code == 503
    assert "rest of MoneyMap" in link.json()["detail"]
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["database"] == "ok"


def test_unknown_plaid_env_does_not_call_plaid(client, monkeypatch):
    monkeypatch.setenv("PLAID_CLIENT_ID", "client-test")
    monkeypatch.setenv("PLAID_SECRET", "secret-test")
    monkeypatch.setenv("PLAID_ENV", "staging")

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("Plaid should not be called")

    monkeypatch.setattr("app.plaid_client.httpx.post", fail_if_called)
    headers = register(client, "ada@example.com")
    status = client.get("/api/plaid/status", headers=headers)
    assert status.status_code == 200
    assert status.json()["available"] is False
    assert client.post("/api/plaid/link-token", headers=headers).status_code == 503


def test_link_token_posts_the_secret_only_to_plaid(client, monkeypatch):
    monkeypatch.setenv("PLAID_CLIENT_ID", "client-test")
    monkeypatch.setenv("PLAID_SECRET", "secret-test")
    monkeypatch.setenv("PLAID_ENV", "sandbox")
    seen = {}

    def fake_post(url, json, headers, timeout):
        seen["url"] = url
        seen["body"] = json
        seen["version"] = headers.get("Plaid-Version")
        seen["timeout"] = timeout

        class Response:
            status_code = 200

            def json(self):
                return {"link_token": "link-sandbox-test", "request_id": "req-1"}

        return Response()

    monkeypatch.setattr("app.plaid_client.httpx.post", fake_post)
    headers = register(client, "ada@example.com")
    response = client.post("/api/plaid/link-token", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"link_token": "link-sandbox-test"}
    assert seen["url"] == "https://sandbox.plaid.com/link/token/create"
    assert seen["body"]["secret"] == "secret-test"
    assert seen["body"]["client_id"] == "client-test"
    assert seen["version"] == "2020-09-14"
    assert_no_secrets(response)


def test_exchange_encrypts_the_access_token(client, tmp_path, monkeypatch):
    handler, _calls = scripted_handler(plaid_page())
    enable_plaid(monkeypatch, handler)
    headers = register(client, "ada@example.com")
    connection_id = connect(client, headers)

    stored = sqlite3.connect(tmp_path / "test.db").execute(
        "SELECT access_token_encrypted, user_id FROM plaid_items"
    ).fetchone()
    assert "access-sandbox-test" not in stored[0]
    assert decrypt_token(stored[0]) == "access-sandbox-test"

    status = client.get("/api/plaid/status", headers=headers)
    assert status.status_code == 200
    assert status.json()["available"] is True
    assert status.json()["connections"] == [
        {"id": connection_id, "institution_name": "First Platypus Bank"}
    ]
    assert_no_secrets(status)


def test_sync_maps_transactions_and_skips_duplicate_ids(client, monkeypatch):
    page = plaid_page(added=[GROCERY, PAYROLL, PENDING, CREDIT_TXN])
    handler, _calls = scripted_handler(page)
    enable_plaid(monkeypatch, handler)
    headers = register(client, "ada@example.com")
    connection_id = connect(client, headers)

    synced = client.post(f"/api/plaid/items/{connection_id}/sync", headers=headers)
    assert synced.status_code == 200
    assert_no_secrets(synced)
    assert synced.json() == {"added": 2, "updated": 0, "removed": 0, "skipped": 2}

    accounts = client.get("/api/accounts", headers=headers).json()
    bank = next(account for account in accounts if account["name"] == "First Platypus Bank Plaid Checking 0000")
    assert bank["account_type"] == "checking"
    assert bank["balance_cents"] == 8750
    assert all(account["account_type"] in {"checking", "savings", "cash"} for account in accounts)
    assert all("Credit" not in account["name"] for account in accounts)

    transactions = client.get("/api/transactions", headers=headers).json()
    assert len(transactions) == 2
    grocery = next(row for row in transactions if row["description"] == "Harbor Market")
    payroll = next(row for row in transactions if row["description"] == "Payroll")
    assert grocery["amount_cents"] == -1250
    assert grocery["kind"] == "expense"
    assert grocery["category_name"] == "Groceries"
    assert grocery["account_id"] == bank["id"]
    assert payroll["amount_cents"] == 10000
    assert payroll["kind"] == "income"
    assert payroll["category_name"] == "Pay"
    assert "Pending Coffee" not in {row["description"] for row in transactions}

    categories = client.get("/api/categories", headers=headers).json()
    assert len([category for category in categories if category["name"] == "Groceries"]) == 1
    worth = client.get("/api/net-worth", headers=headers).json()
    assert worth["cash_cents"] == 8750

    again = client.post(f"/api/plaid/items/{connection_id}/sync", headers=headers)
    assert again.status_code == 200
    assert again.json()["added"] == 0
    assert again.json()["updated"] == 0
    assert len(client.get("/api/transactions", headers=headers).json()) == 2
    balances = client.get("/api/accounts", headers=headers).json()
    assert next(account["balance_cents"] for account in balances if account["id"] == bank["id"]) == 8750

    manual = client.post(
        "/api/transactions",
        headers=headers,
        json={
            "account_id": bank["id"],
            "category_id": grocery["category_id"],
            "amount_cents": 100,
            "direction": "expense",
            "description": "Manual snack",
            "occurred_on": "2026-10-06",
        },
    )
    assert manual.status_code == 201
    assert manual.json()["amount_cents"] == -100
    updated = client.get("/api/accounts", headers=headers).json()
    assert next(account["balance_cents"] for account in updated if account["id"] == bank["id"]) == 8650


def test_repeated_added_ids_do_not_change_the_balance(client, monkeypatch):
    page = plaid_page(added=[GROCERY, GROCERY])
    handler, _calls = scripted_handler(page)
    enable_plaid(monkeypatch, handler)
    headers = register(client, "ada@example.com")
    connection_id = connect(client, headers)
    synced = client.post(f"/api/plaid/items/{connection_id}/sync", headers=headers)
    assert synced.status_code == 200
    assert synced.json()["added"] == 1
    assert synced.json()["skipped"] == 1
    accounts = client.get("/api/accounts", headers=headers).json()
    bank = next(account for account in accounts if "Plaid Checking" in account["name"])
    assert bank["balance_cents"] == -1250
    assert len(client.get("/api/transactions", headers=headers).json()) == 1


def test_sync_updates_and_removes_adjust_the_balance(client, monkeypatch):
    pages = {"current": plaid_page(added=[GROCERY, PAYROLL], cursor="cursor-1")}
    handler, _calls = scripted_handler(lambda: pages["current"])
    enable_plaid(monkeypatch, handler)
    headers = register(client, "ada@example.com")
    connection_id = connect(client, headers)
    first = client.post(f"/api/plaid/items/{connection_id}/sync", headers=headers)
    assert first.status_code == 200
    assert first.json()["added"] == 2

    pages["current"] = plaid_page(
        modified=[
            {
                **GROCERY,
                "amount": 15,
            }
        ],
        removed=[{"transaction_id": "txn-payroll"}],
        cursor="cursor-2",
    )
    second = client.post(f"/api/plaid/items/{connection_id}/sync", headers=headers)
    assert second.status_code == 200
    assert second.json()["added"] == 0
    assert second.json()["updated"] == 1
    assert second.json()["removed"] == 1

    transactions = client.get("/api/transactions", headers=headers).json()
    assert [row["description"] for row in transactions] == ["Harbor Market"]
    assert transactions[0]["amount_cents"] == -1500
    accounts = client.get("/api/accounts", headers=headers).json()
    bank = next(account for account in accounts if "Plaid Checking" in account["name"])
    assert bank["balance_cents"] == -1500


def test_connections_are_private(client, tmp_path, monkeypatch):
    state = {"exchanges": 0, "synced": [], "removed": []}

    def handler(path, payload):
        if path == "/link/token/create":
            return {"link_token": "link-sandbox-test"}
        if path == "/item/public_token/exchange":
            state["exchanges"] += 1
            token = "access-sandbox-ada" if state["exchanges"] == 1 else "access-sandbox-bea"
            return {"access_token": token, "item_id": "item-shared"}
        if path == "/transactions/sync":
            state["synced"].append(payload["access_token"])
            if payload["access_token"] != "access-sandbox-ada":
                raise AssertionError("synced another user's token")
            return plaid_page(added=[GROCERY])
        if path == "/item/remove":
            state["removed"].append(payload["access_token"])
            return {"removed": True}
        raise AssertionError(path)

    enable_plaid(monkeypatch, handler)
    ada = register(client, "ada@example.com")
    bea = register(client, "bea@example.com")
    connection_id = connect(client, ada)
    synced = client.post(f"/api/plaid/items/{connection_id}/sync", headers=ada)
    assert synced.status_code == 200
    assert synced.json()["added"] == 1

    bea_exchange = client.post(
        "/api/plaid/items",
        headers=bea,
        json={"public_token": "public-sandbox-test", "institution_name": "Stolen Bank"},
    )
    assert bea_exchange.status_code == 404
    assert_no_secrets(bea_exchange)
    assert "Stolen" not in client.get("/api/plaid/status", headers=ada).text

    assert client.get("/api/plaid/status", headers=bea).json()["connections"] == []
    assert client.post(f"/api/plaid/items/{connection_id}/sync", headers=bea).status_code == 404
    assert client.delete(f"/api/plaid/items/{connection_id}", headers=bea).status_code == 404
    assert state["removed"] == []
    assert state["synced"] == ["access-sandbox-ada"]
    assert client.get("/api/transactions", headers=bea).json() == []
    assert client.get("/api/net-worth", headers=bea).json()["cash_cents"] == 0
    ada_accounts = client.get("/api/accounts", headers=ada).json()
    assert any(account["balance_cents"] == -1250 for account in ada_accounts)

    stored = sqlite3.connect(tmp_path / "test.db").execute(
        "SELECT access_token_encrypted FROM plaid_items"
    ).fetchall()
    assert len(stored) == 1
    assert decrypt_token(stored[0][0]) == "access-sandbox-ada"


def test_plaid_errors_do_not_leak_or_save_a_partial_sync(client, monkeypatch):
    monkeypatch.setenv("PLAID_CLIENT_ID", "client-test")
    monkeypatch.setenv("PLAID_SECRET", "secret-test")
    monkeypatch.setenv("PLAID_ENV", "sandbox")

    def fake_post(_url, json, headers, timeout):
        del json, headers, timeout

        class Response:
            status_code = 400

            def json(self):
                return {
                    "error_code": "INVALID_PUBLIC_TOKEN",
                    "error_message": "secret-test access-sandbox-test leaked upstream",
                }

        return Response()

    monkeypatch.setattr("app.plaid_client.httpx.post", fake_post)
    headers = register(client, "ada@example.com")
    failed = client.post(
        "/api/plaid/items",
        headers=headers,
        json={"public_token": "public-sandbox-test", "institution_name": "First Platypus Bank"},
    )
    assert failed.status_code == 400
    assert failed.json()["detail"] == "That bank connection is no longer valid. Connect the bank again."
    assert_no_secrets(failed)
    assert "leaked" not in failed.text
    assert client.get("/api/plaid/status", headers=headers).json()["connections"] == []

    def explode(*_args, **_kwargs):
        raise httpx.ConnectError("secret-test access-sandbox-test")

    monkeypatch.setattr("app.plaid_client.httpx.post", explode)
    unreachable = client.post("/api/plaid/link-token", headers=headers)
    assert unreachable.status_code == 502
    assert unreachable.json()["detail"] == "The bank connection service could not be reached."
    assert_no_secrets(unreachable)

    def handler(path, payload):
        if path == "/link/token/create":
            return {"link_token": "link-sandbox-test"}
        if path == "/item/public_token/exchange":
            return {"access_token": "access-sandbox-test", "item_id": "item-1"}
        if path == "/transactions/sync":
            raise PlaidServiceError("The bank connection service could not be reached.", 502, "")
        if path == "/item/remove":
            raise PlaidServiceError("The bank connection service could not be reached.", 502, "")
        raise AssertionError(path)

    enable_plaid(monkeypatch, handler)
    connection_id = connect(client, headers)
    broken_sync = client.post(f"/api/plaid/items/{connection_id}/sync", headers=headers)
    assert broken_sync.status_code == 502
    assert_no_secrets(broken_sync)
    names = [account["name"] for account in client.get("/api/accounts", headers=headers).json()]
    assert names == ["Cash"]
    assert client.get("/api/transactions", headers=headers).json() == []

    blocked = client.delete(f"/api/plaid/items/{connection_id}", headers=headers)
    assert blocked.status_code == 502
    assert len(client.get("/api/plaid/status", headers=headers).json()["connections"]) == 1


def test_disconnect_revokes_the_item_and_keeps_transactions(client, monkeypatch):
    removed = []

    def handler(path, payload):
        if path == "/link/token/create":
            return {"link_token": "link-sandbox-test"}
        if path == "/item/public_token/exchange":
            return {"access_token": "access-sandbox-test", "item_id": "item-1"}
        if path == "/transactions/sync":
            return plaid_page(added=[GROCERY])
        if path == "/item/remove":
            removed.append(payload["access_token"])
            raise PlaidServiceError("That bank connection was already removed.", 404, "ITEM_NOT_FOUND")
        raise AssertionError(path)

    enable_plaid(monkeypatch, handler)
    headers = register(client, "ada@example.com")
    connection_id = connect(client, headers)
    assert client.post(f"/api/plaid/items/{connection_id}/sync", headers=headers).status_code == 200
    deleted = client.delete(f"/api/plaid/items/{connection_id}", headers=headers)
    assert deleted.status_code == 204
    assert removed == ["access-sandbox-test"]
    assert client.get("/api/plaid/status", headers=headers).json()["connections"] == []
    assert client.post(f"/api/plaid/items/{connection_id}/sync", headers=headers).status_code == 404
    transactions = client.get("/api/transactions", headers=headers).json()
    assert len(transactions) == 1
    assert transactions[0]["amount_cents"] == -1250
    accounts = client.get("/api/accounts", headers=headers).json()
    assert next(account["balance_cents"] for account in accounts if "Plaid Checking" in account["name"]) == -1250


def test_synced_account_can_still_be_deleted(client, monkeypatch):
    handler, _calls = scripted_handler(plaid_page(added=[GROCERY, PAYROLL]))
    enable_plaid(monkeypatch, handler)
    headers = register(client, "ada@example.com")
    connection_id = connect(client, headers)
    assert client.post(f"/api/plaid/items/{connection_id}/sync", headers=headers).status_code == 200
    accounts = client.get("/api/accounts", headers=headers).json()
    bank = next(account for account in accounts if "Plaid Checking" in account["name"])
    cash = next(account for account in accounts if account["name"] == "Cash")

    moved = client.delete(f"/api/accounts/{bank['id']}?reassign_to={cash['id']}", headers=headers)
    assert moved.status_code == 204
    remaining = client.get("/api/accounts", headers=headers).json()
    assert [account["name"] for account in remaining] == ["Cash"]
    assert remaining[0]["balance_cents"] == 8750
    assert len(client.get("/api/transactions", headers=headers).json()) == 2

    removed = client.delete(
        f"/api/accounts/{cash['id']}?confirm=delete-transactions",
        headers=headers,
    )
    assert removed.status_code == 204
    assert client.get("/api/transactions", headers=headers).json() == []
    assert client.get("/api/net-worth", headers=headers).json()["cash_cents"] == 0
