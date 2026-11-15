from __future__ import annotations

from datetime import date

import pytest

from app import create_app
from app.config import Config
from app.extensions import db
from app.models import Account, FxRate, Instrument, Transaction
from app.services.portfolio import build_portfolio
from app.services.reports import build_income_report


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


def test_realized_only_in_period(app):
    with app.app_context():
        account, instrument = _setup()
        db.session.add_all(
            [
                _txn(
                    account, instrument, type="buy", trade_date=date(2024, 1, 2),
                    quantity=100, price=100, gross_amount=10_000, fee=10,
                ),
                _txn(
                    account, instrument, type="sell", trade_date=date(2024, 3, 5),
                    quantity=50, price=150, gross_amount=7_500, fee=5, tax=2,
                ),
            ]
        )
        db.session.commit()

        report = build_income_report(date(2024, 1, 1), date(2024, 3, 31), "TWD")

        assert len(report["realized"]) == 1
        row = report["realized"][0]
        assert row["quantity"] == pytest.approx(50)
        assert row["proceeds"] == pytest.approx(7_500)
        assert row["cost_basis"] == pytest.approx(50 * 100.1)
        assert row["realized_pnl"] == pytest.approx(7_500 - 7 - 5_005)
        assert report["totals"]["realized_pnl"] == pytest.approx(7_500 - 7 - 5_005)
        assert report["totals"]["fees"] == pytest.approx(5)
        assert report["totals"]["taxes"] == pytest.approx(2)

        # The sale happened in March, so earlier months must stay empty.
        assert report["buckets"][0]["realized_pnl"] == pytest.approx(0)
        assert report["buckets"][-1]["realized_pnl"] == pytest.approx(7_500 - 7 - 5_005)


def test_sells_outside_period_are_excluded(app):
    with app.app_context():
        account, instrument = _setup()
        db.session.add_all(
            [
                _txn(
                    account, instrument, type="buy", trade_date=date(2024, 1, 2),
                    quantity=100, price=100, gross_amount=10_000,
                ),
                _txn(
                    account, instrument, type="sell", trade_date=date(2024, 2, 5),
                    quantity=100, price=120, gross_amount=12_000,
                ),
            ]
        )
        db.session.commit()

        report = build_income_report(date(2024, 3, 1), date(2024, 3, 31), "TWD")

        assert report["realized"] == []
        assert report["totals"]["realized_pnl"] == pytest.approx(0)
        assert len(report["buckets"]) == 1


def test_split_adjusts_cost_before_sale(app):
    with app.app_context():
        account, instrument = _setup()
        db.session.add_all(
            [
                _txn(
                    account, instrument, type="buy", trade_date=date(2024, 1, 2),
                    quantity=100, price=100, gross_amount=10_000,
                ),
                _txn(
                    account, instrument, type="split", trade_date=date(2024, 2, 1),
                    quantity=100,
                ),
                _txn(
                    account, instrument, type="sell", trade_date=date(2024, 4, 1),
                    quantity=200, price=60, gross_amount=12_000,
                ),
            ]
        )
        db.session.commit()

        report = build_income_report(date(2024, 4, 1), date(2024, 4, 30), "TWD")

        assert report["realized"][0]["cost_basis"] == pytest.approx(10_000)
        assert report["realized"][0]["realized_pnl"] == pytest.approx(2_000)


def test_dividend_and_interest_keep_gross_fee_tax_net(app):
    with app.app_context():
        account, instrument = _setup()
        db.session.add_all(
            [
                _txn(
                    account, instrument, type="dividend", trade_date=date(2024, 7, 15),
                    gross_amount=1_000, fee=10, tax=20,
                ),
                _txn(
                    account, instrument, type="interest", trade_date=date(2024, 7, 20),
                    gross_amount=500, tax=5,
                ),
            ]
        )
        db.session.commit()

        report = build_income_report(date(2024, 1, 1), date(2024, 12, 31), "TWD")

        assert len(report["income"]) == 2
        dividend = next(r for r in report["income"] if r["type"] == "dividend")
        assert dividend["gross"] == pytest.approx(1_000)
        assert dividend["net"] == pytest.approx(970)
        interest = next(r for r in report["income"] if r["type"] == "interest")
        assert interest["net"] == pytest.approx(495)

        month = next(b for b in report["buckets"] if b["period"] == "2024-07")
        assert month["dividends_gross"] == pytest.approx(1_000)
        assert month["dividends_net"] == pytest.approx(970)
        assert month["interest_gross"] == pytest.approx(500)
        assert month["interest_net"] == pytest.approx(495)
        assert month["fees"] == pytest.approx(10)
        assert month["taxes"] == pytest.approx(25)
        assert month["income_net"] == pytest.approx(1_465)
        assert month["total"] == pytest.approx(1_465)
        assert report["totals"]["income_gross"] == pytest.approx(1_500)
        assert report["totals"]["income_net"] == pytest.approx(1_465)


