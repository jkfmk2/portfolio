"""Period report for realised P&L and dividend / interest income.

The report answers "what happened between these two dates", while
``build_portfolio`` answers "what do I own on this date". Both replay the whole
ledger through :mod:`app.services.positions`; only the report filters rows by
``trade_date`` after the cost state has been advanced.

Amounts are converted to the base currency with the FX rate on the report's end
date. That matches ``build_portfolio`` (which converts at ``as_of``), so a
report ending today reconciles with the dashboard.
"""

from __future__ import annotations

from datetime import date

from ..extensions import db
from ..models import Account, Instrument, Transaction
from .cashflow import gross_amount
from .portfolio import get_fx_rate
from .positions import apply_txn, new_state


def _months(start: date, end: date) -> list[str]:
    keys: list[str] = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        keys.append(f"{year:04d}-{month:02d}")
        month += 1
        if month > 12:
            month = 1
            year += 1
    return keys


def _empty_bucket() -> dict:
    return {
        "realized_pnl": 0.0,
        "dividends_gross": 0.0,
        "dividends_net": 0.0,
        "interest_gross": 0.0,
        "interest_net": 0.0,
        "income_net": 0.0,
        "fees": 0.0,
        "taxes": 0.0,
        "total": 0.0,
    }


def build_income_report(
    start: date,
    end: date,
    base_currency: str,
    account_id: int | None = None,
) -> dict:
    if start > end:
        raise ValueError("start must be on or before end")

    warnings: list[str] = []
    query = Transaction.query.filter(Transaction.trade_date <= end)
    if account_id is not None:
        query = query.filter(Transaction.account_id == account_id)
    txns = query.order_by(Transaction.trade_date.asc(), Transaction.id.asc()).all()

    fx_cache: dict[str, float] = {}

    def fx_for(currency: str) -> float:
        currency = currency or base_currency
        if currency not in fx_cache:
            rate = get_fx_rate(currency, base_currency, end)
            if rate is None:
                warnings.append(f"缺少 {currency}/{base_currency} 匯率，暫以 1 換算")
                rate = 1.0
            fx_cache[currency] = rate
        return fx_cache[currency]

    buckets = {key: _empty_bucket() for key in _months(start, end)}
    totals = _empty_bucket()
    totals.update({"proceeds": 0.0, "cost_basis": 0.0})

    states: dict[tuple[int, int], dict] = {}
    realized_rows: list[dict] = []
    income_rows: list[dict] = []
    accounts = {a.id: a for a in Account.query.all()}
    instruments: dict[int, Instrument] = {}

    for txn in txns:
        if txn.instrument_id is None:
            continue

        state = states.setdefault(
            (txn.account_id, txn.instrument_id),
            new_state(txn.currency or base_currency),
        )
        sale = apply_txn(state, txn)

        if txn.trade_date < start:
            continue

        instrument = instruments.get(txn.instrument_id)
        if instrument is None:
            instrument = db.session.get(Instrument, txn.instrument_id)
            if instrument is None:
                continue
            instruments[txn.instrument_id] = instrument

        currency = txn.currency or base_currency
        fx = fx_for(currency)
        account = accounts.get(txn.account_id)
        bucket = buckets[f"{txn.trade_date.year:04d}-{txn.trade_date.month:02d}"]

        if txn.type == "sell" and sale is not None:
            if sale["oversold"]:
                warnings.append(
                    f"交易 #{txn.id} 賣出 {sale['requested_quantity']:g} "
                    f"超過持倉 {sale['held_quantity']:g}，已以持倉量計算"
                )
            realized_base = sale["realized"] * fx
            proceeds_base = sale["gross_proceeds"] * fx
            cost_base = sale["cost_basis"] * fx
            fee_base = sale["fee"] * fx
            tax_base = sale["tax"] * fx
            realized_rows.append(
                {
                    "transaction_id": txn.id,
                    "trade_date": txn.trade_date.isoformat(),
                    "account_id": txn.account_id,
                    "account_name": account.name if account else None,
                    "instrument_id": instrument.id,
                    "symbol": instrument.symbol,
                    "name": instrument.name,
                    "asset_type": instrument.asset_type,
                    "quantity": round(sale["quantity"], 6),
                    "price": round(sale["price"], 6),
                    "proceeds": round(sale["gross_proceeds"], 2),
                    "cost_basis": round(sale["cost_basis"], 2),
                    "fee": round(sale["fee"], 2),
                    "tax": round(sale["tax"], 2),
                    "currency": currency,
                    "fx_rate": fx,
                    "realized_pnl": round(sale["realized"], 2),
                    "realized_pnl_base": round(realized_base, 2),
                }
            )
            bucket["realized_pnl"] += realized_base
            bucket["fees"] += fee_base
            bucket["taxes"] += tax_base
            totals["realized_pnl"] += realized_base
            totals["proceeds"] += proceeds_base
            totals["cost_basis"] += cost_base
            totals["fees"] += fee_base
            totals["taxes"] += tax_base

        elif txn.type in ("dividend", "interest"):
            gross = gross_amount(txn)
            fee = float(txn.fee or 0)
            tax = float(txn.tax or 0)
            net = gross - fee - tax
            gross_base = gross * fx
            net_base = net * fx
            income_rows.append(
                {
                    "transaction_id": txn.id,
                    "trade_date": txn.trade_date.isoformat(),
                    "type": txn.type,
                    "account_id": txn.account_id,
                    "account_name": account.name if account else None,
                    "instrument_id": instrument.id,
                    "symbol": instrument.symbol,
                    "name": instrument.name,
                    "gross": round(gross, 2),
                    "fee": round(fee, 2),
                    "tax": round(tax, 2),
                    "net": round(net, 2),
                    "currency": currency,
                    "fx_rate": fx,
                    "gross_base": round(gross_base, 2),
                    "net_base": round(net_base, 2),
                }
            )
            kind = "dividends" if txn.type == "dividend" else "interest"
            bucket[f"{kind}_gross"] += gross_base
            bucket[f"{kind}_net"] += net_base
            bucket["fees"] += fee * fx
            bucket["taxes"] += tax * fx
            totals[f"{kind}_gross"] += gross_base
            totals[f"{kind}_net"] += net_base
            totals["fees"] += fee * fx
            totals["taxes"] += tax * fx

    bucket_rows = []
    for key in _months(start, end):
        bucket = buckets[key]
        bucket["income_net"] = bucket["dividends_net"] + bucket["interest_net"]
        bucket["total"] = bucket["realized_pnl"] + bucket["income_net"]
        bucket_rows.append(
            {
                "period": key,
                **{name: round(value, 2) for name, value in bucket.items()},
            }
        )

    totals["income_gross"] = totals["dividends_gross"] + totals["interest_gross"]
    totals["income_net"] = totals["dividends_net"] + totals["interest_net"]
    totals["total"] = totals["realized_pnl"] + totals["income_net"]

    realized_rows.sort(key=lambda row: (row["trade_date"], row["transaction_id"]), reverse=True)
    income_rows.sort(key=lambda row: (row["trade_date"], row["transaction_id"]), reverse=True)

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "base_currency": base_currency,
        "account_id": account_id,
        "totals": {name: round(value, 2) for name, value in totals.items()},
        "buckets": bucket_rows,
        "realized": realized_rows,
        "income": income_rows,
        "warnings": warnings,
    }
