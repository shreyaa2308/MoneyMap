from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.months import parse_month
from app.routers.auth import get_current_user
from app.schemas import DashboardResponse
from app.summaries import dashboard_for_month

router = APIRouter(tags=["dashboard"])


@router.get("/api/dashboard", response_model=DashboardResponse)
def dashboard(
    month: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        year, month_number = parse_month(month)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Month must be YYYY-MM",
        ) from None
    return dashboard_for_month(db, user, year, month_number)
