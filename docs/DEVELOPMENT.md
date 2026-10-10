# Development

Frontend and backend run as two processes in development: Vite on `:8080` and FastAPI on `:8000`. The frontend calls `http://localhost:8000` when `import.meta.env.DEV` is true, and CORS is open by default so the admin requests (which send a custom header and trigger a preflight) work across the two ports.

## Prerequisites

- Node.js 24 (the version the Docker build uses)
- Python 3.12

## Setup

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
ADMIN_PASSWORD=whatever uvicorn app.main:app --port 8000 --reload
```

```bash
# Frontend, in another shell
npm install
npm run dev     # http://localhost:8080
```

With no `dist/` build next to it, the backend serves only the API.

To work on the UI without a backend, set `MOCK_MODE = true` in `src/config.js`. It reads `MOCK_HISTORIAL`, `MOCK_MOVIMIENTOS` and `MOCK_PARTICIPANTES_LOG` instead of calling `/api/all`. Writes still go to the backend. Set it back to `false` before committing.

## Tests

```bash
npm test                         # vitest
npm run typecheck                # tsc --noEmit
npm run e2e                      # playwright (first time: npx playwright install chromium)
cd backend && python -m pytest   # pytest
```

- **vitest** covers DOM-free logic: share math (`src/domain/`), derived participant figures (`src/computed.js`), money inputs, formatting, dates, movement filters and chart transforms.
- **pytest** covers the API end to end with `TestClient`: auth and rate limit, validation, the withdrawal balance check, movement plus valuation in one transaction, import/export and the backend share math (`app/domain.py`).
- **playwright** (`e2e/`) is one smoke test against the real stack: it builds `dist/`, starts the backend on a temp database, adds a participant, records a contribution in Admin and checks it in Resumen and Movimientos. It uses `backend/.venv` when present, otherwise `python` on the PATH.

CI runs both suites on every push to `main` and on every pull request, and publishes the image only from `main` when they pass.

## Build

```bash
npm run build     # dist/, what the Dockerfile copies into the image
npm run preview   # serves dist/ to check it before deploying
docker build -t fondi .
```

## Conventions

- Keep financial calculations out of JSX, in `src/computed.js` or `src/domain/`, so they can be unit tested. If you touch the share math, change and test both `src/domain/cuotas.js` and `backend/app/domain.py`.
- Build dates with `todayLocal()` (`src/utils/dates.js`), never `toISOString()`: it returns UTC, which in Colombia is already tomorrow after 19:00.
- Format money through `src/utils/format.js` (`US$ 12.450`, `$ 48.230.000`); don't append currency suffixes.
- Colors are CSS tokens in `src/style.css` for both themes. Charts read them with `cssVar()` and rebuild on theme change.
- New external assets are blocked by the Content-Security-Policy in `backend/app/main.py` until they are added there.
- Admin form fields are controlled React state; iOS Safari clears uncontrolled date inputs on re-render.
- No emojis in the UI.
- Docs are in English. UI copy, code comments and domain names (`cuota`, `aporte`, `retiro`, `calcularCuotas`) are in Spanish; the glossary in [ARCHITECTURE.md](ARCHITECTURE.md#glossary) maps them.
