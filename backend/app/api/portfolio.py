from __future__ import annotations

from datetime import date

from flask import Blueprint, current_app, jsonify, request

from ..services.portfolio import build_portfolio
from .common import error

bp = Blueprint("portfolio", __name__, url_prefix="/portfolio")


def _as_of() -> date:
    raw = request.args.get("date")
    if not raw:
        return date.today()
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return date.today()


@bp.get("/summary")
def summary():
    base = (request.args.get("base") or current_app.config["BASE_CURRENCY"]).upper()
    account_id = request.args.get("account_id", type=int)
    return jsonify(build_portfolio(_as_of(), base, account_id))


@bp.get("/holdings")
def holdings():
    base = (request.args.get("base") or current_app.config["BASE_CURRENCY"]).upper()
    account_id = request.args.get("account_id", type=int)
    data = build_portfolio(_as_of(), base, account_id)
    return jsonify(
        {
            "as_of": data["as_of"],
            "base_currency": data["base_currency"],
            "account_id": data["account_id"],
            "holdings": data["holdings"],
            "cash_positions": data["cash_positions"],
            "warnings": data["warnings"],
        }
    )
