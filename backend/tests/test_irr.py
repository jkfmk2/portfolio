from __future__ import annotations

from datetime import date

import pytest

from app import create_app
from app.config import Config
from app.extensions import db
from app.models import Account, Instrument, Price, Transaction
from app.services.irr import build_irr_report, xirr


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


def _setup(currency="TWD", symbol="X", market="TW"):
    account = Account(name="Broker", currency=currency)
    instrument = Instrument(
        symbol=symbol, name=symbol, asset_type="stock", currency=currency, market=market
    )
    db.session.add_all([account, instrument])
    db.session.commit()
    return account, instrument


def test_xirr_known_annual_rate():
    rate = xirr(
        [
            (date(2023, 1, 1), -1_000),
            (date(2024, 1, 1), 1_100),
        ]
    )
    assert rate == pytest.approx(0.10, abs=1e-6)


def test_xirr_requires_positive_and_negative_flows():
    assert xirr([(date(2024, 1, 1), -1_000)]) is None
    assert xirr([(date(2024, 1, 1), 1_000), (date(2024, 6, 1), 1_100)]) is None
    assert xirr([(date(2024, 1, 1), -1_000), (date(2024, 1, 1), 1_100)]) is None


def test_period_irr_uses_opening_value(app):
    with app.app_context():
        account, instrument = _setup()
        db.session.add_all(
            [
                _txn(account, type="deposit", trade_date=date(2023, 12, 1), gross_amount=100_000),
                _txn(
                    account,
                    instrument,
                    type="buy",
                    trade_date=date(2023, 12, 2),
                    quantity=100,
                    price=100,
                    gross_amount=10_000,
                ),
                Price(instrument_id=instrument.id, date=date(2023, 12, 31), close=100),
                Price(instrument_id=instrument.id, date=date(2024, 12, 31), close=110),
            ]
        )
        db.session.commit()

        report = build_irr_report(date(2024, 1, 1), date(2024, 12, 31), "TWD")
        summary = report["summary"]

        assert summary["start_value"] == pytest.approx(100_000)
        assert summary["end_value"] == pytest.approx(101_000)
        assert summary["gain"] == pytest.approx(1_000)
        assert summary["net_flow"] == pytest.approx(0)
        assert summary["days"] == 365
        assert summary["irr_pct"] == pytest.approx(1.0, abs=0.001)


def test_only_external_cash_flows_are_counted(app):
    with app.app_context():
        account, instrument = _setup()
        db.session.add_all(
            [
                _txn(account, type="deposit", trade_date=date(2024, 1, 1), gross_amount=100_000),
                _txn(
                    account,
                    instrument,
                    type="buy",
                    trade_date=date(2024, 1, 2),
                    quantity=100,
                    price=100,
                    gross_amount=10_000,
                ),
                _txn(
                    account,
                    instrument,
                    type="sell",
                    trade_date=date(2024, 6, 1),
                    quantity=10,
                    price=120,
                    gross_amount=1_200,
                ),
                _txn(
                    account,
                    instrument,
                    type="dividend",
                    trade_date=date(2024, 7, 1),
                    gross_amount=500,
                ),
                _txn(account, type="withdraw", trade_date=date(2024, 8, 1), gross_amount=5_000),
            ]
        )
        db.session.commit()

        report = build_irr_report(date(2024, 1, 1), date(2024, 12, 31), "TWD")

        assert {flow["type"] for flow in report["flows"]} == {"deposit", "withdraw"}
        assert report["summary"]["contributed"] == pytest.approx(100_000)
        assert report["summary"]["withdrawn"] == pytest.approx(5_000)
        assert report["summary"]["net_flow"] == pytest.approx(95_000)


