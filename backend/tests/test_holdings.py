def register(client, email):
    response = client.post("/api/auth/register", json={"email": email, "password": "password123"})
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_holding_values_are_manual_and_added_once(client):
    headers = register(client, "ada@example.com")
    created = client.post(
        "/api/holdings",
        headers=headers,
        json={
            "name": "Sample Fund",
            "quantity": "10",
            "purchase_price_cents": 2000,
            "current_price_cents": 2200,
        },
    )
    assert created.status_code == 201
    holding = created.json()
    assert holding["simulated"] is True
    assert holding["cost_basis_cents"] == 20000
    assert holding["current_value_cents"] == 22000
    assert holding["gain_cents"] == 2000

    edited = client.put(
        f"/api/holdings/{holding['id']}",
        headers=headers,
        json={
            "name": "Sample Fund",
            "quantity": "1.5",
            "purchase_price_cents": 100,
            "current_price_cents": 100,
        },
    )
    assert edited.status_code == 200
    assert edited.json()["current_value_cents"] == 150

    worth = client.get("/api/net-worth", headers=headers).json()
    assert worth["investments_cents"] == 150
    assert worth["net_worth_cents"] == worth["cash_cents"] + 150

    assert client.delete(f"/api/holdings/{holding['id']}", headers=headers).status_code == 204
    assert client.get("/api/holdings", headers=headers).json() == []
    assert client.post(
        "/api/holdings",
        headers=headers,
        json={"name": "Bad", "quantity": "-1", "purchase_price_cents": 1, "current_price_cents": 1},
    ).status_code == 422


def test_holdings_are_private(client):
    ada = register(client, "ada@example.com")
    bea = register(client, "bea@example.com")
    holding_id = client.post(
        "/api/holdings",
        headers=ada,
        json={"name": "Mine", "quantity": "1", "purchase_price_cents": 100, "current_price_cents": 100},
    ).json()["id"]
    assert client.get("/api/holdings").status_code == 401
    assert client.put(
        f"/api/holdings/{holding_id}",
        headers=bea,
        json={"name": "Theirs", "quantity": "1", "purchase_price_cents": 100, "current_price_cents": 100},
    ).status_code == 404
    assert client.delete(f"/api/holdings/{holding_id}", headers=bea).status_code == 404
    assert client.get("/api/holdings", headers=bea).json() == []
