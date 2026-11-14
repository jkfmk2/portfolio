from __future__ import annotations

from flask import Blueprint, jsonify, request
from sqlalchemy import or_

from ..extensions import db
from ..models import Instrument, Transaction
from ..schemas import InstrumentIn, InstrumentUpdate
from .common import apply_fields, error, get_json, parse

bp = Blueprint("instruments", __name__, url_prefix="/instruments")


@bp.get("")
def list_instruments():
    query = Instrument.query
    asset_type = request.args.get("asset_type")
    if asset_type:
        query = query.filter(Instrument.asset_type == asset_type)
    search = request.args.get("q")
    if search:
        like = f"%{search}%"
        query = query.filter(or_(Instrument.symbol.ilike(like), Instrument.name.ilike(like)))
    items = query.order_by(Instrument.symbol.asc()).all()
    return jsonify([i.to_dict() for i in items])


@bp.post("")
def create_instrument():
    payload, err = parse(InstrumentIn, get_json())
    if err:
        return err
    exists = Instrument.query.filter_by(
        symbol=payload.symbol.upper(), market=payload.market
    ).first()
    if exists:
        return error("instrument_already_exists", 409)
    data = payload.model_dump()
    data["symbol"] = payload.symbol.upper()
    instrument = Instrument(**data)
    db.session.add(instrument)
    db.session.commit()
    return jsonify(instrument.to_dict()), 201


@bp.get("/<int:instrument_id>")
def get_instrument(instrument_id: int):
    instrument = db.session.get(Instrument, instrument_id)
    if not instrument:
        return error("instrument_not_found", 404)
    return jsonify(instrument.to_dict())


@bp.patch("/<int:instrument_id>")
def update_instrument(instrument_id: int):
    instrument = db.session.get(Instrument, instrument_id)
    if not instrument:
        return error("instrument_not_found", 404)
    payload, err = parse(InstrumentUpdate, get_json())
    if err:
        return err
    changes = payload.model_dump(exclude_unset=True)
    if "symbol" in changes and changes["symbol"]:
        changes["symbol"] = changes["symbol"].upper()
    apply_fields(instrument, changes)
    db.session.commit()
    return jsonify(instrument.to_dict())


@bp.delete("/<int:instrument_id>")
def delete_instrument(instrument_id: int):
    instrument = db.session.get(Instrument, instrument_id)
    if not instrument:
        return error("instrument_not_found", 404)
    if Transaction.query.filter_by(instrument_id=instrument_id).count():
        return error("instrument_has_transactions", 409)
    db.session.delete(instrument)
    db.session.commit()
    return "", 204
