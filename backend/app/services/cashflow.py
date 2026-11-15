"""Cash-flow rules shared by the portfolio service and the API serializer.

Keeping this in one place avoids the frontend and the backend disagreeing
about what a transaction actually did to cash.
"""

from __future__ import annotations

CASH_IN = {"dividend", "interest", "deposit", "transfer_in"}
CASH_OUT = {"withdraw", "transfer_out", "fee", "tax"}


def _amount(txn) -> float:
    gross = float(txn.gross_amount or 0)
    if not gross:
        gross = float(txn.quantity or 0) * float(txn.price or 0)
    return gross


def cash_flow(txn) -> tuple[float, str] | None:
    """Signed cash impact of a transaction, plus its currency."""
    gross = _amount(txn)
    fee = float(txn.fee or 0)
    tax = float(txn.tax or 0)
    currency = txn.currency or "TWD"
    txn_type = txn.type

    if txn_type == "buy":
        return -(gross + fee + tax), currency
    if txn_type == "sell":
        return gross - fee - tax, currency
    if txn_type in CASH_IN:
        return gross - fee - tax, currency
    if txn_type in CASH_OUT:
        return -(gross + fee + tax), currency
    return None


def net_amount(txn) -> float | None:
    """Signed net cash amount rounded for display, or ``None`` for splits."""
    flow = cash_flow(txn)
    return round(flow[0], 2) if flow else None


def funding_account_id(txn) -> int:
    """Account that actually pays or receives the cash."""
    return txn.cash_account_id or txn.account_id
