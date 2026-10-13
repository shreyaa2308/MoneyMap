"""Turn Plaid transactions into MoneyMap ledger rows.

Plaid amounts are positive when money leaves the account. MoneyMap stores
income as a positive number of cents and expenses as a negative number.
Account balances stay the running sum of those transactions.
"""

from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app import plaid_client
from app.models import Account, BillPayment, Category, PlaidAccountLink, PlaidTransactionLink, Transaction
from app.plaid_client import PlaidServiceError
from app.token_cipher import TokenUnreadable, decrypt_token

MAX_PAGES = 50

# Starter category names already created for every user. Used only when the
# transaction direction matches that category's kind.
CATEGORY_NAMES = {
    "INCOME": ("Pay", "income"),
    "FOOD_AND_DRINK": ("Groceries", "expense"),
    "RENT_AND_UTILITIES": ("Rent", "expense"),
    "TRANSPORTATION": ("Transit", "expense"),
}


def plaid_amount_to_cents(amount):
    """Convert a Plaid dollar amount into a signed MoneyMap cent amount."""
    if isinstance(amount, bool) or amount is None:
        raise ValueError("Amount is missing")
    quantized = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    cents = int((quantized * 100).to_integral_value(rounding=ROUND_HALF_UP))
    return -cents


def sync_connection(db, user, item):
    """Pull one connection forward and commit each saved page with its cursor."""
    try:
        access_token = decrypt_token(item.access_token_encrypted)
    except TokenUnreadable:
        raise PlaidServiceError(
            "This bank connection can no longer be read. Disconnect it and connect again.",
            409,
        ) from None

    added = updated = removed = skipped = 0
    cursor = item.cursor or ""
    for _ in range(MAX_PAGES):
        payload = {"access_token": access_token, "count": 100}
        if cursor:
            payload["cursor"] = cursor
        page = plaid_client.plaid_request("/transactions/sync", payload)
        if not isinstance(page, dict):
            raise PlaidServiceError(
                "The bank connection service returned an unexpected response.",
                502,
            )
        page_added, page_updated, page_removed, page_skipped = apply_page(db, user, item, page)
        next_cursor = page.get("next_cursor") or ""
        if not isinstance(next_cursor, str):
            db.rollback()
            raise PlaidServiceError(
                "The bank connection service returned an unexpected response.",
                502,
            )
        item.cursor = next_cursor or None
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise PlaidServiceError("That sync overlapped another sync. Try again.", 409) from None
        added += page_added
        updated += page_updated
        removed += page_removed
        skipped += page_skipped
        cursor = next_cursor
        if not page.get("has_more"):
            break
    return {
        "added": added,
        "updated": updated,
        "removed": removed,
        "skipped": skipped,
    }


def apply_page(db, user, item, page):
    accounts = _accounts_for_page(db, user, item, page.get("accounts") or [])
    added = updated = removed = skipped = 0
    added_seen = set()
    for raw in page.get("added") or []:
        outcome = _upsert(db, user, item, raw, accounts, added_seen, modified=False)
        added, updated, skipped = _count(outcome, added, updated, skipped)
    modified_seen = set()
    for raw in page.get("modified") or []:
        outcome = _upsert(db, user, item, raw, accounts, modified_seen, modified=True)
        added, updated, skipped = _count(outcome, added, updated, skipped)
    for raw in page.get("removed") or []:
        outcome = _remove(db, user, raw)
        if outcome == "removed":
            removed += 1
        else:
            skipped += 1
    return added, updated, removed, skipped


def _count(outcome, added, updated, skipped):
    if outcome == "added":
        return added + 1, updated, skipped
    if outcome == "updated":
        return added, updated + 1, skipped
    return added, updated, skipped + 1


