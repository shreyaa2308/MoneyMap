"""Password hashing and login tokens.

MONEYMAP_JWT_SECRET can be set in the environment. Outside development, the
local default is rejected.
"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import jwt_secret

JWT_ALGORITHM = "HS256"
TOKEN_LIFETIME = timedelta(days=7)


def hash_password(password):
    password_bytes = password.encode("utf-8")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(password, password_hash):
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id):
    expires_at = datetime.now(timezone.utc) + TOKEN_LIFETIME
    payload = {"sub": str(user_id), "exp": expires_at}
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_access_token(token):
    return jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGORITHM])
