from __future__ import annotations

from flask import Blueprint, current_app, jsonify

from ..models import ASSET_LABELS, ACCOUNT_LABELS, TXN_LABELS

bp = Blueprint("meta", __name__, url_prefix="/meta")


@bp.get("")
def meta():
    return jsonify(
        {
            "base_currency": current_app.config["BASE_CURRENCY"],
            "asset_types": [{"value": k, "label": v} for k, v in ASSET_LABELS.items()],
            "account_types": [{"value": k, "label": v} for k, v in ACCOUNT_LABELS.items()],
            "transaction_types": [{"value": k, "label": v} for k, v in TXN_LABELS.items()],
            "markets": ["TW", "US", "JP", "HK", "OTHER"],
            "currencies": ["TWD", "USD", "EUR", "JPY", "HKD"],
        }
    )
