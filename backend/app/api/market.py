from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models import FxRate, Instrument, Price
from ..schemas import FxRateIn, PriceIn
from .common import error, get_json, parse

bp = Blueprint("market", __name__, url_prefix="")


@bp.get("/prices")
def list_prices():
    query = Price.query
    instrument_id = request.args.get("instrument_id", type=int)
    if instrument_id:
        query = query.filter(Price.instrument_id == instrument_id)
    start = request.args.get("start")
    if start:
        query = query.filter(Price.date >= start)
    items = query.order_by(Price.date.desc(), Price.instrument_id.asc()).limit(1000).all()
    return jsonify([p.to_dict() for p in items])


@bp.post("/prices")
def upsert_price():
    payload, err = parse(PriceIn, get_json())
    if err:
        return err
    instrument = db.session.get(Instrument, payload.instrument_id)
    if not instrument:
        return error("instrument_not_found", 404)

    row = Price.query.filter_by(
        instrument_id=payload.instrument_id, date=payload.date
    ).first()
    if row is None:
        row = Price(
            instrument_id=payload.instrument_id,
            date=payload.date,
            currency=payload.currency or instrument.currency,
            close=payload.close,
            source=payload.source,
        )
        db.session.add(row)
    else:
        row.close = payload.close
        row.currency = payload.currency or instrument.currency
        row.source = payload.source
    db.session.commit()
    return jsonify(row.to_dict()), 201


@bp.delete("/prices/<int:price_id>")
def delete_price(price_id: int):
    row = db.session.get(Price, price_id)
    if not row:
        return error("price_not_found", 404)
    db.session.delete(row)
    db.session.commit()
    return "", 204


@bp.get("/fx-rates")
def list_fx_rates():
    query = FxRate.query
    pair = request.args.get("pair")
    if pair and "/" in pair:
        base, quote = pair.upper().split("/", 1)
        query = query.filter(FxRate.base_currency == base, FxRate.quote_currency == quote)
    items = query.order_by(FxRate.date.desc()).limit(500).all()
    return jsonify([r.to_dict() for r in items])


@bp.post("/fx-rates")
def upsert_fx_rate():
    payload, err = parse(FxRateIn, get_json())
    if err:
        return err
    row = FxRate.query.filter_by(
        base_currency=payload.base_currency,
        quote_currency=payload.quote_currency,
        date=payload.date,
    ).first()
    if row is None:
        row = FxRate(**payload.model_dump())
        db.session.add(row)
    else:
        row.rate = payload.rate
        row.source = payload.source
    db.session.commit()
    return jsonify(row.to_dict()), 201


@bp.delete("/fx-rates/<int:rate_id>")
def delete_fx_rate(rate_id: int):
    row = db.session.get(FxRate, rate_id)
    if not row:
        return error("fx_rate_not_found", 404)
    db.session.delete(row)
    db.session.commit()
    return "", 204
