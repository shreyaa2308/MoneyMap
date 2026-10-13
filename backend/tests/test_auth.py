def register(client, email="ada@example.com", password="password123"):
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    assert response.status_code == 201
    return response.json()


def test_health_stays_public(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_register_and_me(client):
    body = register(client)
    assert body["email"] == "ada@example.com"
    assert body["token_type"] == "bearer"
    assert body["access_token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.com"


def test_register_rejects_duplicate_email_and_short_password(client):
    register(client, email="Ada@Example.com")
    duplicate = client.post(
        "/api/auth/register",
        json={"email": "ada@example.com", "password": "password123"},
    )
    assert duplicate.status_code == 409

    short = client.post(
        "/api/auth/register",
        json={"email": "new@example.com", "password": "short"},
    )
    assert short.status_code == 422


def test_login_and_wrong_password(client):
    register(client)
    success = client.post(
        "/api/auth/login",
        json={"email": "ada@example.com", "password": "password123"},
    )
    assert success.status_code == 200
    assert success.json()["access_token"]

    wrong = client.post(
        "/api/auth/login",
        json={"email": "ada@example.com", "password": "not-the-password"},
    )
    missing = client.post(
        "/api/auth/login",
        json={"email": "missing@example.com", "password": "password123"},
    )
    assert wrong.status_code == 401
    assert missing.status_code == 401
    assert wrong.json()["detail"] == missing.json()["detail"]


def test_protected_route_requires_a_token(client):
    missing = client.get("/api/auth/me")
    invalid = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert missing.status_code == 401
    assert invalid.status_code == 401
    assert client.get("/api/transactions").status_code == 401
