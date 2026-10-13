from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def normalize_email(value):
    email = value.strip().lower()
    if "@" not in email or email.startswith("@") or email.endswith("@") or " " in email:
        raise ValueError("Enter a valid email address")
    if len(email) > 255:
        raise ValueError("Email is too long")
    return email


class RegisterRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def check_email(cls, value):
        return normalize_email(value)

    @field_validator("password")
    @classmethod
    def check_password(cls, value):
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password is too long")
        return value


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def check_email(cls, value):
        return normalize_email(value)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str


class UserResponse(BaseModel):
    id: int
    email: str

    model_config = ConfigDict(from_attributes=True)


class AccountResponse(BaseModel):
    id: int
    name: str
    account_type: str
    balance_cents: int

    model_config = ConfigDict(from_attributes=True)


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    account_type: Literal["checking", "savings", "cash"]

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Account name is required")
        return cleaned


class AccountUpdate(AccountCreate):
    pass


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: Literal["income", "expense"]

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Category name is required")
        return cleaned


class CategoryResponse(BaseModel):
    id: int
    name: str
    kind: Literal["income", "expense"]

    model_config = ConfigDict(from_attributes=True)


class TransactionWrite(BaseModel):
    account_id: int
    category_id: int
    amount_cents: int = Field(gt=0)
    direction: Literal["income", "expense"]
    description: str
    occurred_on: date

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Description is required")
        if len(cleaned) > 255:
            raise ValueError("Description is too long")
        return cleaned


class BudgetCreate(BaseModel):
    category_id: int
    month: str
    limit_cents: int = Field(gt=0)

    @field_validator("month")
    @classmethod
    def check_month(cls, value):
        from app.months import parse_month

        parse_month(value)
        return value


class BudgetUpdate(BaseModel):
    limit_cents: int = Field(gt=0)


class BudgetResponse(BaseModel):
    id: int
    category_id: int
    category_name: str
    month: str
    limit_cents: int
    spent_cents: int
    remaining_cents: int
    percent_used: int
    status: Literal["under", "approaching", "over"]


class SpendingSlice(BaseModel):
    category_id: int
    category_name: str
    spent_cents: int


class MonthComparison(BaseModel):
    month: str
    income_cents: int
    expenses_cents: int


class DashboardResponse(BaseModel):
    month: str
    total_income_cents: int
    total_expenses_cents: int
    net_cents: int
    spending_by_category: list[SpendingSlice]
    budgets: list[BudgetResponse]
    recent_transactions: list["TransactionResponse"]
    monthly_comparison: list[MonthComparison]


class HoldingWrite(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    quantity: str
    purchase_price_cents: int = Field(gt=0)
    current_price_cents: int = Field(gt=0)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Holding name is required")
        return cleaned

    @field_validator("quantity")
    @classmethod
    def check_quantity(cls, value):
        from app.quantities import parse_quantity

        parse_quantity(value)
        return value.strip()


class HoldingResponse(BaseModel):
    id: int
    name: str
    quantity: str
    purchase_price_cents: int
    current_price_cents: int
    cost_basis_cents: int
    current_value_cents: int
    gain_cents: int
    simulated: bool = True


class NetWorthResponse(BaseModel):
    cash_cents: int
    investments_cents: int
    net_worth_cents: int
    accounts: list[AccountResponse]
    holdings: list[HoldingResponse]


class BillWrite(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    amount_cents: int = Field(gt=0)
    frequency: Literal["weekly", "monthly", "yearly"]
    category_id: int
    next_due_on: date

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Bill name is required")
        return cleaned


class BillPay(BaseModel):
    account_id: int


class BillResponse(BaseModel):
    id: int
    name: str
    amount_cents: int
    frequency: Literal["weekly", "monthly", "yearly"]
    category_id: int
    category_name: str
    next_due_on: date
    status: Literal["upcoming", "overdue"]
    last_paid_on: date | None


class BillPaymentResponse(BaseModel):
    id: int
    bill_id: int
    bill_name: str
    due_on: date
    amount_cents: int
    transaction_id: int | None
    status: Literal["paid"] = "paid"


class ImportRow(BaseModel):
    row_number: int
    status: Literal["valid", "invalid", "duplicate"]
    errors: list[str]
    occurred_on: date | None = None
    description: str | None = None
    amount_cents: int | None = None
    direction: str | None = None
    category: str | None = None
    account: str | None = None


class ImportResult(BaseModel):
    rows: list[ImportRow]
    valid_count: int
    invalid_count: int
    duplicate_count: int
    imported_count: int


class TransactionResponse(BaseModel):
    id: int
    account_id: int
    account_name: str
    category_id: int | None
    category_name: str | None
    kind: str | None
    amount_cents: int
    description: str
    occurred_on: date


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=6)

    @field_validator("message")
    @classmethod
    def clean_message(cls, value):
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Enter a question")
        return cleaned

    @field_validator("history")
    @classmethod
    def clean_history(cls, value):
        kept = []
        for item in value:
            content = item.content.strip()
            if not content:
                continue
            kept.append(item.model_copy(update={"content": content[:4000]}))
        return kept[-6:]


class ChatResponse(BaseModel):
    reply: str
    model: str
    disclaimer: str


class AIStatusResponse(BaseModel):
    available: bool
    message: str


class PlaidConnectionResponse(BaseModel):
    id: int
    institution_name: str


class PlaidStatusResponse(BaseModel):
    available: bool
    message: str
    connections: list[PlaidConnectionResponse]


class PlaidLinkTokenResponse(BaseModel):
    link_token: str


class PlaidExchangeRequest(BaseModel):
    public_token: str = Field(min_length=1, max_length=500)
    institution_name: str = ""

    @field_validator("public_token")
    @classmethod
    def clean_public_token(cls, value):
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("A bank connection token is required")
        return cleaned

    @field_validator("institution_name")
    @classmethod
    def clean_institution_name(cls, value):
        return " ".join(value.split())[:255]


class PlaidExchangeResponse(BaseModel):
    id: int
    institution_name: str


class PlaidSyncResponse(BaseModel):
    added: int
    updated: int
    removed: int
    skipped: int
