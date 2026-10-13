import pytest

from app.config import DEFAULT_JWT_SECRET, jwt_secret


def test_development_allows_the_local_secret(monkeypatch):
    monkeypatch.setenv("MONEYMAP_ENV", "development")
    monkeypatch.delenv("MONEYMAP_JWT_SECRET", raising=False)
    assert jwt_secret() == DEFAULT_JWT_SECRET


def test_production_rejects_the_local_secret(monkeypatch):
    monkeypatch.setenv("MONEYMAP_ENV", "production")
    monkeypatch.delenv("MONEYMAP_JWT_SECRET", raising=False)
    with pytest.raises(RuntimeError):
        jwt_secret()


def test_production_accepts_a_private_secret(monkeypatch):
    monkeypatch.setenv("MONEYMAP_ENV", "production")
    monkeypatch.setenv("MONEYMAP_JWT_SECRET", "private-test-secret")
    assert jwt_secret() == "private-test-secret"
