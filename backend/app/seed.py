"""Fictional demo records.

This adds one sample user when that email is missing. It does not delete or
change rows that are already in the database.
"""

from datetime import date

from app.models import Account, Bill, Budget, Category, Holding, Transaction, User
from app.quantities import parse_quantity
from app.users import create_user

DEMO_EMAIL = "demo@moneymap.example"
DEMO_PASSWORD = "demopassword"
DEMO_BUDGET_YEAR = 2026
DEMO_BUDGET_MONTH = 10
DEMO_BUDGETS = (
    ("Groceries", 8000),
    ("Rent", 100000),
    ("Transit", 10000),
)

DEMO_TRANSACTIONS = (
    {
        "account": "Everyday Checking",
        "category": "Pay",
        "amount_cents": 250000,
        "description": "Northwind Payroll",
        "occurred_on": date(2026, 10, 1),
    },
    {
        "account": "Everyday Checking",
        "category": "Rent",
        "amount_cents": -120000,
        "description": "Maple Street Apartments",
        "occurred_on": date(2026, 10, 1),
    },
    {
        "account": "Everyday Checking",
        "category": "Groceries",
        "amount_cents": -6432,
        "description": "Harbor Market",
        "occurred_on": date(2026, 10, 3),
    },
    {
        "account": "Everyday Checking",
        "category": "Transit",
        "amount_cents": -2800,
        "description": "City Metro Card",
        "occurred_on": date(2026, 10, 5),
    },
    {
        "account": "Rainy Day Savings",
        "category": "Pay",
        "amount_cents": 50000,
        "description": "Opening deposit",
        "occurred_on": date(2026, 10, 2),
    },
    {
        "account": "Rainy Day Savings",
        "category": "Interest",
        "amount_cents": 325,
        "description": "Credit Union Interest",
        "occurred_on": date(2026, 10, 8),
    },
)


def seed_demo_data(db):
    """Insert the demo user, accounts, and transactions once."""
    existing = db.query(User).filter(User.email == DEMO_EMAIL).one_or_none()
    if existing is not None:
        return existing

    user = create_user(
        db,
        DEMO_EMAIL,
        DEMO_PASSWORD,
        account_name="Everyday Checking",
        account_type="checking",
    )
    savings = Account(
        user_id=user.id,
        name="Rainy Day Savings",
        account_type="savings",
        balance_cents=0,
    )
    interest = Category(user_id=user.id, name="Interest", kind="income")
    db.add_all([savings, interest])
    db.flush()

    accounts = {
        account.name: account
        for account in db.query(Account).filter(Account.user_id == user.id)
    }
    categories = {
        category.name: category
        for category in db.query(Category).filter(Category.user_id == user.id)
    }

    for item in DEMO_TRANSACTIONS:
        account = accounts[item["account"]]
        category = categories[item["category"]]
        account.balance_cents += item["amount_cents"]
        db.add(
            Transaction(
                user_id=user.id,
                account_id=account.id,
                category_id=category.id,
                amount_cents=item["amount_cents"],
                description=item["description"],
                occurred_on=item["occurred_on"],
            )
        )

    db.commit()
    db.refresh(user)
    return user


def seed_demo_budgets(db):
    """Add October 2026 spending limits for the demo user if they are missing.

    Existing budget rows are left unchanged.
    """
    user = db.query(User).filter(User.email == DEMO_EMAIL).one_or_none()
    if user is None:
        return

    categories = {
        category.name: category
        for category in db.query(Category).filter(Category.user_id == user.id)
    }
    added = False
    for name, limit_cents in DEMO_BUDGETS:
        category = categories.get(name)
        if category is None:
            continue
        existing = (
            db.query(Budget)
            .filter(
                Budget.user_id == user.id,
                Budget.category_id == category.id,
                Budget.year == DEMO_BUDGET_YEAR,
                Budget.month == DEMO_BUDGET_MONTH,
            )
            .one_or_none()
        )
        if existing is not None:
            continue
        db.add(
            Budget(
                user_id=user.id,
                category_id=category.id,
                year=DEMO_BUDGET_YEAR,
                month=DEMO_BUDGET_MONTH,
                limit_cents=limit_cents,
            )
        )
        added = True
    if added:
        db.commit()


def seed_demo_extras(db):
    """Add one simulated holding and one bill when those names are missing."""
    user = db.query(User).filter(User.email == DEMO_EMAIL).one_or_none()
    if user is None:
        return

    added = False
    subscriptions = (
        db.query(Category)
        .filter(Category.user_id == user.id, Category.name == "Subscriptions", Category.kind == "expense")
        .one_or_none()
    )
    if subscriptions is None:
        subscriptions = Category(user_id=user.id, name="Subscriptions", kind="expense")
        db.add(subscriptions)
        db.flush()
        added = True

    holding = (
        db.query(Holding)
        .filter(Holding.user_id == user.id, Holding.name == "Northwind Index Fund")
        .one_or_none()
    )
    if holding is None:
        db.add(
            Holding(
                user_id=user.id,
                name="Northwind Index Fund",
                quantity_scaled=parse_quantity("10"),
                purchase_price_cents=2000,
                current_price_cents=2200,
            )
        )
        added = True

    bill = db.query(Bill).filter(Bill.user_id == user.id, Bill.name == "City Stream Monthly").one_or_none()
    if bill is None:
        db.add(
            Bill(
                user_id=user.id,
                category_id=subscriptions.id,
                name="City Stream Monthly",
                amount_cents=1599,
                frequency="monthly",
                next_due_on=date(2026, 10, 20),
            )
        )
        added = True

    if added:
        db.commit()
