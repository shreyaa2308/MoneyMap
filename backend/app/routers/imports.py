from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.csv_import import counts, decode_upload, parse_csv
from app.database import get_db
from app.models import Transaction, User
from app.routers.auth import get_current_user
from app.routers.transactions import owned_account
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


def reviewed_rows(text, db, user):
    try:
        rows = parse_csv(text, db, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
    public = [{key: value for key, value in row.items() if key not in ("account_id", "category_id")} for row in rows]
    return rows, public


@router.post("/preview", response_model=ImportResult)
async def preview_import(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    text = await uploaded_text(file)
    _rows, public = reviewed_rows(text, db, user)
    return ImportResult(rows=public, imported_count=0, **counts(public))


@router.post("", response_model=ImportResult)
async def commit_import(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save valid rows only. Invalid and duplicate rows are skipped."""
    text = await uploaded_text(file)
    rows, public = reviewed_rows(text, db, user)
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
    db.commit()
    return ImportResult(rows=public, imported_count=imported, **counts(public))
