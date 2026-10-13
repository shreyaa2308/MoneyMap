"""Parse a transaction CSV in memory. Nothing is written to disk.

The original MoneyMap columns still work. A bank export can use common
headers instead, and account or category can be supplied when those columns
are absent.
"""

import csv
import io
import re
from datetime import date

from app.models import Account, Category, Transaction

MAX_BYTES = 1_000_000
MAX_ROWS = 500

HEADER_ALIASES = {
    "date": "date",
    "transaction date": "date",
    "trans date": "date",
    "posted date": "date",
    "posting date": "date",
    "post date": "date",
    "description": "description",
    "memo": "description",
    "details": "description",
    "narrative": "description",
    "payee": "description",
    "amount": "amount",
    "transaction amount": "amount",
    "type": "type",
    "transaction type": "type",
    "trans type": "type",
    "category": "category",
    "account": "account",
    "account name": "account",
    "debit": "debit",
    "withdrawal": "debit",
    "credit": "credit",
    "deposit": "credit",
}

INCOME_TYPES = {"income", "credit", "credits", "deposit", "deposits", "cr"}
EXPENSE_TYPES = {
    "expense",
    "debit",
    "debits",
    "withdrawal",
    "withdrawals",
    "withdraw",
    "dr",
    "purchase",
    "payment",
}
DATE_ERROR = "Date must be YYYY-MM-DD or MM/DD/YYYY"
AMOUNT_ERROR = "Amount must be a positive number of dollars, such as 12.50"


def dollars_to_cents(value):
    """Parse a positive dollar amount. A leading minus or parentheses is rejected."""
    signed = _signed_cents(value)
    if signed < 0:
        raise ValueError(AMOUNT_ERROR)
    return signed


def decode_upload(data, filename):
    if not filename or not str(filename).lower().endswith(".csv"):
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
    rows = db.query(Transaction).filter(Transaction.user_id == user.id).all()
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


def _canonical_headers(fieldnames):
    found = []
    for name in fieldnames:
        header = (name or "").strip().lower()
        canonical = HEADER_ALIASES.get(header)
        if canonical is None:
            continue
        if canonical in found:
            raise ValueError(f"CSV has more than one {canonical} column")
        found.append(canonical)
    if "date" not in found or "description" not in found:
        raise ValueError(
            "CSV must include a date and a description. "
            "Date headers: date, transaction date, posted date, posting date. "
            "Description headers: description, memo, details, payee."
        )
    if "amount" not in found and "debit" not in found and "credit" not in found:
        raise ValueError("CSV must include an amount column, or debit and credit columns.")
    return found


def _canonical_row(raw):
    normalized = {}
    for key, value in raw.items():
        header = (key or "").strip().lower()
        canonical = HEADER_ALIASES.get(header)
        if canonical is None:
            continue
        normalized[canonical] = (value or "").strip()
    return normalized


def _signed_cents(value):
    text = str(value).strip()
    if not text or text == "-":
        raise ValueError(AMOUNT_ERROR)
    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1].strip()
    text = text.replace("$", "").replace(",", "").replace(" ", "")
    if text.startswith("+"):
        text = text[1:]
    if text.startswith("-"):
        negative = True
        text = text[1:]
    if not re.fullmatch(r"\d+(\.\d{1,2})?", text):
        raise ValueError(AMOUNT_ERROR)
    whole, _, fraction = text.partition(".")
    cents = int(whole) * 100 + int(fraction.ljust(2, "0"))
    if cents <= 0:
        raise ValueError("Amount must be greater than zero")
    return -cents if negative else cents


def _blank_money(value):
    text = (value or "").strip()
    if text in {"", "-", "$0", "$0.00", "0", "0.0", "0.00", "$0.0"}:
        return ""
    return text


def _parse_date(value):
    text = (value or "").strip()
    iso_prefix = text[:10]
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", iso_prefix) and (
        len(text) == 10 or (len(text) > 10 and text[10] in " T")
    ):
        try:
            return date.fromisoformat(iso_prefix)
        except ValueError as exc:
            raise ValueError(DATE_ERROR) from exc
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", text)
    if not match:
        raise ValueError(DATE_ERROR)
    month, day, year = (int(part) for part in match.groups())
    try:
        return date(year, month, day)
    except ValueError as exc:
        raise ValueError(DATE_ERROR) from exc