def test_account_scope_filters_other_accounts(app):
    with app.app_context():
        first = Account(name="A", currency="TWD")
        second = Account(name="B", currency="TWD")
        instrument = Instrument(
            symbol="X", name="X", asset_type="stock", currency="TWD", market="TW"
        )
        db.session.add_all([first, second, instrument])
        db.session.commit()

        db.session.add_all(
            [
                _txn(first, instrument, type="buy", trade_date=date(2024, 1, 2),
                     quantity=10, price=100, gross_amount=1_000),
                _txn(first, instrument, type="sell", trade_date=date(2024, 5, 2),
                     quantity=10, price=150, gross_amount=1_500),
                _txn(second, instrument, type="buy", trade_date=date(2024, 1, 3),
                     quantity=10, price=100, gross_amount=1_000),
                _txn(second, instrument, type="sell", trade_date=date(2024, 5, 3),
                     quantity=10, price=200, gross_amount=2_000),
            ]
        )
        db.session.commit()

        report = build_income_report(date(2024, 1, 1), date(2024, 12, 31), "TWD", first.id)

        assert len(report["realized"]) == 1
        assert report["realized"][0]["account_id"] == first.id
        assert report["totals"]["realized_pnl"] == pytest.approx(500)


def test_report_uses_end_date_fx(app):
    with app.app_context():
        account, instrument = _setup("USD")
        db.session.add_all(
            [
                FxRate(base_currency="USD", quote_currency="TWD", date=date(2024, 3, 1), rate=30),
                _txn(account, instrument, type="buy", trade_date=date(2024, 1, 2),
                     quantity=10, price=100, gross_amount=1_000, currency="USD"),
                _txn(account, instrument, type="sell", trade_date=date(2024, 3, 10),
                     quantity=10, price=120, gross_amount=1_200, fee=1, currency="USD"),
            ]
        )
        db.session.commit()

        report = build_income_report(date(2024, 3, 1), date(2024, 3, 31), "TWD")

        assert report["realized"][0]["fx_rate"] == pytest.approx(30)
        assert report["realized"][0]["realized_pnl"] == pytest.approx(199)
        assert report["realized"][0]["realized_pnl_base"] == pytest.approx(5_970)


def test_missing_fx_falls_back_to_one_with_warning(app):
    with app.app_context():
        account, instrument = _setup("GBP")
        db.session.add_all(
            [
                _txn(account, instrument, type="buy", trade_date=date(2024, 1, 2),
                     quantity=10, price=100, gross_amount=1_000, currency="GBP"),
                _txn(account, instrument, type="sell", trade_date=date(2024, 2, 2),
                     quantity=10, price=110, gross_amount=1_100, currency="GBP"),
            ]
        )
        db.session.commit()

        report = build_income_report(date(2024, 2, 1), date(2024, 2, 29), "TWD")

        assert report["realized"][0]["fx_rate"] == pytest.approx(1)
        assert any("GBP/TWD" in warning for warning in report["warnings"])


def test_oversell_is_capped_and_warned(app):
    with app.app_context():
        account, instrument = _setup()
        db.session.add_all(
            [
                _txn(account, instrument, type="buy", trade_date=date(2024, 1, 2),
                     quantity=10, price=100, gross_amount=1_000),
                _txn(account, instrument, type="sell", trade_date=date(2024, 2, 2),
                     quantity=20, price=120, gross_amount=2_400),
            ]
        )
        db.session.commit()

        report = build_income_report(date(2024, 2, 1), date(2024, 2, 29), "TWD")

        assert report["realized"][0]["quantity"] == pytest.approx(10)
        assert report["realized"][0]["realized_pnl"] == pytest.approx(200)
        assert any("超過持倉" in warning for warning in report["warnings"])


def test_empty_year_has_twelve_zero_buckets(app):
    with app.app_context():
        report = build_income_report(date(2024, 1, 1), date(2024, 12, 31), "TWD")

        assert len(report["buckets"]) == 12
        assert all(bucket["total"] == 0 for bucket in report["buckets"])
        assert report["totals"]["total"] == 0
        assert report["realized"] == []
        assert report["income"] == []


