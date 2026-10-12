from datetime import date

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.database import create_db_engine
from app.models import Account, Base, Category, Transaction, User


@pytest.fixture
def db(tmp_path):
    engine = create_db_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield engine, session
    finally:
        session.rollback()
        session.close()
        engine.dispose()


def test_init_creates_tables(db):
    engine, _session = db
    table_names = set(inspect(engine).get_table_names())
    assert table_names == {"users", "accounts", "categories", "transactions"}


def test_foreign_keys_are_enforced(db):
    _engine, session = db
    assert session.execute(text("PRAGMA foreign_keys")).scalar() == 1

    session.add(
        Account(
            user_id=999,
            name="Missing owner",
            account_type="checking",
            balance_cents=0,
        )
    )
    with pytest.raises(IntegrityError):
        session.commit()


def test_related_rows_can_be_saved(db):
    _engine, session = db
    user = User(email="ada@example.com", password_hash="not-used-yet")
    session.add(user)
    session.flush()

    account = Account(
        user_id=user.id,
        name="Checking",
        account_type="checking",
        balance_cents=1500,
    )
    category = Category(user_id=user.id, name="Pay", kind="income")
    session.add_all([account, category])
    session.flush()

    session.add(
        Transaction(
            user_id=user.id,
            account_id=account.id,
            category_id=category.id,
            amount_cents=1500,
            description="Paycheck",
            occurred_on=date(2026, 10, 1),
        )
    )
    session.commit()

    saved = session.query(Transaction).one()
    assert saved.amount_cents == 1500
    assert isinstance(saved.amount_cents, int)
