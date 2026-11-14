# AGENTS.md

Local-only, single-user portfolio tracker: Flask API + React SPA as two independent apps (no monorepo tooling). Feature and API docs live in `README.md`; this file only covers things an agent would otherwise get wrong.

## Run & verify

- Backend, from `backend/`:
  `..\.venv\Scripts\python.exe -m flask --app run.py run --port 5001 --no-reload`
- Frontend, from `frontend/`: `npm run dev` → http://localhost:5173 (proxies `/api` to `127.0.0.1:5001`).
- Both at once: `.\dev.ps1`.
- Tests, from `backend/`: `..\.venv\Scripts\python.exe -m pytest -q`
  Single test: `..\.venv\Scripts\python.exe -m pytest tests/test_portfolio.py::test_sell_realizes_pnl -q`
- Frontend verification is `npm run build` (`tsc && vite build`). There is no linter and no frontend test runner.
- Use `--no-reload` for background Flask runs; the reloader starts a child process that otherwise keeps port 5001 busy.

## Critical gotchas

- **No migrations.** `create_app()` runs `db.create_all()` on every start, which never alters existing tables. Adding or renaming a column will not change the existing `backend/data/app.db`; use `flask reset-db` (destroys data) or a manual `ALTER TABLE`, and tell the user which one you did.
- **Positions are never stored.** `app/services/portfolio.py` recomputes quantity, moving-average cost, realized/unrealized P&L and per-account cash from the `transactions` ledger. Change that service, not a holdings table.
- `register_blueprints()` builds each URL as `/api` + the blueprint's own `url_prefix`. Passing `url_prefix` to `app.register_blueprint` *replaces* the blueprint prefix, so keep the pattern in `app/api/__init__.py`.
- Money is `Numeric`/`Decimal` in SQLAlchemy but `float` in Pydantic schemas and JSON at the API boundary.
- Missing price → valued at average cost; missing FX → rate 1. Both are reported in `summary.warnings`; keep that behavior.
- `app/models.py` owns the asset / account / transaction code→Chinese-label maps served by `/api/meta`.

## Frontend conventions

- All HTTP calls go through `src/lib/api.ts`; React Query hooks live in `src/lib/hooks.ts`.
- After a mutation, invalidate the affected query keys: `["summary"]` for anything touching money, plus the entity list (`["transactions"]`, `["accounts"]`, `["instruments"]`, `["prices"]`, `["fx-rates"]`).
- `tsconfig` is strict: `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly` (no enums/namespaces). `npm run build` fails on unused imports.
- Tailwind v4: no `tailwind.config`; theme is in `src/index.css` (`@import "tailwindcss"` + `@theme`).
- Shared primitives (Card, Button, Input, Select, Modal, Badge) live in `src/components/ui.tsx`; reuse them instead of adding a UI library.

## Data & demo

- DB: `backend/data/app.db` (SQLite, gitignored). Back up by copying this file.
- `flask seed-demo` loads demo accounts/instruments/transactions/prices/FX, but refuses if any account already exists.
- `flask reset-db` drops and recreates all tables.
- CORS is open and there is no auth; this is intentionally local-only. Do not expose the API publicly without adding auth.

## Environment

- Windows + PowerShell. The virtualenv is at the repo root (`.venv`); the commands above assume cwd is `backend/` or `frontend/`.
- This directory is not a git repository yet.
