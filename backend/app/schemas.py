from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field, field_validator

from .models import ACCOUNT_TYPES, ASSET_TYPES, TXN_TYPES

AssetType = str
TxnType = str


def _upper(v: str | None) -> str | None:
    return v.upper() if isinstance(v, str) else v


class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    broker: str | None = None
    account_type: str = "broker"
    currency: str = "TWD"
    note: str | None = None
    is_active: bool = True

    @field_validator("account_type")
    @classmethod
    def check_type(cls, v: str) -> str:
        if v not in ACCOUNT_TYPES:
            raise ValueError(f"account_type must be one of {ACCOUNT_TYPES}")
        return v

    @field_validator("currency")
    @classmethod
    def up(cls, v: str) -> str:
        return v.upper()


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    broker: str | None = None
    account_type: str | None = None
    currency: str | None = None
    note: str | None = None
    is_active: bool | None = None

    @field_validator("account_type")
    @classmethod
    def check_type(cls, v: str | None) -> str | None:
        if v is not None and v not in ACCOUNT_TYPES:
            raise ValueError(f"account_type must be one of {ACCOUNT_TYPES}")
        return v

    @field_validator("currency")
    @classmethod
    def up(cls, v: str | None) -> str | None:
        return _upper(v)


class InstrumentIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    name: str = ""
    asset_type: str = "stock"
    currency: str = "TWD"
    market: str = "TW"
    exchange: str | None = None
    face_value: float | None = None
    coupon_rate: float | None = None
    coupon_frequency: int | None = None
    maturity_date: date | None = None
    issue_date: date | None = None
    isin: str | None = None
    credit_rating: str | None = None
    interest_rate: float | None = None
    note: str | None = None
    is_active: bool = True

    @field_validator("asset_type")
    @classmethod
    def check_asset(cls, v: str) -> str:
        if v not in ASSET_TYPES:
            raise ValueError(f"asset_type must be one of {ASSET_TYPES}")
        return v

    @field_validator("currency")
    @classmethod
    def up(cls, v: str) -> str:
        return v.upper()

    @field_validator("market")
    @classmethod
    def up_market(cls, v: str) -> str:
        return v.upper()


class InstrumentUpdate(BaseModel):
    symbol: str | None = Field(default=None, min_length=1, max_length=32)
    name: str | None = None
    asset_type: str | None = None
    currency: str | None = None
    market: str | None = None
    exchange: str | None = None
    face_value: float | None = None
    coupon_rate: float | None = None
    coupon_frequency: int | None = None
    maturity_date: date | None = None
    issue_date: date | None = None
    isin: str | None = None
    credit_rating: str | None = None
    interest_rate: float | None = None
    note: str | None = None
    is_active: bool | None = None

    @field_validator("asset_type")
    @classmethod
    def check_asset(cls, v: str | None) -> str | None:
        if v is not None and v not in ASSET_TYPES:
            raise ValueError(f"asset_type must be one of {ASSET_TYPES}")
        return v

    @field_validator("currency")
    @classmethod
    def up(cls, v: str | None) -> str | None:
        return _upper(v)

    @field_validator("market")
    @classmethod
    def up_market(cls, v: str | None) -> str | None:
        return _upper(v)


class TransactionIn(BaseModel):
    account_id: int
    instrument_id: int | None = None
    type: str
    trade_date: date
    quantity: float = 0
    price: float = 0
    gross_amount: float | None = None
    fee: float = 0
    tax: float = 0
    currency: str | None = None
    fx_rate: float | None = None
    note: str | None = None
    external_id: str | None = None

    @field_validator("type")
    @classmethod
    def check_txn(cls, v: str) -> str:
        if v not in TXN_TYPES:
            raise ValueError(f"type must be one of {TXN_TYPES}")
        return v

    @field_validator("currency")
    @classmethod
    def up(cls, v: str | None) -> str | None:
        return _upper(v)


class TransactionUpdate(BaseModel):
    account_id: int | None = None
    instrument_id: int | None = None
    type: str | None = None
    trade_date: date | None = None
    quantity: float | None = None
    price: float | None = None
    gross_amount: float | None = None
    fee: float | None = None
    tax: float | None = None
    currency: str | None = None
    fx_rate: float | None = None
    note: str | None = None
    external_id: str | None = None

    @field_validator("type")
    @classmethod
    def check_txn(cls, v: str | None) -> str | None:
        if v is not None and v not in TXN_TYPES:
            raise ValueError(f"type must be one of {TXN_TYPES}")
        return v

    @field_validator("currency")
    @classmethod
    def up(cls, v: str | None) -> str | None:
        return _upper(v)


class PriceIn(BaseModel):
    instrument_id: int
    date: date
    close: float
    currency: str | None = None
    source: str = "manual"

    @field_validator("currency")
    @classmethod
    def up(cls, v: str | None) -> str | None:
        return _upper(v)


class FxRateIn(BaseModel):
    base_currency: str
    quote_currency: str
    date: date
    rate: float = Field(gt=0)
    source: str = "manual"

    @field_validator("base_currency", "quote_currency")
    @classmethod
    def up(cls, v: str) -> str:
        return v.upper()