def test_period_boundaries_are_inclusive(app):
    with app.app_context():
        account, instrument = _setup()
        db.session.add_all(
            [
                _txn(account, instrument, type="buy", trade_date=date(2024, 1, 1),
                     quantity=10, price=100, gross_amount=1_000),
                _txn(account, instrument, type="sell", trade_date=date(2024, 2, 1),
                     quantity=10, price=110, gross_amount=1_100),
            ]
        )
        db.session.commit()

        report = build_income_report(date(2024, 2, 1), date(2024, 2, 1), "TWD")

        assert len(report["realized"]) == 1


def test_report_reconciles_with_portfolio(app):
    with app.app_context():
        account, instrument = _setup()
        usd_account, usd_instrument = _setup("USD", symbol="XUSD", market="US")
        db.session.add_all(
            [
                FxRate(base_currency="USD", quote_currency="TWD", date=date(2024, 1, 1), rate=31),
                _txn(account, instrument, type="buy", trade_date=date(2024, 1, 2),
                     quantity=100, price=100, gross_amount=10_000, fee=10),
                _txn(account, instrument, type="sell", trade_date=date(2024, 3, 5),
                     quantity=40, price=150, gross_amount=6_000, fee=5, tax=2),
                _txn(account, instrument, type="dividend", trade_date=date(2024, 7, 1),
                     gross_amount=300, fee=3, tax=6),
                _txn(usd_account, usd_instrument, type="buy", trade_date=date(2024, 2, 1),
                     quantity=10, price=100, gross_amount=1_000, currency="USD"),
                _txn(usd_account, usd_instrument, type="sell", trade_date=date(2024, 8, 1),
                     quantity=10, price=120, gross_amount=1_200, fee=1, currency="USD"),
            ]
        )
        db.session.commit()

        end = date(2024, 12, 31)
        report = build_income_report(date(2000, 1, 1), end, "TWD")
        portfolio = build_portfolio(end, "TWD")

        assert report["totals"]["realized_pnl"] == pytest.approx(portfolio["realized_pnl"])
        assert report["totals"]["income_gross"] == pytest.approx(portfolio["income"])
        assert report["totals"]["total"] == pytest.approx(
            portfolio["realized_pnl"] + 291
        )


def test_api_defaults_and_validation(app):
    client = app.test_client()

    today = date.today()
    default = client.get("/api/reports/income").get_json()
    assert default["from"] == date(today.year, 1, 1).isoformat()
    assert default["to"] == today.isoformat()

    bad = client.get("/api/reports/income?from=2024-13-01")
    assert bad.status_code == 400
    assert bad.get_json()["error"] == "invalid_date"

    inverted = client.get("/api/reports/income?from=2024-12-31&to=2024-01-01")
    assert inverted.status_code == 400
    assert inverted.get_json()["error"] == "invalid_date_range"


def test_api_income_report_shape(app):
    client = app.test_client()
    account = client.post("/api/accounts", json={"name": "Broker", "currency": "TWD"}).get_json()
    instrument = client.post(
        "/api/instruments",
        json={"symbol": "X", "name": "X", "asset_type": "stock", "currency": "TWD", "market": "TW"},
    ).get_json()

    common = {"account_id": account["id"], "instrument_id": instrument["id"]}
    client.post(
        "/api/transactions",
        json={**common, "type": "buy", "trade_date": "2024-01-02", "quantity": 10, "price": 100},
    )
    client.post(
        "/api/transactions",
        json={
            **common, "type": "sell", "trade_date": "2024-06-05",
            "quantity": 4, "price": 130, "fee": 2, "tax": 1,
        },
    )
    client.post(
        "/api/transactions",
        json={**common, "type": "dividend", "trade_date": "2024-08-01", "gross_amount": 50, "fee": 1, "tax": 0},
    )

    body = client.get("/api/reports/income?from=2024-06-01&to=2024-08-31").get_json()

    assert body["base_currency"] == "TWD"
    assert body["account_id"] is None
    assert len(body["buckets"]) == 3
    assert len(body["realized"]) == 1
    assert len(body["income"]) == 1
    assert body["totals"]["realized_pnl"] == pytest.approx(4 * 130 - 3 - 4 * 100)
    assert body["totals"]["income_net"] == pytest.approx(49)
    assert body["totals"]["total"] == pytest.approx(117 + 49)
    assert body["realized"][0]["symbol"] == "X"
    assert body["buckets"][0]["period"] == "2024-06"
    assert body["warnings"] == []
