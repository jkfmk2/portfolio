"""Money-weighted return (XIRR) for the whole portfolio.

The report answers "what annualised return did the total portfolio earn over
this period". It uses the same valuation as :func:`app.services.portfolio.
build_portfolio`, so holdings, cash, FX and missing-price warnings reconcile
with the dashboard.

Only external cash flows count: deposits and withdrawals. Buys, sells,
dividends, interest, fees and taxes are internal to the portfolio and are
already reflected in its value. Transfers between accounts are also internal;
they must be recorded as a matched ``transfer_out`` / ``transfer_in`` pair and
are excluded from IRR.
"""

from __future__ import annotations

import math
from calendar import monthrange
from datetime import date, timedelta

from ..models import Account, Transaction
from .cashflow import cash_flow, funding_account_id
from .portfolio import build_portfolio, get_fx_rate

DAYS_PER_YEAR = 365.0
# Transfers between accounts move money inside the portfolio. They are not
# contributions or withdrawals and must never enter the IRR cash-flow series.
EXTERNAL_TYPES = {"deposit", "withdraw"}


def xirr(flows: list[tuple[date, float]]) -> float | None:
    """Annualised internal rate of return for dated cash flows.

    ``flows`` uses the investor's perspective: money paid in is negative,
    money received is positive. Returns a decimal rate (0.1 = 10%) or ``None``
    when the flows cannot produce a meaningful result.
    """
    by_date: dict[date, float] = {}
    for flow_date, amount in flows:
        value = float(amount or 0)
        if value:
            by_date[flow_date] = by_date.get(flow_date, 0.0) + value

    if len(by_date) < 2:
        return None

    items = sorted(by_date.items())
    amounts = [amount for _, amount in items]
    if not any(amount > 0 for amount in amounts) or not any(amount < 0 for amount in amounts):
        return None

    first_day = items[0][0]
    days = [(flow_date - first_day).days for flow_date, _ in items]
    if days[-1] == 0:
        return None

    scale = max(1.0, sum(abs(amount) for amount in amounts))

    def npv(rate: float) -> float:
        return sum(
            amount / (1.0 + rate) ** (day / DAYS_PER_YEAR)
            for day, amount in zip(days, amounts)
        )

    def derivative(rate: float) -> float:
        return sum(
            -(day / DAYS_PER_YEAR) * amount / (1.0 + rate) ** (day / DAYS_PER_YEAR + 1.0)
            for day, amount in zip(days, amounts)
        )

    # Newton-Raphson is fast for the usual well-behaved portfolio flows.
    rate = 0.1
    for _ in range(80):
        value = npv(rate)
        if abs(value) <= 1e-10 * scale:
            return rate
        slope = derivative(rate)
        if not math.isfinite(slope) or abs(slope) < 1e-14:
            break
        next_rate = rate - value / slope
        if not math.isfinite(next_rate) or next_rate <= -0.999999:
            break
        if abs(next_rate - rate) < 1e-12:
            return next_rate
        rate = next_rate

    # Fallback: scan a grid for a sign change, then bisect. Portfolios with
    # large contributions or short periods can annualise to very large returns.
    grid = [
        -0.999999,
        -0.99,
        -0.9,
        -0.5,
        -0.1,
        0.0,
        0.1,
        0.5,
        1.0,
        2.0,
        5.0,
        10.0,
        50.0,
        100.0,
        1_000.0,
        1e5,
        1e7,
    ]
    previous_rate = grid[0]
    previous_value = npv(previous_rate)
    for current_rate in grid[1:]:
        current_value = npv(current_rate)
        if current_value == 0:
            return current_rate
        if previous_value * current_value < 0:
            low, high = previous_rate, current_rate
            low_value = previous_value
            for _ in range(200):
                middle = (low + high) / 2.0
                middle_value = npv(middle)
                if abs(middle_value) <= 1e-10 * scale or (high - low) < 1e-12:
                    return middle
                if low_value * middle_value <= 0:
                    high = middle
                else:
                    low, low_value = middle, middle_value
            return (low + high) / 2.0
        previous_rate, previous_value = current_rate, current_value

    return None


