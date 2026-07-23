# Fondi

Web dashboard for managing a mutual-fund-style investment pool: several participants contribute/withdraw USD at different times, each owning a fraction of the fund measured in "shares." Shows fund value, share price, individual ownership, and returns in USD and COP.

![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue) ![Backend](https://img.shields.io/badge/backend-FastAPI%20%2B%20SQLite-009688) ![Frontend](https://img.shields.io/badge/frontend-vanilla%20JS-f7df1e) [![Build & push to GHCR](https://github.com/juanhdzma/fondi/actions/workflows/docker.yml/badge.svg)](https://github.com/juanhdzma/fondi/actions/workflows/docker.yml)

![Resumen](docs/screenshots/desktop-resumen.png)

> ## ⚠️ PRIVATE USE ONLY — NO REAL AUTH BOUNDARY
> The Admin panel's password (`ADMIN_PASSWORD`) is checked server-side, so it isn't trivially bypassable from the browser — but there's no rate limiting, no session/token, and the read endpoints (`/api/all`, `/api/export`) require **no auth at all**: anyone who can reach the URL can read every contribution, the fund value, and each person's shares.
>
> **Do not expose this to the public internet** (no open port-forward, no public reverse proxy) without putting your own auth layer in front of it (e.g. a reverse proxy with basic auth, a VPN/Tailscale, etc.), and **always set your own `ADMIN_PASSWORD`** — it defaults to `admin` if unset.

## Contents

- [Features](#features)
- [How it fits together](#how-it-fits-together)
- [Running locally](#running-locally)
- [Running via Docker](#running-via-docker)
- [Deploying](#deploying)
- [Testing](#testing)
- [License](#license)

## Features

Modeled like a real mutual fund: every contribution/withdrawal buys "shares" at the price in effect that moment, so each participant's stake is just their share count — the fund can grow or shrink and everyone's value moves proportionally, no manual gain-splitting. Everything is an append-only log; nothing is ever edited or deleted.

### Resumen

Fund value and share price at a glance, each with its own % change over a range you pick (1 week to all-time) — plus a "Ganancia acumulada" view that plots the fund's accumulated gain over time as a single line, green while it's ahead of what's been contributed and red while behind, switching color exactly where it crosses zero. Below that, every participant's current value and % gain in one row each.

![Resumen](docs/screenshots/desktop-resumen.png)

### Movimientos

The full history of contributions and withdrawals, filterable by participant. Pick someone from the dropdown for their personal breakdown — current value, gain in USD and COP, total contributed — plus a chart of their investment's value against what they've put in, with its own independent date range.

![Movimientos](docs/screenshots/desktop-movimientos.png)

### Admin

Register a contribution/withdrawal or a plain valuation, with live hints as you type — the resulting COP/USD rate, the new share price — so you can sanity-check a number before saving. Also where you add/remove participants and export/import the whole dataset as `.xlsx`. Gated behind a password checked server-side.

![Admin](docs/screenshots/desktop-admin.png)

Screenshots above use placeholder data for illustration, not a real fund's figures.

### Mobile

Below 720px the top nav becomes a bottom tab bar. Inputs are sized to avoid iOS's zoom-on-focus, and pinch-zoom is disabled.

<table>
<tr>
<td><img src="docs/screenshots/mobile-resumen.png" width="260" alt="Resumen, mobile"></td>
<td><img src="docs/screenshots/mobile-movimientos.png" width="260" alt="Movimientos, mobile"></td>
<td><img src="docs/screenshots/mobile-admin.png" width="260" alt="Admin, mobile"></td>
</tr>
</table>

## How it fits together

One image, one container: a multi-stage `Dockerfile` builds the Vite frontend, then a Python stage installs FastAPI and serves the built static files alongside the `/api/*` routes from a single `uvicorn` process — no nginx, no second container. Data lives in a SQLite file with three append-only tables (`historial_fondo`, `movimientos`, `participantes_config`) — nothing is ever edited or deleted, only new rows added.

The frontend (`src/`) is plain JS, no framework: one module per UI section under `render/`, all reading from a single in-memory state object (`S` in `state.js`) populated from `GET /api/all`. Any admin write — a movement, a valuation, adding a participant — goes through the API and then refetches and re-renders everything; there's no optimistic UI or partial state patching by design, trading snappiness for simplicity at the data volumes this app deals with.

See `CLAUDE.md` for the full data model, endpoint list, and the non-obvious parts of the share-price math.

## Running locally

Needs Node.js 20+ and Python 3.12+. The frontend and backend run as two separate processes in dev.

```bash
# Backend
cd backend
pip install -r requirements-dev.txt
ADMIN_PASSWORD=whatever uvicorn app.main:app --port 8000 --reload
```

```bash
# Frontend, in another shell
npm install
npm run dev
# Open http://localhost:8080
```

The frontend talks to `http://localhost:8000` in dev (see `API_BASE_URL` in `src/config.js`) — CORS is enabled on the backend for this cross-origin setup. To test the UI without a running backend, set `MOCK_MODE = true` in `src/config.js`.

`npm run build` generates `dist/` (what the Dockerfile copies into the image); `npm run preview` serves it locally to check before deploying.

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

## Running via Docker

```bash
docker compose up -d --build
# Open http://localhost:8080
```

Uses `docker-compose.yml` at the repo root (local build, no dependency on GHCR). Set `ADMIN_PASSWORD` in a `.env` file or export it before running — it defaults to `admin` otherwise.

Or build/run manually:

```bash
docker build -t fondi .
docker run -p 8080:8000 -e ADMIN_PASSWORD=whatever -v fondi-db:/data fondi
```

**Reachable from any device on your network**: the container listens on all interfaces, so you're not limited to `localhost` — find your machine's LAN IP (`ipconfig getifaddr en0` on Mac, `hostname -I` on Linux, `ipconfig` on Windows) and open `http://<that-ip>:8080` from your phone, tablet, or any other device on the same Wi-Fi.

## Deploying

Image to pull:

```
ghcr.io/<user>/fondi:latest
```

```bash
# On the server where Docker runs, authenticate first (PAT needs the read:packages scope,
# created at GitHub → Settings → Developer settings → Personal access tokens):
echo <GITHUB_PAT> | docker login ghcr.io -u <user> --password-stdin
```

`docker-compose.yml` for a reverse-proxied deploy (e.g. via Portainer):

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

The `proxy` network must already exist (Traefik or another reverse proxy) and must be told to route to container port **8000**. Without the `fondi-db` volume, the SQLite database is wiped every time the container is recreated.

**After a new image is published, a plain restart/recreate is not enough** — Docker won't re-fetch an already-pulled `:latest` tag on its own. Pull explicitly (`docker compose pull`, or Portainer's "re-pull image" option) before recreating.

## Testing

Backend has `pytest` (`cd backend && python -m pytest`). Frontend has no automated tests, linter, or type checker configured — verify changes by running the app and exercising the UI manually.

## License

[AGPL-3.0](LICENSE)
