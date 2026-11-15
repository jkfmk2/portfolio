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


def test_funding_account_separate_from_holding(app):
    with app.app_context():
        bank = Account(name="Bank", currency="TWD")
        broker = Account(name="Broker", currency="TWD")
        instrument = Instrument(symbol="X", name="X", asset_type="stock", currency="TWD", market="TW")
        db.session.add_all([bank, broker, instrument])
        db.session.commit()

        db.session.add_all(
            [
                _txn(bank, type="deposit", trade_date=date(2024, 1, 1), gross_amount=100_000),
                _txn(
                    broker, instrument, type="buy", trade_date=date(2024, 1, 2),
                    cash_account_id=bank.id, quantity=100, price=100, gross_amount=10_000, fee=10,
                ),
            ]
        )
        db.session.commit()

        portfolio = build_portfolio(date(2024, 12, 31), "TWD")

        assert len(portfolio["holdings"]) == 1
        assert portfolio["holdings"][0]["account_id"] == broker.id

        cash = {p["account_id"]: p["amount"] for p in portfolio["cash_positions"]}
        assert cash[bank.id] == pytest.approx(89_990)
        assert broker.id not in cash
        assert portfolio["cash_value"] == pytest.approx(89_990)


def test_dividend_cash_goes_to_funding_account(app):
    with app.app_context():
        bank = Account(name="Bank", currency="TWD")
        broker = Account(name="Broker", currency="TWD")
        instrument = Instrument(symbol="X", name="X", asset_type="stock", currency="TWD", market="TW")
        db.session.add_all([bank, broker, instrument])
        db.session.commit()

        db.session.add_all(
            [
                _txn(broker, instrument, type="buy", trade_date=date(2024, 1, 2), quantity=100, price=100, gross_amount=10_000),
                _txn(
                    broker, instrument, type="dividend", trade_date=date(2024, 6, 1),
                    cash_account_id=bank.id, gross_amount=300,
                ),
            ]
        )
        db.session.commit()

        portfolio = build_portfolio(date(2024, 12, 31), "TWD")
        holding = portfolio["holdings"][0]

        assert holding["account_id"] == broker.id
        assert holding["income"] == pytest.approx(300)
        cash = {p["account_id"]: p["amount"] for p in portfolio["cash_positions"]}
        assert cash[bank.id] == pytest.approx(300)


def test_account_scoped_summary(app):
    with app.app_context():
        bank = Account(name="Bank", currency="TWD")
        broker = Account(name="Broker", currency="TWD")
        instrument = Instrument(symbol="X", name="X", asset_type="stock", currency="TWD", market="TW")
        db.session.add_all([bank, broker, instrument])
        db.session.commit()

        db.session.add_all(
            [
                _txn(bank, type="deposit", trade_date=date(2024, 1, 1), gross_amount=100_000),
                _txn(
                    broker, instrument, type="buy", trade_date=date(2024, 1, 2),
                    cash_account_id=bank.id, quantity=100, price=100, gross_amount=10_000,
                ),
            ]
        )
        db.session.commit()

        broker_view = build_portfolio(date(2024, 12, 31), "TWD", account_id=broker.id)
        assert broker_view["holdings_count"] == 1
        assert broker_view["total_value"] == pytest.approx(10_000)
        assert broker_view["cash_value"] == pytest.approx(0)
        assert broker_view["accounts_count"] == 1

        bank_view = build_portfolio(date(2024, 12, 31), "TWD", account_id=bank.id)
        assert bank_view["holdings_count"] == 0
        assert bank_view["total_value"] == pytest.approx(90_000)
        assert bank_view["cash_value"] == pytest.approx(90_000)


def test_realized_pnl_survives_closed_position(app):
    with app.app_context():
        account = Account(name="A", currency="TWD")
        instrument = Instrument(symbol="X", name="X", asset_type="stock", currency="TWD", market="TW")
        db.session.add_all([account, instrument])
        db.session.commit()

        db.session.add_all(
            [
                _txn(account, instrument, type="buy", trade_date=date(2024, 1, 1), quantity=100, price=100, gross_amount=10_000),
                _txn(account, instrument, type="sell", trade_date=date(2024, 6, 1), quantity=100, price=150, gross_amount=15_000, fee=10),
            ]
        )
        db.session.commit()

        portfolio = build_portfolio(date(2024, 12, 31), "TWD")

        assert portfolio["holdings"] == []
        assert portfolio["realized_pnl"] == pytest.approx(4_990)
        assert portfolio["cash_value"] == pytest.approx(4_990)


