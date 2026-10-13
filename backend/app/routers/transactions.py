from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Account, Category, Transaction, User
from app.routers.auth import get_current_user
from app.schemas import (
    AccountResponse,
    CategoryCreate,
    CategoryResponse,
    TransactionResponse,
    TransactionWrite,
)

router = APIRouter(tags=["transactions"])


def owned_account(db, user, account_id):
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == user.id)
        .one_or_none()
    )
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account


def owned_category(db, user, category_id):
    category = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == user.id)
        .one_or_none()
    )
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


def owned_transaction(db, user, transaction_id):
    transaction = (
        db.query(Transaction)
        .options(joinedload(Transaction.account), joinedload(Transaction.category))
        .filter(Transaction.id == transaction_id, Transaction.user_id == user.id)
        .one_or_none()
    )
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    return transaction


def signed_amount(amount_cents, direction):
    if direction == "expense":
        return -amount_cents
    return amount_cents


def require_matching_category(category, direction):
    if category.kind != direction:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a category that matches income or expense",
        )


def to_response(transaction):
    category = transaction.category
    return TransactionResponse(
        id=transaction.id,
        account_id=transaction.account_id,
        account_name=transaction.account.name,
        category_id=transaction.category_id,
        category_name=category.name if category is not None else None,
        kind=category.kind if category is not None else None,
        amount_cents=transaction.amount_cents,
        description=transaction.description,
        occurred_on=transaction.occurred_on,
    )


@router.get("/api/accounts", response_model=list[AccountResponse])
def list_accounts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Account)
        .filter(Account.user_id == user.id)
        .order_by(Account.name)
        .all()
    )


@router.get("/api/categories", response_model=list[CategoryResponse])
def list_categories(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Category)
        .filter(Category.user_id == user.id)
        .order_by(Category.kind, Category.name)
        .all()
    )


@router.post("/api/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    body: CategoryCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    category = Category(user_id=user.id, name=body.name, kind=body.kind)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/api/transactions", response_model=list[TransactionResponse])
def list_transactions(
    q: str | None = None,
    kind: str | None = None,
    category_id: int | None = None,
    account_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if kind not in (None, "", "income", "expense"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kind must be income or expense")

    query = (
        db.query(Transaction)
        .options(joinedload(Transaction.account), joinedload(Transaction.category))
        .filter(Transaction.user_id == user.id)
    )
    if q and q.strip():
        query = query.filter(Transaction.description.ilike(f"%{q.strip()}%"))
    if kind:
        query = query.filter(
            Transaction.category.has((Category.kind == kind) & (Category.user_id == user.id))
        )
    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if account_id is not None:
        query = query.filter(Transaction.account_id == account_id)

    transactions = query.order_by(Transaction.occurred_on.desc(), Transaction.id.desc()).all()
    return [to_response(transaction) for transaction in transactions]


@router.post("/api/transactions", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    body: TransactionWrite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = owned_account(db, user, body.account_id)
    category = owned_category(db, user, body.category_id)
    require_matching_category(category, body.direction)
    amount = signed_amount(body.amount_cents, body.direction)

    transaction = Transaction(
        user_id=user.id,
        account_id=account.id,
        category_id=category.id,
        amount_cents=amount,
        description=body.description,
        occurred_on=body.occurred_on,
    )
    account.balance_cents += amount
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return to_response(transaction)


@router.put("/api/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    body: TransactionWrite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    transaction = owned_transaction(db, user, transaction_id)
    new_account = owned_account(db, user, body.account_id)
    category = owned_category(db, user, body.category_id)
    require_matching_category(category, body.direction)
    new_amount = signed_amount(body.amount_cents, body.direction)
    old_amount = transaction.amount_cents
    old_account = transaction.account

    if new_account.id == old_account.id:
        old_account.balance_cents += new_amount - old_amount
    else:
        old_account.balance_cents -= old_amount
        new_account.balance_cents += new_amount
        transaction.account = new_account

    transaction.category = category
    transaction.amount_cents = new_amount
    transaction.description = body.description
    transaction.occurred_on = body.occurred_on
    db.commit()
    db.refresh(transaction)
    return to_response(transaction)


@router.delete("/api/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    transaction = owned_transaction(db, user, transaction_id)
    transaction.account.balance_cents -= transaction.amount_cents
    db.delete(transaction)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
