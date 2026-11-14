from __future__ import annotations

from flask import jsonify, request
from pydantic import BaseModel, ValidationError


def error(message: str, status: int = 400, details=None):
    payload = {"error": message}
    if details is not None:
        payload["details"] = details
    return jsonify(payload), status


def get_json() -> dict:
    return request.get_json(silent=True) or {}


def parse(model: type[BaseModel], data):
    try:
        return model.model_validate(data or {}), None
    except ValidationError as exc:
        return None, error(
            "validation_error",
            400,
            exc.errors(include_url=False, include_context=False),
        )


def apply_fields(obj, payload: dict) -> None:
    for key, value in payload.items():
        setattr(obj, key, value)
