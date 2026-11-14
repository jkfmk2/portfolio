from __future__ import annotations

from datetime import date

import pytest

from app import create_app
from app.config import Config
from app.extensions import db
from app.models import Account, FxRate, Instrument, Price, Transaction
from app.services.portfolio import build_portfolio, get_fx_rate


@pytest.fixture()
def app(tmp_path):
    class TestConfig(Config):
        TESTING = True
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
        BASE_CURRENCY = "TWD"

    application = create_app(TestConfig)
    with application.app_context():
        db.drop_all()
        db.create_all()
        yield application


def _txn(account, instrument=None, **kwargs):
    defaults = dict(
        account_id=account.id,
        instrument_id=instrument.id if instrument else None,
        quantity=0,
        price=0,
        gross_amount=0,
        fee=0,
        tax=0,
        currency="TWD",
        fx_rate=1,
    )
    defaults.update(kwargs)
    return Transaction(**defaults)


def test_moving_average_cost_and_cash(app):
    with app.app_context():
        account = Account(name="A", currency="TWD")
        instrument = Instrument(symbol="X", name="X", asset_type="stock", currency="TWD", market="TW")
        db.session.add_all([account, instrument])
        db.session.commit()

        db.session.add_all(
            [
                _txn(account, type="deposit", trade_date=date(2024, 1, 1), gross_amount=100_000),
                _txn(account, instrument, type="buy", trade_date=date(2024, 1, 2), quantity=100, price=100, gross_amount=10_000, fee=10),
                _txn(account, instrument, type="buy", trade_date=date(2024, 2, 1), quantity=100, price=200, gross_amount=20_000, fee=10),
                Price(instrument_id=instrument.id, date=date(2024, 3, 1), close=180, currency="TWD"),
            ]
        )
        db.session.commit()

        portfolio = build_portfolio(date(2024, 12, 31), "TWD")
        holding = portfolio["holdings"][0]

        assert holding["quantity"] == pytest.approx(200)
        assert holding["avg_cost"] == pytest.approx(30_020 / 200)
        assert holding["market_value"] == pytest.approx(36_000)
        assert holding["unrealized_pnl"] == pytest.approx(36_000 - 30_020)

        cash = portfolio["cash_positions"][0]
        assert cash["amount"] == pytest.approx(100_000 - 10_010 - 20_010)


def test_sell_realizes_pnl(app):
    with app.app_context():
        account = Account(name="A", currency="TWD")
        instrument = Instrument(symbol="X", name="X", asset_type="etf", currency="TWD", market="TW")
        db.session.add_all([account, instrument])
        db.session.commit()

        db.session.add_all(
            [
                _txn(account, instrument, type="buy", trade_date=date(2024, 1, 1), quantity=100, price=100, gross_amount=10_000),
                _txn(account, instrument, type="sell", trade_date=date(2024, 6, 1), quantity=40, price=150, gross_amount=6_000, fee=20),
            ]
        )
        db.session.commit()

        portfolio = build_portfolio(date(2024, 12, 31), "TWD")
        holding = portfolio["holdings"][0]

        assert holding["quantity"] == pytest.approx(60)
        assert holding["avg_cost"] == pytest.approx(100)
        assert holding["realized_pnl"] == pytest.approx(6_000 - 20 - 4_000)
        # 賣出後現金：-10,000 + 5,980
        assert portfolio["cash_positions"][0]["amount"] == pytest.approx(-4_020)


def test_multi_currency_fx_conversion(app):
    with app.app_context():
        account = Account(name="US", currency="USD")
        instrument = Instrument(
            symbol="VOO", name="VOO", asset_type="etf", currency="USD", market="US"
        )
        db.session.add_all([account, instrument])
        db.session.add(FxRate(base_currency="USD", quote_currency="TWD", date=date(2024, 1, 1), rate=32))
        db.session.commit()

        db.session.add_all(
            [
                _txn(account, type="deposit", trade_date=date(2024, 1, 2), gross_amount=10_000, currency="USD"),
                _txn(account, instrument, type="buy", trade_date=date(2024, 1, 3), quantity=10, price=500, gross_amount=5_000, currency="USD"),
                Price(instrument_id=instrument.id, date=date(2024, 6, 1), close=600, currency="USD"),
            ]
        )
        db.session.commit()

        portfolio = build_portfolio(date(2024, 12, 31), "TWD")
        holding = portfolio["holdings"][0]

        assert holding["market_value"] == pytest.approx(6_000)
        assert holding["market_value_base"] == pytest.approx(6_000 * 32)
        assert portfolio["cash_value"] == pytest.approx(5_000 * 32)
        assert portfolio["total_value"] == pytest.approx((6_000 + 5_000) * 32)
        assert get_fx_rate("TWD", "USD", date(2024, 12, 31)) == pytest.approx(1 / 32)


def test_api_create_transaction_and_summary(app):
    client = app.test_client()

    account = client.post(
        "/api/accounts", json={"name": "測試戶", "account_type": "broker", "currency": "TWD"}
    )
    assert account.status_code == 201
    account_id = account.get_json()["id"]

    instrument = client.post(
        "/api/instruments",
        json={"symbol": "2330", "name": "台積電", "asset_type": "stock", "currency": "TWD", "market": "TW"},
    )
    assert instrument.status_code == 201
    instrument_id = instrument.get_json()["id"]

    deposit = client.post(
        "/api/transactions",
        json={"account_id": account_id, "type": "deposit", "trade_date": "2024-01-01", "gross_amount": 100_000},
    )
    assert deposit.status_code == 201

    buy = client.post(
        "/api/transactions",
        json={
            "account_id": account_id,
            "instrument_id": instrument_id,
            "type": "buy",
            "trade_date": "2024-01-02",
            "quantity": 100,
            "price": 500,
            "fee": 20,
        },
    )
    assert buy.status_code == 201
    assert buy.get_json()["gross_amount"] == pytest.approx(50_000)

    client.post(
        "/api/prices",
        json={"instrument_id": instrument_id, "date": "2024-06-01", "close": 600},
    )

    summary = client.get("/api/portfolio/summary?date=2024-12-31").get_json()
    assert summary["securities_value"] == pytest.approx(60_000)
    assert summary["cash_value"] == pytest.approx(49_980)
    assert summary["total_value"] == pytest.approx(109_980)
    assert summary["holdings"][0]["symbol"] == "2330"


def test_reject_trade_without_instrument(app):
    client = app.test_client()
    account = client.post("/api/accounts", json={"name": "A"}).get_json()

    response = client.post(
        "/api/transactions",
        json={"account_id": account["id"], "type": "buy", "trade_date": "2024-01-01", "quantity": 1, "price": 10},
    )
    assert response.status_code == 400
