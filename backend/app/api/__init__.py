from __future__ import annotations

from flask import Blueprint

from . import accounts, instruments, market, meta, portfolio, transactions
from .common import error  # noqa: F401  (re-exported for convenience)

BLUEPRINTS = (
    accounts.bp,
    instruments.bp,
    transactions.bp,
    market.bp,
    portfolio.bp,
    meta.bp,
)


def register_blueprints(app) -> None:
    for blueprint in BLUEPRINTS:
        prefix = f"/api{blueprint.url_prefix or ''}"
        app.register_blueprint(blueprint, url_prefix=prefix)