def _accounts_for_page(db, user, item, raw_accounts):
    found = {}
    for raw in raw_accounts:
        if not isinstance(raw, dict):
            continue
        plaid_account_id = raw.get("account_id")
        if not isinstance(plaid_account_id, str) or not plaid_account_id:
            continue
        account = _ensure_account(db, user, item, raw)
        if account is not None:
            found[plaid_account_id] = account

    links = (
        db.query(PlaidAccountLink)
        .filter(PlaidAccountLink.user_id == user.id)
        .all()
    )
    for link in links:
        if link.plaid_account_id in found:
            continue
        account = db.get(Account, link.account_id)
        if account is not None and account.user_id == user.id:
            found[link.plaid_account_id] = account
    return found


def _ensure_account(db, user, item, raw):
    plaid_account_id = raw.get("account_id")
    link = (
        db.query(PlaidAccountLink)
        .filter(
            PlaidAccountLink.user_id == user.id,
            PlaidAccountLink.plaid_account_id == plaid_account_id,
        )
        .one_or_none()
    )
    if link is not None:
        account = db.get(Account, link.account_id)
        if account is not None and account.user_id == user.id:
            return account
        db.delete(link)
        db.flush()

    account_type = _account_type(raw)
    if account_type is None:
        return None
    account = Account(
        user_id=user.id,
        name=_unique_name(db, user, _account_name(item.institution_name, raw)),
        account_type=account_type,
        balance_cents=0,
    )
    db.add(account)
    db.flush()
    db.add(
        PlaidAccountLink(
            user_id=user.id,
            plaid_item_id=item.id,
            plaid_account_id=plaid_account_id,
            account_id=account.id,
        )
    )
    db.flush()
    return account


def _account_type(raw):
    if raw.get("type") != "depository":
        return None
    subtype = str(raw.get("subtype") or "").lower()
    if subtype == "checking":
        return "checking"
    if subtype == "savings":
        return "savings"
    return "cash"


def _account_name(institution, raw):
    name = str(raw.get("name") or raw.get("official_name") or "Bank account").strip()
    institution = (institution or "").strip()
    if institution and institution.lower() not in name.lower():
        label = f"{institution} {name}"
    else:
        label = name
    mask = raw.get("mask")
    if isinstance(mask, str) and mask.strip():
        label = f"{label} {mask.strip()}"
    label = " ".join(label.split())
    return (label or "Bank account")[:100]


def _unique_name(db, user, desired):
    if not _name_taken(db, user, desired):
        return desired
    for suffix in range(2, 100):
        extra = f" {suffix}"
        candidate = desired[: 100 - len(extra)] + extra
        if not _name_taken(db, user, candidate):
            return candidate
    raise PlaidServiceError("A local account could not be created for that bank.", 409)


def _name_taken(db, user, name):
    return (
        db.query(Account)
        .filter(Account.user_id == user.id, Account.name == name)
        .one_or_none()
        is not None
    )


def _upsert(db, user, item, raw, accounts, seen, modified):
    parsed = _parse_transaction(raw, seen)
    if parsed is None:
        return "skipped"
    plaid_id, amount_cents, occurred, description, primary, plaid_account_id = parsed
    account = accounts.get(plaid_account_id)
    if account is None or account.user_id != user.id:
        return "skipped"

    link = (
        db.query(PlaidTransactionLink)
        .filter(
            PlaidTransactionLink.user_id == user.id,
            PlaidTransactionLink.plaid_transaction_id == plaid_id,
        )
        .one_or_none()
    )
    if link is not None and not modified:
        return "skipped"

    direction = "income" if amount_cents > 0 else "expense"
    category = _category_for(db, user, primary, direction)
    if link is None:
        transaction = Transaction(
            user_id=user.id,
            account_id=account.id,
            category_id=category.id,
            amount_cents=amount_cents,
            description=description,
            occurred_on=occurred,
        )
        account.balance_cents += amount_cents
        db.add(transaction)
        db.flush()
        db.add(
            PlaidTransactionLink(
                user_id=user.id,
                plaid_item_id=item.id,
                plaid_transaction_id=plaid_id,
                transaction_id=transaction.id,
            )
        )
        db.flush()
        return "added"

    transaction = db.get(Transaction, link.transaction_id)
    if transaction is None or transaction.user_id != user.id:
        return "skipped"
    old_account = db.get(Account, transaction.account_id)
    if old_account is None or old_account.user_id != user.id:
        return "skipped"
    old_amount = transaction.amount_cents
    if account.id == old_account.id:
        old_account.balance_cents += amount_cents - old_amount
    else:
        old_account.balance_cents -= old_amount
        account.balance_cents += amount_cents
        transaction.account_id = account.id
    transaction.category_id = category.id
    transaction.amount_cents = amount_cents
    transaction.description = description
    transaction.occurred_on = occurred
    return "updated"


