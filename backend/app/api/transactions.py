from __future__ import annotations

from datetime import date

from flask import Blueprint, jsonify, request
from sqlalchemy import or_

from ..extensions import db
from ..models import Account, Instrument, Transaction
from ..schemas import TransactionIn, TransactionUpdate
from .common import apply_fields, error, get_json, parse

bp = Blueprint("transactions", __name__, url_prefix="/transactions")

TRADE_TYPES = {"buy", "sell", "split"}


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


@bp.get("")
def list_transactions():
    query = Transaction.query

    account_id = request.args.get("account_id", type=int)
    if account_id:
        # "Involves this account": either the holding or the funding side.
        query = query.filter(
            or_(Transaction.account_id == account_id, Transaction.cash_account_id == account_id)
        )
    cash_account_id = request.args.get("cash_account_id", type=int)
    if cash_account_id:
        query = query.filter(Transaction.cash_account_id == cash_account_id)
    instrument_id = request.args.get("instrument_id", type=int)
    if instrument_id:
        query = query.filter(Transaction.instrument_id == instrument_id)
    txn_type = request.args.get("type")
    if txn_type:
        query = query.filter(Transaction.type == txn_type)
    start = _parse_date(request.args.get("start"))
    if start:
        query = query.filter(Transaction.trade_date >= start)
    end = _parse_date(request.args.get("end"))
    if end:
        query = query.filter(Transaction.trade_date <= end)

    total = query.count()
    limit = min(request.args.get("limit", default=200, type=int) or 200, 1000)
    offset = max(request.args.get("offset", default=0, type=int) or 0, 0)

    items = (
        query.order_by(Transaction.trade_date.desc(), Transaction.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return jsonify({"items": [t.to_dict() for t in items], "total": total})


@bp.post("")
def create_transaction():
    payload, err = parse(TransactionIn, get_json())
    if err:
        return err

    account = db.session.get(Account, payload.account_id)
    if not account:
        return error("account_not_found", 404)

    instrument = None
    if payload.instrument_id is not None:
        instrument = db.session.get(Instrument, payload.instrument_id)
        if not instrument:
            return error("instrument_not_found", 404)

    if payload.type in TRADE_TYPES and instrument is None:
        return error("instrument_required_for_trade", 400)

    cash_account_id = payload.cash_account_id
    if instrument is None:
        cash_account_id = None
    elif cash_account_id is not None and not db.session.get(Account, cash_account_id):
        return error("cash_account_not_found", 404)

    currency = payload.currency or (instrument.currency if instrument else account.currency)
    gross = payload.gross_amount
    if gross is None:
        gross = payload.quantity * payload.price

    txn = Transaction(
        account_id=payload.account_id,
        cash_account_id=cash_account_id,
        instrument_id=payload.instrument_id,
        type=payload.type,
        trade_date=payload.trade_date,
        quantity=payload.quantity,
        price=payload.price,
        gross_amount=gross,
        fee=payload.fee,
        tax=payload.tax,
        currency=currency,
        fx_rate=payload.fx_rate if payload.fx_rate is not None else 1,
        note=payload.note,
        external_id=payload.external_id,
    )
    db.session.add(txn)
    db.session.commit()
    return jsonify(txn.to_dict()), 201


@bp.get("/<int:txn_id>")
def get_transaction(txn_id: int):
    txn = db.session.get(Transaction, txn_id)
    if not txn:
        return error("transaction_not_found", 404)
    return jsonify(txn.to_dict())


@bp.patch("/<int:txn_id>")
def update_transaction(txn_id: int):
    txn = db.session.get(Transaction, txn_id)
    if not txn:
        return error("transaction_not_found", 404)

    payload, err = parse(TransactionUpdate, get_json())
    if err:
        return err
    changes = payload.model_dump(exclude_unset=True)

    if "account_id" in changes and not db.session.get(Account, changes["account_id"]):
        return error("account_not_found", 404)
    if changes.get("instrument_id") is not None:
        if not db.session.get(Instrument, changes["instrument_id"]):
            return error("instrument_not_found", 404)
    if changes.get("cash_account_id") is not None:
        if not db.session.get(Account, changes["cash_account_id"]):
            return error("cash_account_not_found", 404)

    final_type = changes.get("type", txn.type)
    final_instrument_id = changes.get("instrument_id", txn.instrument_id)
    if final_type in TRADE_TYPES and final_instrument_id is None:
        return error("instrument_required_for_trade", 400)

    apply_fields(txn, changes)
    # Cash accounts only make sense for transactions that reference an instrument.
    if txn.instrument_id is None:
        txn.cash_account_id = None
    if "gross_amount" not in changes and txn.type in ("buy", "sell"):
        txn.gross_amount = float(txn.quantity) * float(txn.price)
    db.session.commit()
    return jsonify(txn.to_dict())


@bp.delete("/<int:txn_id>")
def delete_transaction(txn_id: int):
    txn = db.session.get(Transaction, txn_id)
    if not txn:
        return error("transaction_not_found", 404)
    db.session.delete(txn)
    db.session.commit()
    return "", 204
