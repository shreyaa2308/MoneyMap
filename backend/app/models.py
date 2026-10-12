"""Initial database tables.

These tables store the app's future data. Nothing in this file creates
users, accounts, or transactions. Login and money features come later.

Money is stored as integer cents. A transaction amount is signed:
1500 is $15.00 in, and -1500 is $15.00 out.
"""

from datetime import datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
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
