from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.bills import advance_due, bill_status
from app.database import get_db
from app.models import Bill, BillPayment, Transaction, User
from app.routers.auth import get_current_user
from app.routers.transactions import owned_account, owned_category, to_response
from app.schemas import BillPay, BillPaymentResponse, BillResponse, BillWrite, TransactionResponse

router = APIRouter(prefix="/api/bills", tags=["bills"])


def owned_bill(db, user, bill_id):
    bill = (
        db.query(Bill)
        .options(joinedload(Bill.category), joinedload(Bill.payments))
        .filter(Bill.id == bill_id, Bill.user_id == user.id)
        .one_or_none()
    )
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    return bill


def require_expense_category(db, user, category_id):
    category = owned_category(db, user, category_id)
    if category.kind != "expense":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bills use an expense category",
        )
    return category


def to_bill(bill, today):
    paid = sorted(bill.payments, key=lambda payment: payment.due_on, reverse=True)
    return BillResponse(
        id=bill.id,
        name=bill.name,
        amount_cents=bill.amount_cents,
        frequency=bill.frequency,
        category_id=bill.category_id,
        category_name=bill.category.name,
        next_due_on=bill.next_due_on,
        status=bill_status(bill.next_due_on, today),
        last_paid_on=paid[0].due_on if paid else None,
    )


@router.get("", response_model=list[BillResponse])
def list_bills(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bills = (
        db.query(Bill)
        .options(joinedload(Bill.category), joinedload(Bill.payments))
        .filter(Bill.user_id == user.id)
        .order_by(Bill.next_due_on, Bill.name)
        .all()
    )
    today = date.today()
    return [to_bill(bill, today) for bill in bills]


@router.get("/payments", response_model=list[BillPaymentResponse])
def list_payments(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payments = (
        db.query(BillPayment)
        .options(joinedload(BillPayment.bill))
        .filter(BillPayment.user_id == user.id)
        .order_by(BillPayment.due_on.desc(), BillPayment.id.desc())
        .all()
    )
    return [
        BillPaymentResponse(
            id=payment.id,
            bill_id=payment.bill_id,
            bill_name=payment.bill.name,
            due_on=payment.due_on,
            amount_cents=payment.amount_cents,
            transaction_id=payment.transaction_id,
        )
        for payment in payments
    ]


@router.post("", response_model=BillResponse, status_code=status.HTTP_201_CREATED)
def create_bill(
    body: BillWrite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    category = require_expense_category(db, user, body.category_id)
    bill = Bill(
        user_id=user.id,
        category_id=category.id,
        name=body.name,
        amount_cents=body.amount_cents,
        frequency=body.frequency,
        next_due_on=body.next_due_on,
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)
    bill.category = category
    bill.payments = []
    return to_bill(bill, date.today())


@router.put("/{bill_id}", response_model=BillResponse)
def update_bill(
    bill_id: int,
    body: BillWrite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bill = owned_bill(db, user, bill_id)
    category = require_expense_category(db, user, body.category_id)
    bill.name = body.name
    bill.amount_cents = body.amount_cents
    bill.frequency = body.frequency
    bill.category = category
    bill.next_due_on = body.next_due_on
    db.commit()
    db.refresh(bill)
    return to_bill(bill, date.today())


@router.post("/{bill_id}/pay", response_model=TransactionResponse)
def pay_bill(
    bill_id: int,
    body: BillPay,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create one expense for this due date. This does not contact a bank."""
    bill = owned_bill(db, user, bill_id)
    account = owned_account(db, user, body.account_id)
    due_on = bill.next_due_on
    already = (
        db.query(BillPayment)
        .filter(BillPayment.bill_id == bill.id, BillPayment.due_on == due_on)
        .one_or_none()
    )
    if already is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That due date is already paid",
        )

    transaction = Transaction(
        user_id=user.id,
        account_id=account.id,
        category_id=bill.category_id,
        amount_cents=-bill.amount_cents,
        description=bill.name,
        occurred_on=due_on,
    )
    account.balance_cents -= bill.amount_cents
    db.add(transaction)
    db.flush()
    db.add(
        BillPayment(
            user_id=user.id,
            bill_id=bill.id,
            transaction_id=transaction.id,
            due_on=due_on,
            amount_cents=bill.amount_cents,
        )
    )
    bill.next_due_on = advance_due(due_on, bill.frequency)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That due date is already paid",
        ) from None
    db.refresh(transaction)
    return to_response(transaction)


@router.delete("/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bill(
    bill_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bill = owned_bill(db, user, bill_id)
    for payment in list(bill.payments):
        db.delete(payment)
    db.delete(bill)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
