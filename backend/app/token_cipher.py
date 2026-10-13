"""Encrypt Plaid access tokens before they are stored.

The key is derived from MONEYMAP_JWT_SECRET. Changing that secret makes stored
bank tokens unreadable, and those connections have to be linked again.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import jwt_secret


class TokenUnreadable(Exception):
    """The stored token cannot be decrypted. Nothing secret is included."""


def _fernet():
    digest = hashlib.sha256(jwt_secret().encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_token(token):
    if not isinstance(token, str) or not token:
        raise ValueError("Missing bank token")
    return _fernet().encrypt(token.encode("utf-8")).decode("utf-8")


def decrypt_token(stored):
    try:
        return _fernet().decrypt(stored.encode("utf-8")).decode("utf-8")
    except (InvalidToken, AttributeError, UnicodeError, TypeError) as exc:
        raise TokenUnreadable from exc
