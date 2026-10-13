from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.csv_import import counts, decode_upload, parse_csv
from app.database import get_db
from app.models import Transaction, User
from app.routers.auth import get_current_user
from app.routers.transactions import owned_account, owned_category
from app.schemas import ImportResult

router = APIRouter(prefix="/api/imports", tags=["imports"])


async def uploaded_text(upload: UploadFile):
    data = await upload.read(1_000_001)
    await upload.close()
    try:
        return decode_upload(data, upload.filename or "")
    except ValueError as exc:
        code = status.HTTP_413_CONTENT_TOO_LARGE if "1 MB" in str(exc) else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from None


def statement_defaults(db, user, account_id, income_category_id, expense_category_id):
    """Optional account and categories for a bank export that lacks those columns."""
    defaults = {}
    if account_id is not None:
        defaults["account"] = owned_account(db, user, account_id)
    if income_category_id is not None:
        category = owned_category(db, user, income_category_id)
        if category.kind != "income":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Choose an income category for deposits",
            )
        defaults["income_category"] = category
    if expense_category_id is not None:
        category = owned_category(db, user, expense_category_id)
        if category.kind != "expense":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Choose an expense category for withdrawals",
            )
        defaults["expense_category"] = category
    return defaults


def reviewed_rows(text, db, user, defaults):
    try:
        rows = parse_csv(text, db, user, defaults)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
    public = [{key: value for key, value in row.items() if key not in ("account_id", "category_id")} for row in rows]
    return rows, public


@router.post("/preview", response_model=ImportResult)
async def preview_import(
    file: UploadFile = File(...),
    account_id: int | None = Form(None),
    income_category_id: int | None = Form(None),
    expense_category_id: int | None = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    text = await uploaded_text(file)
    defaults = statement_defaults(db, user, account_id, income_category_id, expense_category_id)
    _rows, public = reviewed_rows(text, db, user, defaults)
    return ImportResult(rows=public, imported_count=0, **counts(public))


@router.post("", response_model=ImportResult)
async def commit_import(
    file: UploadFile = File(...),
    account_id: int | None = Form(None),
    income_category_id: int | None = Form(None),
    expense_category_id: int | None = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save valid rows only. Invalid and duplicate rows are reported and not saved."""
    text = await uploaded_text(file)
    defaults = statement_defaults(db, user, account_id, income_category_id, expense_category_id)
    rows, public = reviewed_rows(text, db, user, defaults)
    imported = 0
    for row in rows:
        if row["status"] != "valid":
            continue
        account = owned_account(db, user, row["account_id"])
        db.add(
            Transaction(
                user_id=user.id,
                account_id=account.id,
                category_id=row["category_id"],
                amount_cents=row["amount_cents"],
                description=row["description"],
                occurred_on=row["occurred_on"],
            )
        )
        account.balance_cents += row["amount_cents"]
        imported += 1
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The import could not be saved. No rows from this file were added.",
        ) from None
    return ImportResult(rows=public, imported_count=imported, **counts(public))
