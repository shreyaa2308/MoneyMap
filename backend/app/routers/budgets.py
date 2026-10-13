from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Budget, Category, User
from app.months import parse_month
from app.routers.auth import get_current_user
from app.schemas import BudgetCreate, BudgetResponse, BudgetUpdate
from app.summaries import budget_progress

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


def require_month(value):
    try:
        return parse_month(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Month must be YYYY-MM",
        ) from None


def owned_expense_category(db, user, category_id):
    category = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == user.id)
        .one_or_none()
    )
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    if category.kind != "expense":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Budgets are for spending categories",
        )
    return category


def owned_budget(db, user, budget_id):
    budget = (
        db.query(Budget)
        .filter(Budget.id == budget_id, Budget.user_id == user.id)
        .one_or_none()
    )
    if budget is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found")
    return budget


def one_budget(db, user, year, month, budget_id):
    rows = budget_progress(db, user, year, month)
    for row in rows:
        if row["id"] == budget_id:
            return BudgetResponse(**row)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found")


@router.get("", response_model=list[BudgetResponse])
def list_budgets(
    month: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    year, month_number = require_month(month)
    return budget_progress(db, user, year, month_number)


@router.post("", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED)
def create_budget(
    body: BudgetCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    category = owned_expense_category(db, user, body.category_id)
    year, month_number = require_month(body.month)
    existing = (
        db.query(Budget)
        .filter(
            Budget.user_id == user.id,
            Budget.category_id == category.id,
            Budget.year == year,
            Budget.month == month_number,
        )
        .one_or_none()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A budget for that category and month already exists",
        )

    budget = Budget(
        user_id=user.id,
        category_id=category.id,
        year=year,
        month=month_number,
        limit_cents=body.limit_cents,
    )
    db.add(budget)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A budget for that category and month already exists",
        ) from None
    db.refresh(budget)
    return one_budget(db, user, year, month_number, budget.id)


@router.put("/{budget_id}", response_model=BudgetResponse)
def update_budget(
    budget_id: int,
    body: BudgetUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    budget = owned_budget(db, user, budget_id)
    budget.limit_cents = body.limit_cents
    db.commit()
    return one_budget(db, user, budget.year, budget.month, budget.id)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(
    budget_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    budget = owned_budget(db, user, budget_id)
    db.delete(budget)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
