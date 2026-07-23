# Fondi

[![Build & push to GHCR](https://github.com/juanhdzma/fondi/actions/workflows/docker.yml/badge.svg)](https://github.com/juanhdzma/fondi/actions/workflows/docker.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPLv3-blue.svg)](LICENSE)

Web dashboard for managing a mutual-fund-style investment pool. Shows fund value, share price, individual ownership, and returns in USD and COP.

Modeled like a real mutual fund: every contribution/withdrawal buys "shares" at the price in effect that moment, so each participant's stake is just their share count — the fund can grow or shrink and everyone's value moves proportionally, no manual gain-splitting. Everything is an append-only log; nothing is ever edited or deleted.

## Features

- **Fund overview** — total value and share price, each with its own % change over a range you pick (1 week to all-time), plus an accumulated-gain view colored green/red by sign.
- **Per-participant tracking** — current value, gain in USD/COP, total contributed, and an investment-evolution chart with its own independent date range.
- **Movements log**, filterable by participant.
- **Admin panel** — register movements/valuations with live preview hints (TRM, resulting share price); manage participants; export/import the whole dataset as `.xlsx`.
- **Live TRM**, fetched automatically from Colombia's Superfinanciera.
- **Mobile-friendly** — bottom tab bar, no pinch-zoom or iOS zoom-on-tap surprises.
- **Self-hosted**, one Docker image, no external dependency besides the TRM fetch.

---

## Screenshots

### Desktop

**Resumen**
![Resumen — desktop](docs/screenshots/desktop-resumen.png)

**Movimientos**
![Movimientos — desktop](docs/screenshots/desktop-movimientos.png)

**Admin**
![Admin — desktop](docs/screenshots/desktop-admin.png)

### Mobile

<p>
  <img src="docs/screenshots/mobile-resumen.png" alt="Resumen — mobile" width="260" />
  <img src="docs/screenshots/mobile-movimientos.png" alt="Movimientos — mobile" width="260" />
  <img src="docs/screenshots/mobile-admin.png" alt="Admin — mobile" width="260" />
</p>

---

> ## ⚠️ PRIVATE USE ONLY — NO REAL AUTH BOUNDARY
> The Admin panel's password (`ADMIN_PASSWORD`) is checked server-side (`secrets.compare_digest`), so it isn't trivially bypassable from the browser — but there's no rate limiting, no session/token, and the read endpoints (`/api/all`, `/api/export`) require **no auth at all**: anyone who can reach the URL can read every contribution, the fund value, and each person's shares.
>
> **Do not expose this to the public internet** (no open port-forward, no public reverse proxy) without putting your own auth layer in front of it (e.g. a reverse proxy with basic auth, a VPN/Tailscale, etc.), and **always set your own `ADMIN_PASSWORD`** — it defaults to `admin` if unset.

---

## Prerequisites

- Node.js 20+ (only for local frontend development — the production container doesn't need it)
- Python 3.12+ (only for local backend development)
- GitHub account with access to GitHub Container Registry
- Server with Docker + Portainer (or any Docker host)

---

## Architecture

One image, one container: a multi-stage `Dockerfile` builds the Vite frontend, then a Python stage installs FastAPI and serves the built static files alongside the `/api/*` routes from a single `uvicorn` process — no nginx, no second container. Data lives in a SQLite file (`/data/fondi.db` inside the container, meant to be a mounted volume) with three append-only tables: `historial_fondo`, `movimientos`, `participantes_config`.

See `CLAUDE.md` for the full data model, endpoint list, and the non-obvious parts of the share-price math.

---

## 1. Run locally

The frontend and backend run as two separate processes in development.

### Backend

```bash
cd backend
pip install -r requirements-dev.txt
ADMIN_PASSWORD=whatever uvicorn app.main:app --port 8000 --reload
```

### Frontend

```bash
npm install
npm run dev
# Open http://localhost:8080
```

In dev, the frontend talks to `http://localhost:8000` (see `API_BASE_URL` in `src/config.js`) — the backend has CORS enabled for this cross-origin setup. To test the UI without a running backend, set `MOCK_MODE = true` in `src/config.js`.

`npm run build` generates `dist/` (what the Dockerfile copies into the image); `npm run preview` serves it locally to check before deploying.

### Backend tests

```bash
cd backend
python -m pytest
```

### Structure

```
index.html          Markup only, no inline logic or styles
src/
  main.js            Entry point — wires up event listeners and boots the app
  config.js           API_BASE_URL, MOCK_MODE / mock fixtures
  state.js             In-memory state (S) and Chart.js instances
  computed.js            Derived state (share price, shares per participant, ...)
  admin.js                 Admin panel: auth, forms, movement/valuation submission
  style.css
  api/backend.js       fetchAll/postMovimiento/postFondo/postParticipante/exportUrl/postImportXlsx — all I/O
  utils/                Formatters, dates, money inputs
  render/               One module per UI section (summary, movements, charts)
  ui/                   Tabs, chart date range, error banner, refresh
backend/
  app/main.py          FastAPI app: auth dependency, routes, static file mount
  app/db.py            Schema + sqlite3 connection helper
  app/xlsx.py          xlsx export/import format
  tests/               pytest + FastAPI TestClient
```

No framework on the frontend — direct DOM manipulation, split by domain and bundled with Vite.

---

## 2. Docker

### Manual build

```bash
docker build -t fondi .
docker run -p 8080:8000 -e ADMIN_PASSWORD=whatever -v fondi-db:/data fondi
```

### Docker Compose (local)

```bash
docker compose up -d --build
# Open http://localhost:8080
```

Uses `docker-compose.yml` at the repo root (local build, no dependency on GHCR). Set `ADMIN_PASSWORD` in a `.env` file or export it before running — it defaults to `admin` otherwise. To rebuild after a change: `docker compose up -d --build` again; to tear it down, `docker compose down`.

### GitHub Container Registry (GHCR)

The repo includes a workflow at `.github/workflows/docker.yml` that builds and publishes the image automatically on every push to `main` that touches `index.html`, `src/**`, `package.json`, `Dockerfile`, or `backend/**`. In a couple of minutes the image lands at:

```
ghcr.io/<user>/fondi:latest
```

#### Authentication to pull from the server

```bash
# On the server where Docker runs:
echo <GITHUB_PAT> | docker login ghcr.io -u <user> --password-stdin
```

The PAT needs the `read:packages` scope. Create it at:
GitHub → Settings → Developer settings → Personal access tokens

---

## 3. Deploy with Docker Compose (Portainer)

```yaml
services:
  fondi:
    image: ghcr.io/<user>/fondi:latest
    container_name: fondi
    restart: unless-stopped
    environment:
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    volumes:
      - fondi-db:/data
    networks:
      - proxy

networks:
  proxy:
    external: true

volumes:
  fondi-db:
```

> The `proxy` network must already exist (Traefik or another reverse proxy) and must be told to route to container port **8000** — this app has no built-in port publishing in this example, the proxy talks to it over the shared network. Without the `fondi-db` volume, the SQLite database is wiped every time the container is recreated.

**After a new image is published, a plain restart/recreate is not enough** — Docker won't re-fetch an already-pulled `:latest` tag on its own. Pull explicitly (`docker compose pull`, or Portainer's "re-pull image" option) before recreating.
