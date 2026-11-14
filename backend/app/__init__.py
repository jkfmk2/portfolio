from __future__ import annotations

from flask import Flask, jsonify
from flask_cors import CORS

from .cli import register_cli
from .config import Config
from .extensions import db


def create_app(config_object: type = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)
    app.json.ensure_ascii = False
    app.json.sort_keys = False

    db.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    from .api import register_blueprints

    register_blueprints(app)
    register_cli(app)

    with app.app_context():
        from .models import Setting

        db.create_all()
        if db.session.get(Setting, "base_currency") is None:
            db.session.add(Setting(key="base_currency", value=app.config["BASE_CURRENCY"]))
            db.session.commit()

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    return app
