"""Environment settings.

Secrets are read from the process environment. A local `.env` file is loaded
for development and is never required for tests. This module does not print
secret values.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_JWT_SECRET = "local-dev-secret-not-for-production"
DEVELOPMENT_ENVS = {"development", "dev", "test"}
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"

_environment_loaded = False
_environment_mtime = None


def load_environment():
    """Load backend/.env, and again after that file changes.

    Values already set in the process environment are left as they are.
    A blank or missing value can be filled from the file on a later read.
    """
    global _environment_loaded, _environment_mtime
    env_path = BACKEND_DIR / ".env"
    try:
        mtime = env_path.stat().st_mtime
    except OSError:
        mtime = None
    if _environment_loaded and mtime == _environment_mtime:
        return
    load_dotenv(env_path, override=False)
    _environment_loaded = True
    _environment_mtime = mtime


def environment_name():
    load_environment()
    name = os.environ.get("MONEYMAP_ENV", "development").strip().lower()
    return name or "development"


def jwt_secret():
    """Return the token signing key. Production must not use the development default."""
    load_environment()
    secret = os.environ.get("MONEYMAP_JWT_SECRET", "").strip()
    env_name = environment_name()
    if env_name not in DEVELOPMENT_ENVS and (not secret or secret == DEFAULT_JWT_SECRET):
        raise RuntimeError(
            "Set MONEYMAP_JWT_SECRET to a private value when MONEYMAP_ENV is not development."
        )
    return secret or DEFAULT_JWT_SECRET


def openai_settings():
    """Read AI settings. An empty API key means the assistant is turned off."""
    load_environment()
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    model = os.environ.get("OPENAI_MODEL", "").strip() or DEFAULT_OPENAI_MODEL
    timeout = _bounded_float(os.environ.get("OPENAI_TIMEOUT", "20"), default=20, low=1, high=60)
    max_output_tokens = _bounded_int(
        os.environ.get("OPENAI_MAX_OUTPUT_TOKENS", "400"),
        default=400,
        low=50,
        high=800,
    )
    return {
        "api_key": api_key,
        "model": model,
        "timeout": timeout,
        "max_output_tokens": max_output_tokens,
    }


PLAID_HOSTS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}


def plaid_settings():
    """Read optional Plaid settings. Missing keys leave bank connection turned off."""
    load_environment()
    client_id = os.environ.get("PLAID_CLIENT_ID", "").strip()
    secret = os.environ.get("PLAID_SECRET", "").strip()
    env_name = os.environ.get("PLAID_ENV", "sandbox").strip().lower() or "sandbox"
    known = env_name in PLAID_HOSTS
    return {
        "client_id": client_id,
        "secret": secret,
        "env": env_name if known else "",
        "host": PLAID_HOSTS.get(env_name, ""),
        "configured": bool(client_id and secret and known),
    }


def validate_settings():
    """Fail startup when production is using an unsafe token secret."""
    jwt_secret()


def _bounded_float(value, default, low, high):
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    return min(max(number, low), high)


def _bounded_int(value, default, low, high):
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return min(max(number, low), high)
