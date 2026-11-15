from __future__ import annotations

from datetime import date

from flask import Blueprint, current_app, jsonify, request

from ..services.irr import build_irr_report
from ..services.reports import build_income_report
from .common import error

bp = Blueprint("reports", __name__, url_prefix="/reports")


def _parse_date(raw: str | None, default: date) -> date | None:
    if not raw:
        return default
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


@bp.get("/income")
def income_report():
    today = date.today()
    start = _parse_date(request.args.get("from"), date(today.year, 1, 1))
    end = _parse_date(request.args.get("to"), today)
    if start is None or end is None:
        return error("invalid_date", 400)
    if start > end:
        return error("invalid_date_range", 400)

    base = (request.args.get("base") or current_app.config["BASE_CURRENCY"]).upper()
    account_id = request.args.get("account_id", type=int)
    return jsonify(build_income_report(start, end, base, account_id))


@bp.get("/irr")
def irr_report():
    today = date.today()
    start = _parse_date(request.args.get("from"), date(today.year, 1, 1))
    end = _parse_date(request.args.get("to"), today)
    if start is None or end is None:
        return error("invalid_date", 400)
    if start > end:
        return error("invalid_date_range", 400)

    base = (request.args.get("base") or current_app.config["BASE_CURRENCY"]).upper()
    return jsonify(build_irr_report(start, end, base))
