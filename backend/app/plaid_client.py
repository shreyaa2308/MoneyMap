"""Server-side calls to Plaid. The browser never receives the client secret."""

import logging

import httpx

from app.config import plaid_settings

logger = logging.getLogger("moneymap.plaid")

PLAID_VERSION = "2020-09-14"
NOT_CONFIGURED_MESSAGE = (
    "Bank connection is off until PLAID_CLIENT_ID and PLAID_SECRET are set "
    "for the backend. The rest of MoneyMap still works."
)
UNAVAILABLE_MESSAGE = "The bank connection service could not complete that request."


class PlaidNotConfigured(Exception):
    """Credentials are missing or PLAID_ENV is not a known Plaid environment."""


class PlaidServiceError(Exception):
    """A mapped upstream failure with a message safe to show the user."""

    def __init__(self, public_message, status_code, error_code=""):
        super().__init__(public_message)
        self.public_message = public_message
        self.status_code = status_code
        self.error_code = error_code


def plaid_request(path, payload):
    """POST one Plaid endpoint. payload must not already contain the secret."""
    settings = plaid_settings()
    if not settings["configured"]:
        raise PlaidNotConfigured
    body = {
        "client_id": settings["client_id"],
        "secret": settings["secret"],
        **payload,
    }
    try:
        response = httpx.post(
            f"{settings['host']}{path}",
            json=body,
            headers={"Plaid-Version": PLAID_VERSION},
            timeout=20.0,
        )
    except httpx.HTTPError as exc:
        logger.warning("Plaid network error %s", type(exc).__name__)
        raise PlaidServiceError(
            "The bank connection service could not be reached.",
            502,
        ) from None

    if response.status_code >= 400:
        code = _error_code(response)
        logger.warning("Plaid request failed status=%s code=%s", response.status_code, code)
        if code in {"INVALID_PUBLIC_TOKEN", "INVALID_ACCESS_TOKEN", "INVALID_API_KEYS"}:
            raise PlaidServiceError(
                "That bank connection is no longer valid. Connect the bank again.",
                400,
                code,
            )
        if code == "ITEM_NOT_FOUND":
            raise PlaidServiceError("That bank connection was already removed.", 404, code)
        raise PlaidServiceError(UNAVAILABLE_MESSAGE, 502, code)

    try:
        data = response.json()
    except ValueError:
        raise PlaidServiceError(
            "The bank connection service returned an unexpected response.",
            502,
        ) from None
    if not isinstance(data, dict):
        raise PlaidServiceError(
            "The bank connection service returned an unexpected response.",
            502,
        )
    return data


def _error_code(response):
    try:
        body = response.json()
    except ValueError:
        return ""
    if not isinstance(body, dict):
        return ""
    return str(body.get("error_code") or "")
