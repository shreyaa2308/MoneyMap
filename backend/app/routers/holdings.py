from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Holding, User
from app.quantities import parse_quantity
from app.routers.accounts import holding_response
from app.routers.auth import get_current_user
from app.schemas import HoldingResponse, HoldingWrite

router = APIRouter(prefix="/api/holdings", tags=["holdings"])


def owned_holding(db, user, holding_id):
    holding = (
        db.query(Holding)
        .filter(Holding.id == holding_id, Holding.user_id == user.id)
        .one_or_none()
    )
    if holding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holding not found")
    return holding


@router.get("", response_model=list[HoldingResponse])
def list_holdings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    holdings = db.query(Holding).filter(Holding.user_id == user.id).order_by(Holding.name).all()
    return [holding_response(holding) for holding in holdings]


@router.post("", response_model=HoldingResponse, status_code=status.HTTP_201_CREATED)
def create_holding(
    body: HoldingWrite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    holding = Holding(
        user_id=user.id,
        name=body.name,
        quantity_scaled=parse_quantity(body.quantity),
        purchase_price_cents=body.purchase_price_cents,
        current_price_cents=body.current_price_cents,
    )
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return holding_response(holding)


@router.put("/{holding_id}", response_model=HoldingResponse)
def update_holding(
    holding_id: int,
    body: HoldingWrite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    holding = owned_holding(db, user, holding_id)
    holding.name = body.name
    holding.quantity_scaled = parse_quantity(body.quantity)
    holding.purchase_price_cents = body.purchase_price_cents
    holding.current_price_cents = body.current_price_cents
    db.commit()
    db.refresh(holding)
    return holding_response(holding)


@router.delete("/{holding_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holding(
    holding_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    holding = owned_holding(db, user, holding_id)
    db.delete(holding)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
