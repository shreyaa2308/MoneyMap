"""Create a user and the starter records that transactions need."""

from app.models import Account, Category, User
from app.security import hash_password

STARTER_CATEGORIES = (
    ("Pay", "income"),
    ("Groceries", "expense"),
    ("Rent", "expense"),
    ("Transit", "expense"),
)


def create_user(db, email, password, account_name="Cash", account_type="cash"):
    """Add a user, one account, and starter categories. Does not commit."""
    user = User(email=email, password_hash=hash_password(password))
    db.add(user)
    db.flush()

    db.add(
        Account(
            user_id=user.id,
            name=account_name,
            account_type=account_type,
            balance_cents=0,
        )
    )
    for name, kind in STARTER_CATEGORIES:
        db.add(Category(user_id=user.id, name=name, kind=kind))
    db.flush()
    return user