def _month_keys(start: date, end: date) -> list[tuple[int, int]]:
    keys: list[tuple[int, int]] = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        keys.append((year, month))
        month += 1
        if month > 12:
            month = 1
            year += 1
    return keys


def _external_flows(
    start: date | None,
    end: date,
    base_currency: str,
) -> tuple[list[dict], list[str]]:
    query = Transaction.query.filter(
        Transaction.type.in_(sorted(EXTERNAL_TYPES)),
        Transaction.trade_date <= end,
    )
    if start is not None:
        query = query.filter(Transaction.trade_date >= start)
    txns = query.order_by(Transaction.trade_date.asc(), Transaction.id.asc()).all()

    accounts = {account.id: account for account in Account.query.all()}
    warnings: list[str] = []
    rows: list[dict] = []

    for txn in txns:
        flow = cash_flow(txn)
        if flow is None:
            continue
        amount, currency = flow
        currency = currency or base_currency
        fx = get_fx_rate(currency, base_currency, txn.trade_date)
        if fx is None:
            fallback = float(txn.fx_rate or 0)
            fx = fallback if fallback > 0 else 1.0
            warnings.append(
                f"缺少 {currency}/{base_currency} 匯率（{txn.trade_date.isoformat()}），"
                f"暫以 {fx:g} 換算"
            )

        # cash_flow() is the portfolio's cash impact; the investor's flow is
        # the opposite: a deposit into the portfolio is money paid in.
        signed_base = -float(amount) * fx
        account = accounts.get(funding_account_id(txn))
        rows.append(
            {
                "transaction_id": txn.id,
                "date": txn.trade_date,
                "type": txn.type,
                "account_id": funding_account_id(txn),
                "account_name": account.name if account else None,
                "amount": abs(float(amount)),
                "currency": currency,
                "fx_rate": fx,
                "signed_base": signed_base,
            }
        )

    return rows, warnings


def _value_on(
    day: date,
    base_currency: str,
    cache: dict[str, float],
    warnings: list[str],
) -> float:
    key = day.isoformat()
    if key not in cache:
        portfolio = build_portfolio(day, base_currency)
        cache[key] = float(portfolio["total_value"])
        warnings.extend(portfolio["warnings"])
    return cache[key]


def _bucket(
    period: str,
    start: date,
    end: date,
    flows: list[dict],
    base_currency: str,
    cache: dict[str, float],
    warnings: list[str],
    partial: bool = False,
) -> dict:
    start_value = _value_on(start - timedelta(days=1), base_currency, cache, warnings)
    end_value = _value_on(end, base_currency, cache, warnings)
    period_flows = [flow for flow in flows if start <= flow["date"] <= end]

    cash_flows: list[tuple[date, float]] = []
    if start_value:
        cash_flows.append((start, -start_value))
    cash_flows.extend((flow["date"], flow["signed_base"]) for flow in period_flows)
    if end_value:
        cash_flows.append((end, end_value))

    rate = xirr(cash_flows)
    contributed = sum(-flow["signed_base"] for flow in period_flows if flow["signed_base"] < 0)
    withdrawn = sum(flow["signed_base"] for flow in period_flows if flow["signed_base"] > 0)
    net_flow = contributed - withdrawn

    return {
        "period": period,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "partial": partial,
        "days": (end - start).days,
        "irr_pct": round(rate * 100, 4) if rate is not None else None,
        "start_value": round(start_value, 2),
        "end_value": round(end_value, 2),
        "contributed": round(contributed, 2),
        "withdrawn": round(withdrawn, 2),
        "net_flow": round(net_flow, 2),
        "gain": round(end_value - start_value - net_flow, 2),
    }


