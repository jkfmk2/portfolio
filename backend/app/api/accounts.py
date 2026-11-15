from __future__ import annotations

from flask import Blueprint, jsonify
from sqlalchemy import or_

from ..extensions import db
from ..models import Account, Transaction
from ..schemas import AccountIn, AccountUpdate
from .common import apply_fields, error, get_json, parse

bp = Blueprint("accounts", __name__, url_prefix="/accounts")


@bp.get("")
def list_accounts():
    items = Account.query.order_by(Account.id.asc()).all()
    return jsonify([a.to_dict() for a in items])


@bp.post("")
def create_account():
    payload, err = parse(AccountIn, get_json())
    if err:
        return err
    account = Account(**payload.model_dump())
    db.session.add(account)
    db.session.commit()
    return jsonify(account.to_dict()), 201


@bp.get("/<int:account_id>")
def get_account(account_id: int):
    account = db.session.get(Account, account_id)
    if not account:
        return error("account_not_found", 404)
    return jsonify(account.to_dict())


@bp.patch("/<int:account_id>")
def update_account(account_id: int):
    account = db.session.get(Account, account_id)
    if not account:
        return error("account_not_found", 404)
    payload, err = parse(AccountUpdate, get_json())
    if err:
        return err
    apply_fields(account, payload.model_dump(exclude_unset=True))
    db.session.commit()
    return jsonify(account.to_dict())


@bp.delete("/<int:account_id>")
def delete_account(account_id: int):
    account = db.session.get(Account, account_id)
    if not account:
        return error("account_not_found", 404)
    in_use = Transaction.query.filter(
        or_(Transaction.account_id == account_id, Transaction.cash_account_id == account_id)
    ).count()
    if in_use:
        return error("account_has_transactions", 409)
    db.session.delete(account)
    db.session.commit()
    return "", 204