def _parse_transaction(raw, seen):
    if not isinstance(raw, dict) or raw.get("pending") is True:
        return None
    plaid_id = raw.get("transaction_id")
    if not isinstance(plaid_id, str) or not plaid_id or plaid_id in seen:
        return None
    currency = raw.get("iso_currency_code")
    if currency not in (None, "USD"):
        return None
    occurred = _occurred_on(raw.get("date"))
    if occurred is None:
        return None
    try:
        amount_cents = plaid_amount_to_cents(raw.get("amount"))
    except (InvalidOperation, ValueError, ArithmeticError):
        return None
    if amount_cents == 0:
        return None
    plaid_account_id = raw.get("account_id")
    if not isinstance(plaid_account_id, str) or not plaid_account_id:
        return None
    seen.add(plaid_id)
    primary = ""
    category = raw.get("personal_finance_category")
    if isinstance(category, dict) and isinstance(category.get("primary"), str):
        primary = category["primary"]
    return plaid_id, amount_cents, occurred, _description(raw), primary, plaid_account_id


def _occurred_on(value):
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _description(raw):
    text = raw.get("merchant_name") or raw.get("name") or "Bank transaction"
    cleaned = " ".join(str(text).split())
    return (cleaned or "Bank transaction")[:255]


def _category_for(db, user, primary, direction):
    mapped = CATEGORY_NAMES.get(primary)
    if mapped is not None and mapped[1] == direction:
        name = mapped[0]
    else:
        name = _category_label(primary, direction)
    existing = (
        db.query(Category)
        .filter(
            Category.user_id == user.id,
            func.lower(Category.name) == name.lower(),
            Category.kind == direction,
        )
        .one_or_none()
    )
    if existing is not None:
        return existing
    category = Category(user_id=user.id, name=name[:100], kind=direction)
    db.add(category)
    db.flush()
    return category


def _category_label(primary, direction):
    if primary:
        words = primary.replace("_", " ").strip().lower()
        if words:
            return words[:1].upper() + words[1:]
    if direction == "income":
        return "Other income"
    return "Other expense"


def _remove(db, user, raw):
    if not isinstance(raw, dict):
        return "skipped"
    plaid_id = raw.get("transaction_id")
    if not isinstance(plaid_id, str) or not plaid_id:
        return "skipped"
    link = (
        db.query(PlaidTransactionLink)
        .filter(
            PlaidTransactionLink.user_id == user.id,
            PlaidTransactionLink.plaid_transaction_id == plaid_id,
        )
        .one_or_none()
    )
    if link is None:
        return "skipped"
    transaction = db.get(Transaction, link.transaction_id)
    db.delete(link)
    db.flush()
    if transaction is not None and transaction.user_id == user.id:
        account = db.get(Account, transaction.account_id)
        if account is not None and account.user_id == user.id:
            account.balance_cents -= transaction.amount_cents
        (
            db.query(BillPayment)
            .filter(BillPayment.user_id == user.id, BillPayment.transaction_id == transaction.id)
            .delete(synchronize_session=False)
        )
        db.delete(transaction)
        db.flush()
    return "removed"
