from __future__ import annotations

from datetime import date

import click
from flask.cli import with_appcontext

from .extensions import db


def register_cli(app) -> None:
    app.cli.add_command(init_db)
    app.cli.add_command(seed_demo)
    app.cli.add_command(reset_db)


@click.command("init-db")
@with_appcontext
def init_db() -> None:
    """Create all tables if they do not exist."""
    db.create_all()
    click.echo("Database ready.")


@click.command("reset-db")
@click.confirmation_option(prompt="This will delete ALL local data. Continue?")
@with_appcontext
def reset_db() -> None:
    """Drop every table and recreate an empty database."""
    db.drop_all()
    db.create_all()
    click.echo("Database reset.")


@click.command("seed-demo")
@with_appcontext
def seed_demo() -> None:
    """Load a small demo portfolio so the UI is not empty."""
    from .models import Account, FxRate, Instrument, Price, Transaction

    if Account.query.count():
        click.echo("Accounts already exist. Run `flask reset-db` first if you want demo data.")
        return

    accounts = {
        "tw_broker": Account(name="玉山證券", broker="玉山", account_type="broker", currency="TWD"),
        "us_broker": Account(name="Firstrade", broker="Firstrade", account_type="broker", currency="USD"),
        "tw_cash": Account(name="台幣現金", broker="國泰世華", account_type="bank", currency="TWD"),
        "us_cash": Account(name="美元現金", broker="國泰世華", account_type="bank", currency="USD"),
    }
    db.session.add_all(accounts.values())

    instruments = {
        "2330": Instrument(
            symbol="2330", name="台積電", asset_type="stock", currency="TWD",
            market="TW", exchange="TWSE",
        ),
        "0050": Instrument(
            symbol="0050", name="元大台灣50", asset_type="etf", currency="TWD",
            market="TW", exchange="TWSE",
        ),
        "VOO": Instrument(
            symbol="VOO", name="Vanguard S&P 500 ETF", asset_type="etf", currency="USD",
            market="US", exchange="NYSEARCA",
        ),
        "AAPL": Instrument(
            symbol="AAPL", name="Apple Inc.", asset_type="stock", currency="USD",
            market="US", exchange="NASDAQ",
        ),
        "US10Y": Instrument(
            symbol="US10Y-2033", name="美國公債 4.5% 2033", asset_type="bond",
            currency="USD", market="US", face_value=1000, coupon_rate=4.5,
            coupon_frequency=2, maturity_date=date(2033, 11, 15), credit_rating="AA+",
        ),
    }
    db.session.add_all(instruments.values())
    db.session.flush()

    def txn(account, txn_type, trade_date, *, instrument=None, quantity=0, price=0,
            gross=None, fee=0, tax=0, currency=None, note=None):
        return Transaction(
            account_id=account.id,
            instrument_id=instrument.id if instrument else None,
            type=txn_type,
            trade_date=trade_date,
            quantity=quantity,
            price=price,
            gross_amount=gross if gross is not None else quantity * price,
            fee=fee,
            tax=tax,
            currency=currency or (instrument.currency if instrument else account.currency),
            fx_rate=1,
            note=note,
        )

    db.session.add_all(
        [
            txn(accounts["tw_broker"], "deposit", date(2024, 1, 2), gross=1_000_000, note="初始入金"),
            txn(accounts["tw_broker"], "buy", date(2024, 1, 15), instrument=instruments["2330"], quantity=1000, price=600, fee=100),
            txn(accounts["tw_broker"], "buy", date(2024, 2, 1), instrument=instruments["0050"], quantity=2000, price=130, fee=100),
            txn(accounts["tw_broker"], "dividend", date(2024, 8, 1), instrument=instruments["0050"], gross=3000),
            txn(accounts["tw_cash"], "deposit", date(2024, 1, 5), gross=200_000),
            txn(accounts["us_cash"], "deposit", date(2024, 1, 5), gross=20_000),
            txn(accounts["us_broker"], "deposit", date(2024, 1, 8), gross=80_000, note="電匯入金"),
            txn(accounts["us_broker"], "buy", date(2024, 3, 1), instrument=instruments["VOO"], quantity=100, price=480),
            txn(accounts["us_broker"], "buy", date(2024, 6, 15), instrument=instruments["US10Y"], quantity=10, price=980),
            txn(accounts["us_broker"], "interest", date(2024, 9, 15), instrument=instruments["US10Y"], gross=225),
            txn(accounts["us_broker"], "buy", date(2024, 11, 1), instrument=instruments["AAPL"], quantity=20, price=220, fee=1),
            txn(accounts["us_broker"], "dividend", date(2024, 11, 15), instrument=instruments["AAPL"], gross=5),
        ]
    )

    db.session.add_all(
        [
            Price(instrument_id=instruments["2330"].id, date=date(2026, 6, 30), close=950, currency="TWD"),
            Price(instrument_id=instruments["0050"].id, date=date(2026, 6, 30), close=195, currency="TWD"),
            Price(instrument_id=instruments["VOO"].id, date=date(2026, 6, 30), close=560, currency="USD"),
            Price(instrument_id=instruments["AAPL"].id, date=date(2026, 6, 30), close=240, currency="USD"),
            Price(instrument_id=instruments["US10Y"].id, date=date(2026, 6, 30), close=970, currency="USD"),
            FxRate(
                base_currency="USD", quote_currency="TWD",
                date=date(2026, 6, 30), rate=31.5, source="manual",
            ),
        ]
    )

    db.session.commit()
    click.echo("Demo portfolio loaded.")
