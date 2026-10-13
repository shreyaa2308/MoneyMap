"""Optional Plaid sandbox connection. Access tokens stay on the server."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app import plaid_client
from app.config import plaid_settings
from app.database import get_db
from app.models import PlaidItem, User
from app.plaid_client import NOT_CONFIGURED_MESSAGE, PlaidNotConfigured, PlaidServiceError
from app.plaid_sync import sync_connection
from app.routers.auth import get_current_user
from app.schemas import (
    PlaidConnectionResponse,
    PlaidExchangeRequest,
    PlaidExchangeResponse,
    PlaidLinkTokenResponse,
    PlaidStatusResponse,
    PlaidSyncResponse,
)
from app.token_cipher import TokenUnreadable, decrypt_token, encrypt_token

router = APIRouter(prefix="/api/plaid", tags=["plaid"])

AVAILABLE_MESSAGE = (
    "Connect a sandbox bank with Plaid Link. MoneyMap receives transactions only. "
    "Checking and savings can be imported. Credit cards and loans are not."
)


def _configured():
    if not plaid_settings()["configured"]:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=NOT_CONFIGURED_MESSAGE)


def _call_plaid(path, payload):
    try:
        return plaid_client.plaid_request(path, payload)
    except PlaidNotConfigured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=NOT_CONFIGURED_MESSAGE,
        ) from None
    except PlaidServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.public_message) from None


def _owned_connection(db, user, connection_id):
    item = (
        db.query(PlaidItem)
        .filter(PlaidItem.id == connection_id, PlaidItem.user_id == user.id)
        .one_or_none()
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bank connection not found")
    return item


def _connection_response(item):
    name = item.institution_name.strip() or "Connected bank"
    return PlaidConnectionResponse(id=item.id, institution_name=name)


@router.get("/status", response_model=PlaidStatusResponse)
def plaid_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Say whether Plaid is configured. This does not call Plaid or reveal secrets."""
    items = (
        db.query(PlaidItem)
        .filter(PlaidItem.user_id == user.id)
        .order_by(PlaidItem.institution_name, PlaidItem.id)
        .all()
    )
    configured = plaid_settings()["configured"]
    return PlaidStatusResponse(
        available=configured,
        message=AVAILABLE_MESSAGE if configured else NOT_CONFIGURED_MESSAGE,
        connections=[_connection_response(item) for item in items],
    )


@router.post("/link-token", response_model=PlaidLinkTokenResponse)
def create_link_token(user: User = Depends(get_current_user)):
    _configured()
    data = _call_plaid(
        "/link/token/create",
        {
            "client_name": "MoneyMap",
            "language": "en",
            "country_codes": ["US"],
            "user": {"client_user_id": str(user.id)},
            "products": ["transactions"],
            "account_filters": {
                "depository": {"account_subtypes": ["checking", "savings"]},
            },
        },
    )
    link_token = data.get("link_token")
    if not isinstance(link_token, str) or not link_token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The bank connection service returned an unexpected response.",
        )
    return PlaidLinkTokenResponse(link_token=link_token)


@router.post("/items", response_model=PlaidExchangeResponse, status_code=status.HTTP_201_CREATED)
def exchange_public_token(
    body: PlaidExchangeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _configured()
    data = _call_plaid("/item/public_token/exchange", {"public_token": body.public_token})
    access_token = data.get("access_token")
    item_id = data.get("item_id")
    if not isinstance(access_token, str) or not access_token or not isinstance(item_id, str) or not item_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The bank connection service returned an unexpected response.",
        )
    existing = db.query(PlaidItem).filter(PlaidItem.item_id == item_id).one_or_none()
    if existing is not None and existing.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bank connection not found")
    encrypted = encrypt_token(access_token)
    if existing is None:
        existing = PlaidItem(
            user_id=user.id,
            item_id=item_id,
            access_token_encrypted=encrypted,
            institution_name=body.institution_name,
        )
        db.add(existing)
    else:
        existing.access_token_encrypted = encrypted
        if body.institution_name:
            existing.institution_name = body.institution_name
    db.commit()
    db.refresh(existing)
    return _connection_response(existing)


@router.post("/items/{connection_id}/sync", response_model=PlaidSyncResponse)
def sync_item(
    connection_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _configured()
    item = _owned_connection(db, user, connection_id)
    try:
        result = sync_connection(db, user, item)
    except PlaidNotConfigured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=NOT_CONFIGURED_MESSAGE,
        ) from None
    except PlaidServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.public_message) from None
    return result


@router.delete("/items/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_item(
    connection_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke the Plaid item when possible. Saved transactions stay in MoneyMap."""
    item = _owned_connection(db, user, connection_id)
    if plaid_settings()["configured"]:
        try:
            access_token = decrypt_token(item.access_token_encrypted)
        except TokenUnreadable:
            access_token = ""
        if access_token:
            try:
                plaid_client.plaid_request("/item/remove", {"access_token": access_token})
            except PlaidNotConfigured:
                pass
            except PlaidServiceError as exc:
                if exc.error_code != "ITEM_NOT_FOUND":
                    raise HTTPException(status_code=exc.status_code, detail=exc.public_message) from None
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