def test_internal_transfers_are_excluded_from_external_flows(app):
    with app.app_context():
        broker, _ = _setup()
        bank = Account(name="Bank", currency="TWD")
        db.session.add(bank)
        db.session.commit()

        db.session.add_all(
            [
                _txn(bank, type="deposit", trade_date=date(2024, 1, 1), gross_amount=100_000),
                _txn(bank, type="transfer_out", trade_date=date(2024, 2, 1), gross_amount=20_000),
                _txn(broker, type="transfer_in", trade_date=date(2024, 2, 1), gross_amount=20_000),
            ]
        )
        db.session.commit()

        report = build_irr_report(date(2024, 1, 1), date(2024, 12, 31), "TWD")
        summary = report["summary"]

        # The transfer is internal: total assets stay at 100,000 and only the
        # original deposit is an external flow.
        assert summary["start_value"] == pytest.approx(0)
        assert summary["end_value"] == pytest.approx(100_000)
        assert summary["contributed"] == pytest.approx(100_000)
        assert summary["withdrawn"] == pytest.approx(0)
        assert summary["net_flow"] == pytest.approx(100_000)
        assert [flow["type"] for flow in report["flows"]] == ["deposit"]


def test_year_and_month_buckets(app):
    with app.app_context():
        account, instrument = _setup()
        db.session.add_all(
            [
                _txn(account, type="deposit", trade_date=date(2023, 12, 31), gross_amount=100_000),
                _txn(
                    account,
                    instrument,
                    type="buy",
                    trade_date=date(2023, 12, 31),
                    quantity=100,
                    price=100,
                    gross_amount=10_000,
                ),
                Price(instrument_id=instrument.id, date=date(2023, 12, 31), close=100),
                Price(instrument_id=instrument.id, date=date(2024, 6, 30), close=110),
                Price(instrument_id=instrument.id, date=date(2024, 12, 31), close=120),
            ]
        )
        db.session.commit()

        report = build_irr_report(date(2024, 1, 1), date(2024, 12, 31), "TWD")

        assert len(report["years"]) == 1
        year = report["years"][0]
        assert year["period"] == "2024"
        assert year["partial"] is False
        assert year["start_value"] == pytest.approx(100_000)
        assert year["end_value"] == pytest.approx(102_000)
        assert year["gain"] == pytest.approx(2_000)
        assert year["irr_pct"] == pytest.approx(2.0, abs=0.01)

        assert len(report["months"]) == 12
        june = next(bucket for bucket in report["months"] if bucket["period"] == "2024-06")
        july = next(bucket for bucket in report["months"] if bucket["period"] == "2024-07")
        assert june["start_value"] == pytest.approx(100_000)
        assert june["end_value"] == pytest.approx(101_000)
        assert june["gain"] == pytest.approx(1_000)
        assert july["start_value"] == pytest.approx(101_000)
        assert july["end_value"] == pytest.approx(101_000)
        assert july["gain"] == pytest.approx(0)


def test_custom_range_marks_partial_buckets(app):
    with app.app_context():
        account, instrument = _setup()
        db.session.add_all(
            [
                _txn(account, type="deposit", trade_date=date(2023, 12, 31), gross_amount=100_000),
                _txn(
                    account,
                    instrument,
                    type="buy",
                    trade_date=date(2023, 12, 31),
                    quantity=100,
                    price=100,
                    gross_amount=10_000,
                ),
                Price(instrument_id=instrument.id, date=date(2023, 12, 31), close=100),
                Price(instrument_id=instrument.id, date=date(2024, 9, 15), close=110),
            ]
        )
        db.session.commit()

        report = build_irr_report(date(2024, 3, 15), date(2024, 9, 15), "TWD")

        assert len(report["years"]) == 1
        assert report["years"][0]["partial"] is True
        assert report["years"][0]["from"] == "2024-03-15"
        assert report["years"][0]["to"] == "2024-09-15"

        assert len(report["months"]) == 7
        assert report["months"][0]["period"] == "2024-03"
        assert report["months"][0]["partial"] is True
        assert report["months"][-1]["period"] == "2024-09"
        assert report["months"][-1]["partial"] is True
        assert report["summary"]["start_value"] == pytest.approx(100_000)
        assert report["summary"]["end_value"] == pytest.approx(101_000)


def test_since_inception_uses_first_contribution(app):
    with app.app_context():
        account, instrument = _setup()
        db.session.add_all(
            [
                _txn(account, type="deposit", trade_date=date(2023, 1, 1), gross_amount=1_000),
                _txn(
                    account,
                    instrument,
                    type="buy",
                    trade_date=date(2023, 1, 2),
                    quantity=10,
                    price=100,
                    gross_amount=1_000,
                ),
                Price(instrument_id=instrument.id, date=date(2024, 1, 1), close=110),
            ]
        )
        db.session.commit()

        report = build_irr_report(date(2023, 6, 1), date(2024, 1, 1), "TWD")
        inception = report["since_inception"]

        assert inception["from"] == "2023-01-01"
        assert inception["days"] == 365
        assert inception["irr_pct"] == pytest.approx(10.0, abs=0.001)
        assert inception["contributed"] == pytest.approx(1_000)
        assert inception["end_value"] == pytest.approx(1_100)