def test_api_edit_transaction(app):
    client = app.test_client()
    account = client.post("/api/accounts", json={"name": "A", "currency": "TWD"}).get_json()
    instrument = client.post(
        "/api/instruments",
        json={"symbol": "2330", "asset_type": "stock", "currency": "TWD", "market": "TW"},
    ).get_json()

    buy = client.post(
        "/api/transactions",
        json={
            "account_id": account["id"],
            "instrument_id": instrument["id"],
            "type": "buy",
            "trade_date": "2024-01-02",
            "quantity": 10,
            "price": 100,
            "fee": 5,
        },
    ).get_json()
    assert buy["gross_amount"] == pytest.approx(1_000)
    assert buy["cash_flow"] == pytest.approx(-1_005)

    edited = client.patch(
        f"/api/transactions/{buy['id']}",
        json={"quantity": 20, "price": 90, "fee": 10},
    )
    assert edited.status_code == 200
    body = edited.get_json()
    assert body["gross_amount"] == pytest.approx(1_800)
    assert body["cash_flow"] == pytest.approx(-1_810)
    assert body["note"] is None
    assert body["cash_account_id"] is None

    summary = client.get("/api/portfolio/summary?date=2024-12-31").get_json()
    assert summary["cash_value"] == pytest.approx(-1_810)


def test_api_rejects_unknown_cash_account(app):
    client = app.test_client()
    account = client.post("/api/accounts", json={"name": "A"}).get_json()
    instrument = client.post(
        "/api/instruments", json={"symbol": "X", "currency": "TWD", "market": "TW"}
    ).get_json()

    response = client.post(
        "/api/transactions",
        json={
            "account_id": account["id"],
            "cash_account_id": 9_999,
            "instrument_id": instrument["id"],
            "type": "buy",
            "trade_date": "2024-01-01",
            "quantity": 1,
            "price": 10,
        },
    )
    assert response.status_code == 404
    assert response.get_json()["error"] == "cash_account_not_found"


def test_api_lists_transactions_by_funding_account(app):
    client = app.test_client()
    broker = client.post("/api/accounts", json={"name": "Broker"}).get_json()
    bank = client.post("/api/accounts", json={"name": "Bank"}).get_json()
    instrument = client.post(
        "/api/instruments", json={"symbol": "X", "currency": "TWD", "market": "TW"}
    ).get_json()

    created = client.post(
        "/api/transactions",
        json={
            "account_id": broker["id"],
            "cash_account_id": bank["id"],
            "instrument_id": instrument["id"],
            "type": "buy",
            "trade_date": "2024-01-01",
            "quantity": 1,
            "price": 10,
        },
    )
    assert created.status_code == 201
    assert created.get_json()["cash_account_name"] == "Bank"
    assert created.get_json()["funding_account_name"] == "Bank"

    listing = client.get(f"/api/transactions?account_id={bank['id']}").get_json()
    assert listing["total"] == 1
    assert listing["items"][0]["account_name"] == "Broker"

    broker_only = client.get(f"/api/transactions?account_id={broker['id']}").get_json()
    assert broker_only["total"] == 1


def test_cash_account_ignored_without_instrument(app):
    client = app.test_client()
    account = client.post("/api/accounts", json={"name": "A"}).get_json()
    other = client.post("/api/accounts", json={"name": "B"}).get_json()

    created = client.post(
        "/api/transactions",
        json={
            "account_id": account["id"],
            "cash_account_id": other["id"],
            "type": "deposit",
            "trade_date": "2024-01-01",
            "gross_amount": 1_000,
        },
    ).get_json()
    assert created["cash_account_id"] is None


def test_api_rejects_editing_trade_to_have_no_instrument(app):
    client = app.test_client()
    account = client.post("/api/accounts", json={"name": "A"}).get_json()
    instrument = client.post(
        "/api/instruments", json={"symbol": "X", "currency": "TWD", "market": "TW"}
    ).get_json()
    buy = client.post(
        "/api/transactions",
        json={
            "account_id": account["id"],
            "instrument_id": instrument["id"],
            "type": "buy",
            "trade_date": "2024-01-01",
            "quantity": 1,
            "price": 10,
        },
    ).get_json()

    response = client.patch(f"/api/transactions/{buy['id']}", json={"instrument_id": None})
    assert response.status_code == 400
    assert response.get_json()["error"] == "instrument_required_for_trade"


def test_api_blocks_delete_of_funding_account(app):
    client = app.test_client()
    broker = client.post("/api/accounts", json={"name": "Broker"}).get_json()
    bank = client.post("/api/accounts", json={"name": "Bank"}).get_json()
    instrument = client.post(
        "/api/instruments", json={"symbol": "X", "currency": "TWD", "market": "TW"}
    ).get_json()
    client.post(
        "/api/transactions",
        json={
            "account_id": broker["id"],
            "cash_account_id": bank["id"],
            "instrument_id": instrument["id"],
            "type": "buy",
            "trade_date": "2024-01-01",
            "quantity": 1,
            "price": 10,
        },
    )

    response = client.delete(f"/api/accounts/{bank['id']}")
    assert response.status_code == 409
    assert response.get_json()["error"] == "account_has_transactions"
