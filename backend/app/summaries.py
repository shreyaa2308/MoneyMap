"""Month totals for the signed-in user.

Income is the sum of positive amounts. Expenses are the sum of negative
amounts, stored here as a positive number of cents. There is no transfer
type in the current transaction model, so every saved amount counts.
"""

from sqlalchemy import func
from sqlalchemy.orm import joinedload

from app.models import Budget, Category, Transaction
from app.months import format_month, month_bounds, months_ending_at


def percent_used(spent_cents, limit_cents):
    if limit_cents <= 0:
        return 0
    return (spent_cents * 100) // limit_cents


def budget_status(percent):
    if percent >= 100:
        return "over"
    if percent >= 80:
        return "approaching"
    return "under"


def _month_filters(user_id, start, end):
    return (
        Transaction.user_id == user_id,
        Transaction.occurred_on >= start,
        Transaction.occurred_on < end,
    )


def income_and_expenses(db, user_id, start, end):
    income = db.query(func.coalesce(func.sum(Transaction.amount_cents), 0)).filter(
        *_month_filters(user_id, start, end),
        Transaction.amount_cents > 0,
    ).scalar()
    signed_expenses = db.query(func.coalesce(func.sum(Transaction.amount_cents), 0)).filter(
        *_month_filters(user_id, start, end),
        Transaction.amount_cents < 0,
    ).scalar()
    income_cents = int(income)
    expense_cents = int(-signed_expenses)
    return income_cents, expense_cents, income_cents - expense_cents


def spending_by_category(db, user_id, start, end):
    rows = (
        db.query(Category.id, Category.name, func.sum(Transaction.amount_cents))
        .join(Category, Category.id == Transaction.category_id)
        .filter(
            *_month_filters(user_id, start, end),
            Category.user_id == user_id,
            Category.kind == "expense",
            Transaction.amount_cents < 0,
        )
        .group_by(Category.id, Category.name)
        .all()
    )
    spending = [
        {
            "category_id": category_id,
            "category_name": name,
            "spent_cents": int(-total),
        }
        for category_id, name, total in rows
    ]
    spending.sort(key=lambda item: (-item["spent_cents"], item["category_name"].lower()))
    return spending


def spent_by_category_id(db, user_id, start, end):
    return {
        item["category_id"]: item["spent_cents"]
        for item in spending_by_category(db, user_id, start, end)
    }


def budget_progress(db, user, year, month):
    start, end = month_bounds(year, month)
    spent = spent_by_category_id(db, user.id, start, end)
    budgets = (
        db.query(Budget)
        .options(joinedload(Budget.category))
        .filter(Budget.user_id == user.id, Budget.year == year, Budget.month == month)
        .all()
    )
    rows = []
    for budget in budgets:
        spent_cents = spent.get(budget.category_id, 0)
        percent = percent_used(spent_cents, budget.limit_cents)
        rows.append(
            {
                "id": budget.id,
                "category_id": budget.category_id,
                "category_name": budget.category.name,
                "month": format_month(year, month),
                "limit_cents": budget.limit_cents,
                "spent_cents": spent_cents,
                "remaining_cents": budget.limit_cents - spent_cents,
                "percent_used": percent,
                "status": budget_status(percent),
            }
        )
    rows.sort(key=lambda item: item["category_name"].lower())
    return rows


def recent_transactions(db, user_id, start, end, limit=5):
    transactions = (
        db.query(Transaction)
        .options(joinedload(Transaction.account), joinedload(Transaction.category))
        .filter(*_month_filters(user_id, start, end))
        .order_by(Transaction.occurred_on.desc(), Transaction.id.desc())
        .limit(limit)
        .all()
    )
    rows = []
    for transaction in transactions:
        category = transaction.category
        rows.append(
            {
                "id": transaction.id,
                "account_id": transaction.account_id,
                "account_name": transaction.account.name,
                "category_id": transaction.category_id,
                "category_name": category.name if category is not None else None,
                "kind": category.kind if category is not None else None,
                "amount_cents": transaction.amount_cents,
                "description": transaction.description,
                "occurred_on": transaction.occurred_on,
            }
        )
    return rows


def monthly_comparison(db, user_id, year, month, count=6):
    rows = []
    for cursor_year, cursor_month in months_ending_at(year, month, count):
        start, end = month_bounds(cursor_year, cursor_month)
        income_cents, expense_cents, _net = income_and_expenses(db, user_id, start, end)
        rows.append(
            {
                "month": format_month(cursor_year, cursor_month),
                "income_cents": income_cents,
                "expenses_cents": expense_cents,
            }
        )
    return rows


def dashboard_for_month(db, user, year, month):
    start, end = month_bounds(year, month)
    income_cents, expense_cents, net_cents = income_and_expenses(db, user.id, start, end)
    return {
        "month": format_month(year, month),
        "total_income_cents": income_cents,
        "total_expenses_cents": expense_cents,
        "net_cents": net_cents,
        "spending_by_category": spending_by_category(db, user.id, start, end),
        "budgets": budget_progress(db, user, year, month),
        "recent_transactions": recent_transactions(db, user.id, start, end),
        "monthly_comparison": monthly_comparison(db, user.id, year, month),
    }
