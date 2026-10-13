import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db, init_db
from app.routers.accounts import router as accounts_router
from app.routers.auth import router as auth_router
from app.routers.bills import router as bills_router
from app.routers.budgets import router as budgets_router
from app.routers.dashboard import router as dashboard_router
from app.routers.holdings import router as holdings_router
from app.routers.imports import router as imports_router
from app.routers.transactions import router as transactions_router
from app.seed import seed_demo_budgets, seed_demo_data, seed_demo_extras


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if os.environ.get("MONEYMAP_SKIP_SEED") != "1":
        db = SessionLocal()
        try:
            seed_demo_data(db)
            seed_demo_budgets(db)
            seed_demo_extras(db)
        finally:
            db.close()
    yield


app = FastAPI(title="MoneyMap", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(transactions_router)
app.include_router(accounts_router)
app.include_router(holdings_router)
app.include_router(bills_router)
app.include_router(imports_router)
app.include_router(budgets_router)
app.include_router(dashboard_router)


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    """Report that the API and the database connection are working."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}