def _resolve_amount(raw):
    """Return direction and the signed cents stored by MoneyMap."""
    debit = _blank_money(raw.get("debit", ""))
    credit = _blank_money(raw.get("credit", ""))
    if debit or credit:
        if debit and credit:
            raise ValueError("Use either a debit or a credit, not both")
        if debit:
            return "expense", -abs(_signed_cents(debit))
        return "income", abs(_signed_cents(credit))

    amount_text = raw.get("amount", "")
    if not str(amount_text).strip():
        raise ValueError("Amount is required")
    signed = _signed_cents(amount_text)
    type_text = raw.get("type", "").strip().lower()
    if type_text in INCOME_TYPES:
        if signed < 0:
            raise ValueError("Income amount must be positive")
        return "income", signed
    if type_text in EXPENSE_TYPES:
        return "expense", -abs(signed)
    if not type_text:
        if signed < 0:
            return "expense", signed
        return "income", signed
    raise ValueError("Type must be income or expense")


def parse_csv(text, db, user, defaults=None):
    """Review every data row. defaults supplies account and categories when columns are absent."""
    defaults = defaults or {}
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise ValueError("CSV must include a header row")
    headers = _canonical_headers(reader.fieldnames)

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
        normalized = _canonical_row(raw)
        if not any(normalized.values()):
            continue
        rows.append(
            _review_row(
                normalized,
                offset,
                accounts_by_name,
                categories_by_key,
                seen,
                defaults,
                "account" in headers,
                "category" in headers,
            )
        )

    if not rows:
        raise ValueError("CSV has no data rows")
    return rows


def _lookup_named(label, name, groups, missing_message, duplicate_message):
    if not name:
        return None, missing_message
    matches = groups.get(name.casefold(), [])
    if len(matches) == 0:
        return None, label
    if len(matches) > 1:
        return None, duplicate_message
    return matches[0], None


def _review_row(raw, row_number, accounts_by_name, categories_by_key, seen, defaults, has_account_column, has_category_column):
    errors = []
    occurred_on = None
    amount_cents = None
    direction = None
    description = raw.get("description", "")
    category_name = raw.get("category", "")
    account_name = raw.get("account", "")
    account = None
    category = None

    try:
        occurred_on = _parse_date(raw.get("date", ""))
    except ValueError as exc:
        errors.append(str(exc))

    if not description:
        errors.append("Description is required")
    elif len(description) > 255:
        errors.append("Description is too long")

    try:
        direction, amount_cents = _resolve_amount(raw)
    except ValueError as exc:
        errors.append(str(exc))

    if has_account_column or account_name:
        account, account_error = _lookup_named(
            f"No account named {account_name}",
            account_name,
            accounts_by_name,
            "Account is required",
            f"More than one account is named {account_name}",
        )
        if account_error:
            errors.append(account_error)
    elif defaults.get("account") is not None:
        account = defaults["account"]
        account_name = account.name
    else:
        errors.append("Account is required. Choose an account for this statement or add an account column.")

    if has_category_column or category_name:
        if direction in ("income", "expense"):
            category, category_error = _lookup_named(
                f"No {direction} category named {category_name}",
                category_name,
                {key[0]: groups for key, groups in categories_by_key.items() if key[1] == direction},
                "Category is required",
                f"More than one {direction} category is named {category_name}",
            )
            if category_error:
                errors.append(category_error)
        elif not category_name:
            errors.append("Category is required")
    elif direction == "income" and defaults.get("income_category") is not None:
        category = defaults["income_category"]
        category_name = category.name
    elif direction == "expense" and defaults.get("expense_category") is not None:
        category = defaults["expense_category"]
        category_name = category.name
    elif direction in ("income", "expense"):
        errors.append(
            f"Category is required. Choose an {direction} category or add a category column."
        )
    else:
        errors.append("Category is required")

    status = "invalid" if errors else "valid"
    if status == "valid":
        fingerprint = _fingerprint(account.id, category.id, amount_cents, description, occurred_on)
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
        "amount_cents": amount_cents,
        "direction": direction,
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
