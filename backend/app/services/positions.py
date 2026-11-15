"""Moving-average position updates shared by valuation and reports.

The ledger is replayed from the first transaction, so buy/sell/split handling
must live in exactly one place. ``portfolio.py`` (point-in-time valuation) and
``reports.py`` (period realised P&L) both call :func:`apply_txn`.
"""

from __future__ import annotations


def _f(value) -> float:
    return float(value or 0)


def new_state(currency: str) -> dict:
    return {
        "quantity": 0.0,
        "avg_cost": 0.0,
        "realized": 0.0,
        "income": 0.0,
        "fees": 0.0,
        "currency": currency,
    }


def apply_txn(state: dict, txn) -> dict | None:
    """Apply one ledger row to ``state``.

    Returns sale details for ``sell`` rows, otherwise ``None``. The caller is
    responsible for warnings because their wording depends on the context.
    """
    qty = _f(txn.quantity)
    price = _f(txn.price)
    fee = _f(txn.fee)
    tax = _f(txn.tax)
    gross = _f(txn.gross_amount) or (qty * price)

    if txn.type == "buy":
        new_qty = state["quantity"] + qty
        cost = gross + fee + tax
        if new_qty > 0:
            state["avg_cost"] = (state["avg_cost"] * state["quantity"] + cost) / new_qty
        state["quantity"] = new_qty
        state["fees"] += fee
        return None

    if txn.type == "sell":
        held = state["quantity"]
        sell_qty = qty
        oversold = sell_qty > held + 1e-9
        if oversold:
            sell_qty = held
        proceeds = price * sell_qty - fee - tax
        gross_proceeds = price * sell_qty
        cost_basis = state["avg_cost"] * sell_qty
        realized = proceeds - cost_basis
        state["realized"] += realized
        state["quantity"] -= sell_qty
        state["fees"] += fee
        if state["quantity"] <= 1e-9:
            state["quantity"] = 0.0
            state["avg_cost"] = 0.0
        return {
            "quantity": sell_qty,
            "requested_quantity": qty,
            "held_quantity": held,
            "oversold": oversold,
            "price": price,
            "proceeds": proceeds,
            "gross_proceeds": gross_proceeds,
            "cost_basis": cost_basis,
            "realized": realized,
            "fee": fee,
            "tax": tax,
        }

    if txn.type == "split":
        new_qty = state["quantity"] + qty
        if new_qty > 0:
            state["avg_cost"] = state["avg_cost"] * state["quantity"] / new_qty
        state["quantity"] = new_qty
        return None

    if txn.type in ("dividend", "interest"):
        state["income"] += gross

    return None
