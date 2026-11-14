import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
load_dotenv(BASE_DIR / ".env")

DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-secret")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL", f"sqlite:///{(DATA_DIR / 'app.db').as_posix()}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False
    JSON_AS_ASCII = False
    BASE_CURRENCY = os.getenv("BASE_CURRENCY", "TWD").upper()
