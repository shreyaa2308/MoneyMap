from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, Holding, Transaction, User
from app.quantities import format_quantity, value_cents
from app.routers.auth import get_current_user
from app.routers.transactions import owned_account
from app.schemas import (
    AccountCreate,
    AccountResponse,
    AccountUpdate,
    HoldingResponse,
    NetWorthResponse,
)

router = APIRouter(prefix="/api", tags=["accounts"])


def _name_taken(db, user, name, ignore_id=None):
    query = db.query(Account).filter(Account.user_id == user.id, Account.name == name)
    if ignore_id is not None:
        query = query.filter(Account.id != ignore_id)
    return query.one_or_none() is not None


def holding_response(holding):
    cost = value_cents(holding.quantity_scaled, holding.purchase_price_cents)
    current = value_cents(holding.quantity_scaled, holding.current_price_cents)
    return HoldingResponse(
        id=holding.id,
        name=holding.name,
        quantity=format_quantity(holding.quantity_scaled),
        purchase_price_cents=holding.purchase_price_cents,
        current_price_cents=holding.current_price_cents,
        cost_basis_cents=cost,
        current_value_cents=current,
        gain_cents=current - cost,
    )


def net_worth_for(db, user):
    accounts = (
        db.query(Account).filter(Account.user_id == user.id).order_by(Account.name).all()
    )
    holdings = (
        db.query(Holding).filter(Holding.user_id == user.id).order_by(Holding.name).all()
    )
    holding_rows = [holding_response(holding) for holding in holdings]
    cash = sum(account.balance_cents for account in accounts)
    investments = sum(row.current_value_cents for row in holding_rows)
    return NetWorthResponse(
        cash_cents=cash,
        investments_cents=investments,
        net_worth_cents=cash + investments,
        accounts=accounts,
        holdings=holding_rows,
    )


@router.post("/accounts", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
def create_account(
    body: AccountCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if _name_taken(db, user, body.name):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You already have an account with that name")
    account = Account(
        user_id=user.id,
        name=body.name,
        account_type=body.account_type,
        balance_cents=0,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.put("/accounts/{account_id}", response_model=AccountResponse)
def update_account(
    account_id: int,
    body: AccountUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = owned_account(db, user, account_id)
    if _name_taken(db, user, body.name, ignore_id=account.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You already have an account with that name")
    account.name = body.name
    account.account_type = body.account_type
    db.commit()
    db.refresh(account)
    return account


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int,
    reassign_to: int | None = None,
    confirm: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = owned_account(db, user, account_id)
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id, Transaction.account_id == account.id)
        .all()
    )
    if transactions and reassign_to is None and confirm != "delete-transactions":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account has transactions. Move them to another account, or confirm that they should be deleted.",
        )
    if reassign_to is not None and confirm is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose either another account or deletion, not both",
        )
    if reassign_to is not None:
        if reassign_to == account.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a different account")
        target = owned_account(db, user, reassign_to)
        (
            db.query(Transaction)
            .filter(Transaction.user_id == user.id, Transaction.account_id == account.id)
            .update({Transaction.account_id: target.id}, synchronize_session=False)
        )
        target.balance_cents += account.balance_cents
        account.balance_cents = 0
    elif confirm == "delete-transactions":
        (
            db.query(Transaction)
            .filter(Transaction.user_id == user.id, Transaction.account_id == account.id)
            .delete(synchronize_session=False)
        )
    db.expire(account, ["transactions"])
    db.delete(account)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/net-worth", response_model=NetWorthResponse)
def net_worth(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cash is the sum of checking, savings, and cash balances.

    There is no liability account type. A negative balance reduces net worth.
    Simulated holdings are added once and are not copied into an account.
    """
    return net_worth_for(db, user)
