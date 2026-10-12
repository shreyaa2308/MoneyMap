from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db, init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="MoneyMap", lifespan=lifespan)


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    """Report that the API and the database connection are working."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}