def test_empty_portfolio_returns_null_irr(app):
    with app.app_context():
        report = build_irr_report(date(2024, 1, 1), date(2024, 12, 31), "TWD")

        assert report["summary"]["irr_pct"] is None
        assert report["summary"]["start_value"] == pytest.approx(0)
        assert report["summary"]["end_value"] == pytest.approx(0)
        assert report["since_inception"]["irr_pct"] is None
        assert report["since_inception"]["from"] is None
        assert len(report["years"]) == 1
        assert len(report["months"]) == 12
        assert all(bucket["irr_pct"] is None for bucket in report["months"])


def test_single_day_has_no_irr(app):
    with app.app_context():
        account, _ = _setup()
        db.session.add(
            _txn(account, type="deposit", trade_date=date(2024, 6, 1), gross_amount=10_000)
        )
        db.session.commit()

        report = build_irr_report(date(2024, 6, 1), date(2024, 6, 1), "TWD")

        assert report["summary"]["days"] == 0
        assert report["summary"]["irr_pct"] is None


def test_missing_fx_warns_and_falls_back_to_one(app):
    with app.app_context():
        account, _ = _setup("USD", symbol="XUSD", market="US")
        db.session.add(
            _txn(
                account,
                type="deposit",
                trade_date=date(2024, 1, 1),
                gross_amount=1_000,
                currency="USD",
            )
        )
        db.session.commit()

        report = build_irr_report(date(2024, 1, 1), date(2024, 12, 31), "TWD")

        assert report["flows"][0]["fx_rate"] == pytest.approx(1)
        assert any("USD/TWD" in warning for warning in report["warnings"])


def test_api_irr_defaults_validation_and_shape(app):
    client = app.test_client()

    today = date.today()
    default = client.get("/api/reports/irr").get_json()
    assert default["from"] == date(today.year, 1, 1).isoformat()
    assert default["to"] == today.isoformat()
    assert "account_id" not in default
    assert set(default["summary"]) == {
        "irr_pct",
        "days",
        "start_value",
        "end_value",
        "contributed",
        "withdrawn",
        "net_flow",
        "gain",
    }

    bad = client.get("/api/reports/irr?from=2024-13-01")
    assert bad.status_code == 400
    assert bad.get_json()["error"] == "invalid_date"

    inverted = client.get("/api/reports/irr?from=2024-12-31&to=2024-01-01")
    assert inverted.status_code == 400
    assert inverted.get_json()["error"] == "invalid_date_range"

    account = client.post("/api/accounts", json={"name": "Broker", "currency": "TWD"}).get_json()
    instrument = client.post(
        "/api/instruments",
        json={"symbol": "X", "name": "X", "asset_type": "stock", "currency": "TWD", "market": "TW"},
    ).get_json()
    client.post(
        "/api/transactions",
        json={
            "account_id": account["id"],
            "type": "deposit",
            "trade_date": "2024-01-01",
            "gross_amount": 10_000,
        },
    )
    client.post(
        "/api/transactions",
        json={
            "account_id": account["id"],
            "instrument_id": instrument["id"],
            "type": "buy",
            "trade_date": "2024-01-02",
            "quantity": 10,
            "price": 100,
        },
    )
    client.post(
        "/api/prices",
        json={"instrument_id": instrument["id"], "date": "2024-12-31", "close": 110},
    )

    body = client.get("/api/reports/irr?from=2024-01-01&to=2024-12-31").get_json()

    assert body["base_currency"] == "TWD"
    assert len(body["flows"]) == 1
    assert body["flows"][0]["type"] == "deposit"
    assert body["summary"]["start_value"] == pytest.approx(0)
    assert body["summary"]["end_value"] == pytest.approx(10_100)
    assert body["years"][0]["period"] == "2024"
    assert len(body["months"]) == 12
