from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .extensions import db

ASSET_TYPES = ("stock", "etf", "bond", "cash")
ACCOUNT_TYPES = ("broker", "bank", "cash")
TXN_TYPES = (
    "buy",
    "sell",
    "dividend",
    "interest",
    "deposit",
    "withdraw",
    "fee",
    "tax",
    "transfer_in",
    "transfer_out",
    "split",
)
CASH_TXNS = {"dividend", "interest", "deposit", "withdraw", "fee", "tax", "transfer_in", "transfer_out"}

ASSET_LABELS = {"stock": "股票", "etf": "ETF", "bond": "債券", "cash": "現金"}
ACCOUNT_LABELS = {"broker": "證券帳戶", "bank": "銀行帳戶", "cash": "現金帳戶"}
TXN_LABELS = {
    "buy": "買入",
    "sell": "賣出",
    "dividend": "股利",
    "interest": "利息",
    "deposit": "存入",
    "withdraw": "提出",
    "fee": "手續費",
    "tax": "稅費",
    "transfer_in": "轉入",
    "transfer_out": "轉出",
    "split": "股票分割",
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _value(v):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v


class SerializerMixin:
    def to_dict(self) -> dict:
        return {c.name: _value(getattr(self, c.name)) for c in self.__table__.columns}


class Setting(db.Model):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)

    def to_dict(self) -> dict:
        return {"key": self.key, "value": self.value}


class Account(SerializerMixin, db.Model):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    broker: Mapped[str | None] = mapped_column(String(100))
    account_type: Mapped[str] = mapped_column(String(20), default="broker", nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="TWD", nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account")


class Instrument(SerializerMixin, db.Model):
    __tablename__ = "instruments"
    __table_args__ = (UniqueConstraint("symbol", "market", name="uq_instrument_symbol_market"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    asset_type: Mapped[str] = mapped_column(String(20), default="stock", nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="TWD", nullable=False)
    market: Mapped[str] = mapped_column(String(16), default="TW", nullable=False)
    exchange: Mapped[str | None] = mapped_column(String(32))
    # Bond specific
    face_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    coupon_rate: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    coupon_frequency: Mapped[int | None] = mapped_column(Integer)
    maturity_date: Mapped[date | None] = mapped_column(Date)
    issue_date: Mapped[date | None] = mapped_column(Date)
    isin: Mapped[str | None] = mapped_column(String(32))
    credit_rating: Mapped[str | None] = mapped_column(String(16))
    # Cash specific
    interest_rate: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    note: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="instrument")
    prices: Mapped[list["Price"]] = relationship(
        back_populates="instrument", cascade="all, delete-orphan"
    )

    @property
    def label(self) -> str:
        return f"{self.symbol} {self.name}".strip()

    def to_dict(self) -> dict:
        data = super().to_dict()
        data["label"] = self.label
        return data


class Transaction(SerializerMixin, db.Model):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), nullable=False)
    instrument_id: Mapped[int | None] = mapped_column(ForeignKey("instruments.id"))
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=0, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=0, nullable=False)
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=0, nullable=False)
    fee: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=0, nullable=False)
    tax: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="TWD", nullable=False)
    fx_rate: Mapped[Decimal] = mapped_column(Numeric(18, 8), default=1, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    external_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    account: Mapped["Account"] = relationship(back_populates="transactions")
    instrument: Mapped["Instrument | None"] = relationship(back_populates="transactions")

    def to_dict(self) -> dict:
        data = super().to_dict()
        data["account_name"] = self.account.name if self.account else None
        if self.instrument:
            data["instrument_symbol"] = self.instrument.symbol
            data["instrument_name"] = self.instrument.name
            data["instrument_label"] = self.instrument.label
            data["asset_type"] = self.instrument.asset_type
        else:
            data["instrument_symbol"] = None
            data["instrument_name"] = None
            data["instrument_label"] = None
            data["asset_type"] = "cash"
        return data


class Price(SerializerMixin, db.Model):
    __tablename__ = "prices"
    __table_args__ = (UniqueConstraint("instrument_id", "date", name="uq_price_instrument_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    close: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="TWD", nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="manual", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    instrument: Mapped["Instrument"] = relationship(back_populates="prices")


class FxRate(SerializerMixin, db.Model):
    __tablename__ = "fx_rates"
    __table_args__ = (
        UniqueConstraint("base_currency", "quote_currency", "date", name="uq_fx_pair_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    quote_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    # 1 unit of base_currency = rate units of quote_currency
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="manual", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
