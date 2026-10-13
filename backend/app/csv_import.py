"""Parse a transaction CSV in memory. Nothing is written to disk."""

import csv
import io
import re
from datetime import date

from app.models import Account, Category, Transaction

MAX_BYTES = 1_000_000
MAX_ROWS = 500
REQUIRED_COLUMNS = ("date", "description", "amount", "type", "category", "account")


def dollars_to_cents(value):
    text = str(value).strip().replace("$", "").replace(",", "")
    if not re.fullmatch(r"\d+(\.\d{1,2})?", text):
        raise ValueError("Amount must be a positive number of dollars, such as 12.50")
    whole, _, fraction = text.partition(".")
    cents = int(whole) * 100 + int(fraction.ljust(2, "0"))
    if cents <= 0:
        raise ValueError("Amount must be greater than zero")
    return cents


def decode_upload(data, filename):
    if filename and not filename.lower().endswith(".csv"):
        raise ValueError("Upload a .csv file")
    if len(data) > MAX_BYTES:
        raise ValueError("CSV file is larger than 1 MB")
    if not data:
        raise ValueError("CSV file is empty")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("CSV file must be UTF-8 text") from exc


def _fingerprint(account_id, category_id, amount_cents, description, occurred_on):
    return (account_id, category_id, amount_cents, description.casefold(), occurred_on)


def _existing_fingerprints(db, user):
    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id)
        .all()
    )
    return {
        _fingerprint(
            row.account_id,
            row.category_id,
            row.amount_cents,
            row.description,
            row.occurred_on,
        )
        for row in rows
    }


def parse_csv(text, db, user):
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise ValueError("CSV must include a header row")
    headers = [name.strip().lower() for name in reader.fieldnames]
    missing = [name for name in REQUIRED_COLUMNS if name not in headers]
    if missing:
        raise ValueError("CSV must include columns: " + ", ".join(REQUIRED_COLUMNS))

    accounts = db.query(Account).filter(Account.user_id == user.id).all()
    categories = db.query(Category).filter(Category.user_id == user.id).all()
    accounts_by_name = {}
    for account in accounts:
        accounts_by_name.setdefault(account.name.casefold(), []).append(account)
    categories_by_key = {}
    for category in categories:
        categories_by_key.setdefault((category.name.casefold(), category.kind), []).append(category)

    seen = _existing_fingerprints(db, user)
    rows = []
    for offset, raw in enumerate(reader, start=2):
        if offset - 1 > MAX_ROWS:
            raise ValueError(f"CSV has more than {MAX_ROWS} data rows")
        normalized = {
            (key or "").strip().lower(): (value or "").strip()
            for key, value in raw.items()
        }
        if not any(normalized.get(column) for column in REQUIRED_COLUMNS):
            continue
        rows.append(_review_row(normalized, offset, accounts_by_name, categories_by_key, seen))

    if not rows:
        raise ValueError("CSV has no data rows")
    return rows


def _review_row(raw, row_number, accounts_by_name, categories_by_key, seen):
    errors = []
    occurred_on = None
    amount_cents = None
    direction = raw.get("type", "").lower()
    description = raw.get("description", "")
    category_name = raw.get("category", "")
    account_name = raw.get("account", "")
    account = None
    category = None

    try:
        occurred_on = date.fromisoformat(raw.get("date", ""))
    except ValueError:
        errors.append("Date must be YYYY-MM-DD")

    if not description:
        errors.append("Description is required")
    elif len(description) > 255:
        errors.append("Description is too long")

    try:
        amount_cents = dollars_to_cents(raw.get("amount", ""))
    except ValueError as exc:
        errors.append(str(exc))

    if direction not in ("income", "expense"):
        errors.append("Type must be income or expense")

    matches = accounts_by_name.get(account_name.casefold(), []) if account_name else []
    if not account_name:
        errors.append("Account is required")
    elif len(matches) == 0:
        errors.append(f"No account named {account_name}")
    elif len(matches) > 1:
        errors.append(f"More than one account is named {account_name}")
    else:
        account = matches[0]

    category_matches = []
    if direction in ("income", "expense") and category_name:
        category_matches = categories_by_key.get((category_name.casefold(), direction), [])
    if not category_name:
        errors.append("Category is required")
    elif direction in ("income", "expense") and len(category_matches) == 0:
        errors.append(f"No {direction} category named {category_name}")
    elif len(category_matches) > 1:
        errors.append(f"More than one {direction} category is named {category_name}")
    elif category_matches:
        category = category_matches[0]

    signed = None
    if amount_cents is not None and direction in ("income", "expense"):
        signed = -amount_cents if direction == "expense" else amount_cents

    status = "invalid" if errors else "valid"
    if status == "valid":
        fingerprint = _fingerprint(account.id, category.id, signed, description, occurred_on)
        if fingerprint in seen:
            status = "duplicate"
            errors.append("A matching transaction already exists")
        else:
            seen.add(fingerprint)

    return {
        "row_number": row_number,
        "status": status,
        "errors": errors,
        "occurred_on": occurred_on,
        "description": description or None,
        "amount_cents": signed,
        "direction": direction if direction in ("income", "expense") else None,
        "category": category_name or None,
        "account": account_name or None,
        "account_id": account.id if account is not None and status == "valid" else None,
        "category_id": category.id if category is not None and status == "valid" else None,
    }


def counts(rows):
    return {
        "valid_count": sum(row["status"] == "valid" for row in rows),
        "invalid_count": sum(row["status"] == "invalid" for row in rows),
        "duplicate_count": sum(row["status"] == "duplicate" for row in rows),
    }
