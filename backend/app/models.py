"""Database tables.

Money is stored as integer cents. A transaction amount is signed:
1500 is $15.00 in, and -1500 is $15.00 out.
"""

from datetime import datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import mapped_column, relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = mapped_column(Integer, primary_key=True)
    email = mapped_column(String(255), unique=True, nullable=False)
    password_hash = mapped_column(String(255), nullable=False)
    created_at = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    accounts = relationship("Account", back_populates="user")
    categories = relationship("Category", back_populates="user")
    transactions = relationship("Transaction", back_populates="user")
    budgets = relationship("Budget", back_populates="user")
    holdings = relationship("Holding", back_populates="user")
    bills = relationship("Bill", back_populates="user")
    plaid_items = relationship("PlaidItem", back_populates="user")


class Account(Base):
    __tablename__ = "accounts"

    id = mapped_column(Integer, primary_key=True)
    user_id = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name = mapped_column(String(100), nullable=False)
    account_type = mapped_column(String(50), nullable=False)
    balance_cents = mapped_column(Integer, nullable=False, default=0)
    created_at = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account")


class Category(Base):
    __tablename__ = "categories"

    id = mapped_column(Integer, primary_key=True)
    user_id = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name = mapped_column(String(100), nullable=False)
    kind = mapped_column(String(20), nullable=False)
    created_at = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="categories")
    transactions = relationship("Transaction", back_populates="category")
    budgets = relationship("Budget", back_populates="category")


class Transaction(Base):
    __tablename__ = "transactions"

    id = mapped_column(Integer, primary_key=True)
    user_id = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    account_id = mapped_column(ForeignKey("accounts.id"), nullable=False, index=True)
    category_id = mapped_column(ForeignKey("categories.id"), nullable=True, index=True)
    amount_cents = mapped_column(Integer, nullable=False)
    description = mapped_column(String(255), nullable=False, default="")
    occurred_on = mapped_column(Date, nullable=False)
    created_at = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="transactions")
    account = relationship("Account", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")


class Budget(Base):
    """A spending limit for one expense category in one calendar month."""

    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "category_id",
            "year",
            "month",
            name="one_budget_per_category_month",
        ),
    )

    id = mapped_column(Integer, primary_key=True)
    user_id = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    category_id = mapped_column(ForeignKey("categories.id"), nullable=False, index=True)
    year = mapped_column(Integer, nullable=False)
    month = mapped_column(Integer, nullable=False)
    limit_cents = mapped_column(Integer, nullable=False)
    created_at = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="budgets")
    category = relationship("Category", back_populates="budgets")


class Holding(Base):
    """A manually entered investment. Prices are not fetched from a market."""

    __tablename__ = "holdings"

    id = mapped_column(Integer, primary_key=True)
    user_id = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name = mapped_column(String(100), nullable=False)
    quantity_scaled = mapped_column(Integer, nullable=False)
    purchase_price_cents = mapped_column(Integer, nullable=False)
    current_price_cents = mapped_column(Integer, nullable=False)
    created_at = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="holdings")


class Bill(Base):
    """A recurring bill. Marking it paid is a separate, explicit action."""

    __tablename__ = "bills"

    id = mapped_column(Integer, primary_key=True)
    user_id = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    category_id = mapped_column(ForeignKey("categories.id"), nullable=False, index=True)
    name = mapped_column(String(100), nullable=False)
    amount_cents = mapped_column(Integer, nullable=False)
    frequency = mapped_column(String(20), nullable=False)
    next_due_on = mapped_column(Date, nullable=False)
    created_at = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="bills")
    category = relationship("Category")
    payments = relationship("BillPayment", back_populates="bill")


class BillPayment(Base):
    """One payment for one due date. The same due date cannot be paid twice."""

    __tablename__ = "bill_payments"
    __table_args__ = (
        UniqueConstraint("bill_id", "due_on", name="one_payment_per_due_date"),
    )

    id = mapped_column(Integer, primary_key=True)
    user_id = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    bill_id = mapped_column(ForeignKey("bills.id"), nullable=False, index=True)
    transaction_id = mapped_column(ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)
    due_on = mapped_column(Date, nullable=False)
    amount_cents = mapped_column(Integer, nullable=False)
    created_at = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    bill = relationship("Bill", back_populates="payments")


class PlaidItem(Base):
    """One Plaid item for one user. The access token never leaves the server."""

    __tablename__ = "plaid_items"
    __table_args__ = (UniqueConstraint("item_id", name="one_row_per_plaid_item"),)

    id = mapped_column(Integer, primary_key=True)
    user_id = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    item_id = mapped_column(String(255), nullable=False)
    access_token_encrypted = mapped_column(Text, nullable=False)
    institution_name = mapped_column(String(255), nullable=False, default="")
    cursor = mapped_column(Text, nullable=True)
    created_at = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="plaid_items")
    account_links = relationship(
        "PlaidAccountLink",
        back_populates="plaid_item",
        cascade="all, delete-orphan",
    )
    transaction_links = relationship(
        "PlaidTransactionLink",
        back_populates="plaid_item",
        cascade="all, delete-orphan",
    )


class PlaidAccountLink(Base):
    """Maps a Plaid depository account onto an existing MoneyMap account row."""

    __tablename__ = "plaid_accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "plaid_account_id", name="one_plaid_account_per_user"),
    )

    id = mapped_column(Integer, primary_key=True)
    user_id = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    plaid_item_id = mapped_column(ForeignKey("plaid_items.id", ondelete="CASCADE"), nullable=False, index=True)
    plaid_account_id = mapped_column(String(255), nullable=False)
    account_id = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)

    plaid_item = relationship("PlaidItem", back_populates="account_links")


class PlaidTransactionLink(Base):
    """Dedup key for a synced transaction. The ledger row stays in transactions."""

    __tablename__ = "plaid_transactions"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "plaid_transaction_id",
            name="one_plaid_transaction_per_user",
        ),
    )

    id = mapped_column(Integer, primary_key=True)
    user_id = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    plaid_item_id = mapped_column(ForeignKey("plaid_items.id", ondelete="CASCADE"), nullable=False, index=True)
    plaid_transaction_id = mapped_column(String(255), nullable=False)
    transaction_id = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    plaid_item = relationship("PlaidItem", back_populates="transaction_links")