def _flow_json(flow: dict) -> dict:
    return {
        "transaction_id": flow["transaction_id"],
        "trade_date": flow["date"].isoformat(),
        "type": flow["type"],
        "direction": "in" if flow["signed_base"] < 0 else "out",
        "account_id": flow["account_id"],
        "account_name": flow["account_name"],
        "amount": round(flow["amount"], 2),
        "currency": flow["currency"],
        "fx_rate": round(flow["fx_rate"], 6),
        "amount_base": round(abs(flow["signed_base"]), 2),
    }


def _since_inception(
    flows: list[dict],
    end: date,
    end_value: float,
) -> dict:
    first_index = next(
        (index for index, flow in enumerate(flows) if flow["signed_base"] < 0),
        None,
    )
    if first_index is None:
        return {
            "irr_pct": None,
            "from": None,
            "days": None,
            "contributed": 0.0,
            "withdrawn": 0.0,
            "net_flow": 0.0,
            "end_value": round(end_value, 2),
            "gain": None,
        }

    inception_flows = flows[first_index:]
    inception_date = inception_flows[0]["date"]
    cash_flows: list[tuple[date, float]] = [
        (flow["date"], flow["signed_base"]) for flow in inception_flows
    ]
    if end_value:
        cash_flows.append((end, end_value))

    rate = xirr(cash_flows)
    contributed = sum(-flow["signed_base"] for flow in inception_flows if flow["signed_base"] < 0)
    withdrawn = sum(flow["signed_base"] for flow in inception_flows if flow["signed_base"] > 0)
    net_flow = contributed - withdrawn

    return {
        "irr_pct": round(rate * 100, 4) if rate is not None else None,
        "from": inception_date.isoformat(),
        "days": (end - inception_date).days,
        "contributed": round(contributed, 2),
        "withdrawn": round(withdrawn, 2),
        "net_flow": round(net_flow, 2),
        "end_value": round(end_value, 2),
        "gain": round(end_value - net_flow, 2),
    }


def build_irr_report(start: date, end: date, base_currency: str) -> dict:
    if start > end:
        raise ValueError("start must be on or before end")

    warnings: list[str] = []
    cache: dict[str, float] = {}

    all_flows, flow_warnings = _external_flows(None, end, base_currency)
    warnings.extend(flow_warnings)

    total = _bucket("total", start, end, all_flows, base_currency, cache, warnings)
    summary = {
        key: total[key]
        for key in (
            "irr_pct",
            "days",
            "start_value",
            "end_value",
            "contributed",
            "withdrawn",
            "net_flow",
            "gain",
        )
    }

    years: list[dict] = []
    for year in range(start.year, end.year + 1):
        year_start = max(start, date(year, 1, 1))
        year_end = min(end, date(year, 12, 31))
        partial = year_start != date(year, 1, 1) or year_end != date(year, 12, 31)
        years.append(
            _bucket(
                str(year),
                year_start,
                year_end,
                all_flows,
                base_currency,
                cache,
                warnings,
                partial,
            )
        )

    months: list[dict] = []
    for year, month in _month_keys(start, end):
        month_start = max(start, date(year, month, 1))
        month_end = min(end, date(year, month, monthrange(year, month)[1]))
        partial = (
            month_start != date(year, month, 1)
            or month_end != date(year, month, monthrange(year, month)[1])
        )
        months.append(
            _bucket(
                f"{year:04d}-{month:02d}",
                month_start,
                month_end,
                all_flows,
                base_currency,
                cache,
                warnings,
                partial,
            )
        )

    end_value = _value_on(end, base_currency, cache, warnings)
    period_flows = [flow for flow in all_flows if start <= flow["date"] <= end]

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "base_currency": base_currency,
        "summary": summary,
        "since_inception": _since_inception(all_flows, end, end_value),
        "years": years,
        "months": months,
        "flows": [_flow_json(flow) for flow in period_flows],
        "warnings": list(dict.fromkeys(warnings)),
    }
