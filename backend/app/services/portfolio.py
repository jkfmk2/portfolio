"""Portfolio valuation built from the transaction ledger.

Design notes
------------
* Positions are never stored. They are recomputed from transactions so the
  ledger stays the single source of truth.
* Cost basis uses the moving-average method (common for TW brokers). Bonds and
  stocks share the same logic; a bond's ``quantity`` is the number of bond
  units and ``price`` is the clean price per unit.
* A transaction has a holding account (``account_id``) and an optional funding
  account (``cash_account_id``). Cash movements use the funding account while
  positions stay in the holding account.
* Passing ``account_id`` scopes the whole valuation to one account.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy import or_

from ..extensions import db
from ..models import ASSET_LABELS, Account, FxRate, Instrument, Price, Transaction
from .cashflow import cash_flow, funding_account_id
from .positions import apply_txn, new_state


def _f(value) -> float:
    return float(value or 0)


def get_fx_rate(from_currency: str, to_currency: str, on_date: date) -> float | None:
    """Return how many ``to_currency`` units one ``from_currency`` unit buys."""
    if not from_currency or not to_currency:
        return None
    if from_currency == to_currency:
        return 1.0

    direct = (
        FxRate.query.filter(
            FxRate.base_currency == from_currency,
            FxRate.quote_currency == to_currency,
            FxRate.date <= on_date,
        )
        .order_by(FxRate.date.desc())
        .first()
    )
    if direct and _f(direct.rate) > 0:
        return _f(direct.rate)

    inverse = (
        FxRate.query.filter(
            FxRate.base_currency == to_currency,
            FxRate.quote_currency == from_currency,
            FxRate.date <= on_date,
        )
        .order_by(FxRate.date.desc())
        .first()
    )
    if inverse and _f(inverse.rate) > 0:
        return 1.0 / _f(inverse.rate)
    return None


def latest_price(instrument_id: int, on_date: date) -> Price | None:
    return (
        Price.query.filter(Price.instrument_id == instrument_id, Price.date <= on_date)
        .order_by(Price.date.desc())
        .first()
    )


def build_portfolio(as_of: date, base_currency: str, account_id: int | None = None) -> dict:
    warnings: list[str] = []

    query = Transaction.query.filter(Transaction.trade_date <= as_of)
    if account_id is not None:
        query = query.filter(
            or_(Transaction.account_id == account_id, Transaction.cash_account_id == account_id)
        )
    txns = query.order_by(Transaction.trade_date.asc(), Transaction.id.asc()).all()

    states: dict[tuple[int, int], dict] = {}
    cash: dict[tuple[int, str], float] = defaultdict(float)

    for txn in txns:
        flow = cash_flow(txn)
        funding_id = funding_account_id(txn)
        if flow and (account_id is None or funding_id == account_id):
            amount, currency = flow
            cash[(funding_id, currency)] += amount

        if txn.instrument_id is None:
            continue
        if account_id is not None and txn.account_id != account_id:
            continue

        currency = txn.currency or base_currency
        state = states.setdefault(
            (txn.account_id, txn.instrument_id), new_state(currency)
        )
        sale = apply_txn(state, txn)
        if sale and sale["oversold"]:
            warnings.append(
                f"交易 #{txn.id} 賣出 {sale['requested_quantity']:g} "
                f"超過持倉 {sale['held_quantity']:g}，已以持倉量計算"
            )

    accounts = {a.id: a for a in Account.query.all()}
    holdings: list[dict] = []
    securities_value = 0.0
    cost_basis_base = 0.0
    unrealized_base = 0.0
    realized_base = 0.0
    income_base = 0.0

    for (holding_account_id, instrument_id), state in states.items():
        instrument = db.session.get(Instrument, instrument_id)
        if instrument is None:
            continue

        quantity = state["quantity"]
        realized = state["realized"]
        income = state["income"]
        if quantity <= 0 and not realized and not income:
            continue

        fx = get_fx_rate(instrument.currency, base_currency, as_of)
        if fx is None:
            warnings.append(f"缺少 {instrument.currency}/{base_currency} 匯率，暫以 1 換算")
            fx = 1.0

        # Realized P&L and income belong to the account even after the position
        # is fully closed, so they are accumulated before the quantity check.
        realized_base += realized * fx
        income_base += income * fx

        if quantity <= 0:
            continue

        price_row = latest_price(instrument_id, as_of)
        if price_row is not None:
            price = _f(price_row.close)
            price_date = price_row.date.isoformat()
            price_source = price_row.source or "manual"
        else:
            price = state["avg_cost"]
            price_date = None
            price_source = "cost"
            warnings.append(f"{instrument.symbol} 尚無價格，暫以平均成本估值")

        account = accounts.get(holding_account_id)
        market_value = quantity * price
        cost_basis = quantity * state["avg_cost"]
        unrealized = market_value - cost_basis

        holdings.append(
            {
                "account_id": holding_account_id,
                "account_name": account.name if account else None,
                "instrument_id": instrument_id,
                "symbol": instrument.symbol,
                "name": instrument.name,
                "asset_type": instrument.asset_type,
                "asset_label": ASSET_LABELS.get(instrument.asset_type, instrument.asset_type),
                "market": instrument.market,
                "currency": instrument.currency,
                "quantity": round(quantity, 6),
                "avg_cost": round(state["avg_cost"], 6),
                "price": round(price, 6),
                "price_date": price_date,
                "price_source": price_source,
                "market_value": round(market_value, 2),
                "cost_basis": round(cost_basis, 2),
                "unrealized_pnl": round(unrealized, 2),
                "unrealized_pnl_pct": round(unrealized / cost_basis * 100, 2) if cost_basis else 0.0,
                "realized_pnl": round(realized, 2),
                "income": round(income, 2),
                "fx_rate": fx,
                "market_value_base": round(market_value * fx, 2),
                "cost_basis_base": round(cost_basis * fx, 2),
                "unrealized_pnl_base": round(unrealized * fx, 2),
                "realized_pnl_base": round(realized * fx, 2),
                "income_base": round(income * fx, 2),
                "weight_pct": 0.0,
            }
        )
        securities_value += market_value * fx
        cost_basis_base += cost_basis * fx
        unrealized_base += unrealized * fx

    cash_positions: list[dict] = []
    cash_value = 0.0
    for (cash_account_id, currency), amount in cash.items():
        if abs(amount) < 0.01:
            continue
        account = accounts.get(cash_account_id)
        fx = get_fx_rate(currency, base_currency, as_of)
        if fx is None:
            warnings.append(f"缺少 {currency}/{base_currency} 匯率，暫以 1 換算")
            fx = 1.0
        cash_positions.append(
            {
                "account_id": cash_account_id,
                "account_name": account.name if account else None,
                "account_type": account.account_type if account else None,
                "currency": currency,
                "amount": round(amount, 2),
                "fx_rate": fx,
                "value_base": round(amount * fx, 2),
                "weight_pct": 0.0,
            }
        )
        cash_value += amount * fx

    total_value = securities_value + cash_value

    for holding in holdings:
        holding["weight_pct"] = (
            round(holding["market_value_base"] / total_value * 100, 2) if total_value else 0.0
        )
    for position in cash_positions:
        position["weight_pct"] = (
            round(position["value_base"] / total_value * 100, 2) if total_value else 0.0
        )

    by_type: dict[str, float] = defaultdict(float)
    by_currency: dict[str, float] = defaultdict(float)
    by_account: dict[str, float] = defaultdict(float)
    for holding in holdings:
        by_type[holding["asset_type"]] += holding["market_value_base"]
        by_currency[holding["currency"]] += holding["market_value_base"]
        by_account[holding["account_name"] or "-"] += holding["market_value_base"]
    for position in cash_positions:
        by_type["cash"] += position["value_base"]
        by_currency[position["currency"]] += position["value_base"]
        by_account[position["account_name"] or "-"] += position["value_base"]

    def slices(data: dict[str, float], labels: dict[str, str] | None = None) -> list[dict]:
        out = []
        for key, value in sorted(data.items(), key=lambda kv: kv[1], reverse=True):
            if abs(value) < 0.01:
                continue
            out.append(
                {
                    "key": key,
                    "label": (labels or {}).get(key, key),
                    "value": round(value, 2),
                    "pct": round(value / total_value * 100, 2) if total_value else 0.0,
                }
            )
        return out

    holdings.sort(key=lambda h: h["market_value_base"], reverse=True)
    cash_positions.sort(key=lambda p: p["value_base"], reverse=True)

    return {
        "as_of": as_of.isoformat(),
        "base_currency": base_currency,
        "account_id": account_id,
        "total_value": round(total_value, 2),
        "securities_value": round(securities_value, 2),
        "cash_value": round(cash_value, 2),
        "cost_basis": round(cost_basis_base, 2),
        "unrealized_pnl": round(unrealized_base, 2),
        "unrealized_pnl_pct": round(unrealized_base / cost_basis_base * 100, 2)
        if cost_basis_base
        else 0.0,
        "realized_pnl": round(realized_base, 2),
        "income": round(income_base, 2),
        "holdings_count": len(holdings),
        "accounts_count": 1 if account_id is not None else len(accounts),
        "holdings": holdings,
        "cash_positions": cash_positions,
        "allocation_by_type": slices(by_type, ASSET_LABELS),
        "allocation_by_currency": slices(by_currency),
        "allocation_by_account": slices(by_account),
        "warnings": warnings,
    }
