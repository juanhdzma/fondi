# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Fondi" — dashboard for managing a mutual-fund-style investment pool: several participants contribute/withdraw USD at different times, and each one owns a fraction of the fund measured in "shares" (like a collective investment fund). Shows fund value, share price, individual ownership, and returns in USD and COP.

Vanilla JS + Chart.js, no framework — the DOM is manipulated directly (`innerHTML`, `render*()` functions), there's no reactive state. Bundled with Vite; `index.html` is markup only, the logic lives in `src/` as ES modules.

## Commands

```bash
npm install
npm run dev       # http://localhost:8080 — needs the backend running separately (see below)
npm run build     # generates dist/ (what the root Dockerfile copies into the image)
npm run preview   # serves dist/ to verify before deploying

# Backend, for local frontend dev
cd backend && pip install -r requirements-dev.txt
ADMIN_PASSWORD=whatever uvicorn app.main:app --port 8000 --reload
cd backend && python -m pytest

# Docker (multi-stage build: node build → python/FastAPI runtime, one image)
docker build -t fondi .
docker run -p 8080:8000 -e ADMIN_PASSWORD=whatever -v fondi-db:/data fondi
```

There's no linter configured for the frontend. The backend has `pytest` (see `backend/tests/`). The only "CI" is `.github/workflows/docker.yml`, which on every push to `main` that touches `index.html`, `src/**`, `package.json`, `Dockerfile`, or `backend/**` builds and publishes the single image to `ghcr.io/<user>/fondi:latest`.

To test changes without hitting the real backend, set `MOCK_MODE = true` in `src/config.js` — it uses `MOCK_HISTORIAL`/`MOCK_MOVIMIENTOS`/`MOCK_PARTICIPANTES_LOG` instead of calling `/api/all`.

## `src/` structure

```
main.js          Entry point — wires up event listeners (no inline onclick in the HTML) and calls fetchAll()
config.js        Deployment constants: API_BASE_URL, MOCK_MODE/MOCK_*
state.js         S (in-memory state: trm, historial, movimientos, participantesLog, range) + charts (Chart.js instances)
computed.js      latest(), precioCuota(), cuotasCirc(), calcParticipante(), participantesActivos(), participantesTodos() — everything derives from S
admin.js         Full admin panel: unlock, tipo toggle, previewFondo, submitMov, submitFondo, add/remove participant
api/backend.js   fetchAll/postMovimiento/postFondo/postParticipante/fetchTRM — all I/O against the FastAPI backend
utils/           dates.js, format.js, money-input.js
render/          resumen.js, movimientos.js, charts.js — one module per UI section; index.js exposes renderAll()
ui/              tabs.js (setTab/setRange), banner.js (error banner), toast.js (confirmation popup), refresh.js
```

`state.js` (`S` and `charts`) is the single source of truth in memory — if the browser hasn't done a recent `fetchAll()`, everything derived from `computed.js` is stale.

## `backend/` structure

FastAPI + SQLite (stdlib `sqlite3`, no ORM — the schema is three flat tables). Same process also serves the built frontend (see Architecture below) — there's no nginx anymore.

```
app/main.py   FastAPI app: auth dependency, all routes, mounts dist/ as static files
app/db.py     Schema (historial_fondo, movimientos, participantes_config) + sqlite3 connection helper + replace_all()
app/xlsx.py   build_workbook()/parse_workbook() — the xlsx export/import format
tests/        pytest + FastAPI TestClient
```

- `GET /api/all` — returns `{historial, movimientos, participantes_config}` as JSON (already typed/named fields, no CSV parsing needed on the frontend side).
- `POST /api/movimiento` / `/api/fondo` / `/api/participante` — each requires header `X-Admin-Key` matching the `ADMIN_PASSWORD` env var (checked server-side with `secrets.compare_digest`), inserts one row.
- `POST /api/auth/verify` — same auth dependency, no-op besides returning `200`/`401`. Used by the Admin panel's "unlock" screen to validate the key before showing the form (see `unlockAdmin()` in `src/admin.js`).
- `GET /api/export` — no auth (read is public, same as `/api/all`), streams an `.xlsx` with one sheet per table (`historial_fondo`, `movimientos`, `participantes_config`), header row + raw column names matching `app/db.py`'s schema.
- `POST /api/import` — requires `X-Admin-Key`, multipart `file` upload. **Destructive: `replace_all()` deletes the 3 tables and reloads them from the workbook** (missing sheets import as empty, not left alone) — this is by design (predictable restore/migration, no merge/dedup logic), confirmed with a `confirm()` prompt client-side (`importXlsx()` in `src/admin.js`) before the request fires. Dates in cells are normalized back to the app's ISO string convention regardless of whether Excel stored them as text or as a real date/datetime value (`_to_fecha_str()` in `app/xlsx.py`).
- `DB_PATH` (default `/data/fondi.db`) and `ADMIN_PASSWORD` (**default `"admin"`, both in `app/main.py` and in `docker-compose.yml`'s `${ADMIN_PASSWORD:-admin}`**) are the two env vars the backend needs in production. The default is intentional — this is a private family app with no real security boundary to begin with (see "Admin panel auth" below); the priority is that it never becomes unusable because someone forgot to set the var. Set your own in `.env`/Portainer before exposing this beyond your LAN.
- `STATIC_DIR` (default `../static` relative to `app/`) is where the built frontend lives inside the image — see the root `Dockerfile`. **The mount is conditional (`if os.path.isdir(STATIC_DIR)`)**: when the directory doesn't exist (running the backend standalone for local frontend dev, or under pytest) the app simply serves no static routes instead of crashing — Starlette's `StaticFiles` re-checks the directory on every request and 500s if it's missing, so this used to break the very setup described below before `check_dir=False` was replaced with this check.
- `ALLOWED_ORIGINS` (comma-separated, default `*`) configures CORS. **This one still matters even though prod is same-origin**: `npm run dev` runs the frontend on `:8080` and the backend separately on `:8000` — different origins — so the browser sends CORS preflight (`OPTIONS`) for every admin `POST` (custom `X-Admin-Key` header forces it). Without CORS enabled, every write from the Admin panel fails in dev (this was a real regression caught by an actual browser test — `curl`-only testing didn't catch it, since `curl` doesn't send preflights).

`src/config.js`'s `API_BASE_URL` is `''` in production builds (`import.meta.env.DEV` is false) — same origin as the page. In `npm run dev` it points at `http://localhost:8000` (run the backend separately with `uvicorn app.main:app --port 8000 --reload` for local frontend dev — see the `ALLOWED_ORIGINS` note above, it's why this still works cross-origin).

## Architecture

**One image, one container.** The root `Dockerfile` is multi-stage: `node` builds `dist/`, then a `python` stage installs FastAPI and copies `dist/` in as static files (`COPY --from=build /app/dist ./static`) alongside the backend code. At runtime there's a single `uvicorn` process serving both the SPA and the `/api/*` routes on the same port — no nginx, no second container. CORS is still enabled (see `ALLOWED_ORIGINS` above) because the same backend is also run standalone for local frontend dev, where origins do differ. The browser talks to one backend over HTTP/JSON either way — no more Google Sheets/Apps Script in the loop.

- **Read**: `fetchAll()` (`src/api/backend.js`) does a single `GET /api/all`.
- **Write**: `postMovimiento()`/`postFondo()`/`postParticipante()` (`src/api/backend.js`) do real `POST` requests with `X-Admin-Key` and read the actual JSON response/status — unlike the old `postScript()`, there's no more `mode: 'no-cors'` blind-write; a `401`/`400` surfaces as a real error in the form.
- The backend (`backend/app/main.py`) only does `INSERT` — **it's still an append-only log, there's no UPDATE/DELETE.** That part of the model didn't change, only where it's stored and that writes are now actually authenticated server-side.
- Static file routes are mounted last in `main.py`, after every `/api/*` route — Starlette matches in registration order, so the catch-all static mount never shadows an API route. If you add a new top-level route, define it before the `app.mount("/", StaticFiles(...))` line at the bottom of the file.

### Data model (SQLite tables, `backend/app/db.py`)

| Table | Columns | Who fills it |
|---|---|---|
| `historial_fondo` | `fecha, valor_total, precio_cuota, cuotas_circ, trm` | Snapshots — a total fund value confirmed by the admin at each point in time. Can have several rows on the same day (intraday valuations); the frontend dedupes them (see below) |
| `movimientos` | `fecha, persona, tipo, monto, precio_cuota_dia, cuotas, monto_cop, trm_dia` | One individual contribution/withdrawal per row |
| `participantes_config` | `fecha, nombre, accion` | Append-only log of `agregar`/`quitar` (add/remove) — Admin panel → "Manage participants". `participantesActivos()` (`src/computed.js`) takes the latest action per name |

### Dynamic participants

`PARTICIPANTS` no longer exists as a static constant in `config.js`. The list comes from `participantesLog` (`src/state.js`), populated from the `participantes_config` tab:

- `participantesActivos()` — the latest `agregar`/`quitar` action per name wins. Used for the "Register movement" `<select>` (you can only contribute/withdraw for someone active).
- `participantesTodos()` — active ∪ any `persona` that appears in `movimientos`, even if removed afterward. Used in `resumen.js`/`charts.js` so someone with real shares never disappears from their card or the donut chart just for leaving the active list.

Removing a participant never deletes their history or shares — it just takes them out of the selection list for new movements.

### The "shares" model — the non-obvious part

The fund works like a mutual fund: each contribution/withdrawal is converted to "shares" at the share price in effect at that moment, and `share_price = total_fund_value / shares_outstanding`. This means **the share price used to convert a contribution into shares must reflect the REAL fund value right before that contribution** — if a stale share price is used (from an old checkpoint, without capturing later gains/losses), the new contributor buys shares "cheap" and gets a free ride on gains that belonged to earlier contributors (dilution).

`submitMov()` (`src/admin.js`) resolves this by deriving the "just before" share price from the `fund value after` (which the admin types in by hand and is assumed correct) and the movement amount — it does **not** read the share price from the last saved checkpoint (that was a real bug, fixed; see commit history). The formula:

```js
valorAntes = tipo === 'retiro' ? valorFondo + monto_usd : valorFondo - monto_usd;
pc         = cuotasActuales > 0 ? valorAntes / cuotasActuales : 1;
```

If you touch this function, don't go back to using `precioCuota()` (the cached checkpoint) to compute the shares of a new movement — that's exactly the regression that was already fixed.

`submitFondo()` (`src/admin.js`) is different: it records a "valuation" (a value change with no contribution/withdrawal, e.g. weekly close) — there it's correct to use `cuotasCirc()` because shares outstanding don't change, only the price.

### The chart x-axis — proportional to time, not by index

`src/render/charts.js` plots with `type: 'linear'` on the x-axis using real timestamps (`{x: ms, y: valor}` per point), not a `category` axis with an array of labels — so a 6-day gap takes up 6x the width of a 1-day gap. If you go back to an index/label-based axis, that proportionality is lost (this was exactly the reported and fixed bug).

- **Calendar-aligned ticks**: `computeCalendarTicks()` decides the granularity based on the visible span (month if >150 days, week if >20, every 4 days if >8, otherwise every day) and returns exact timestamps (start of month/week), not data indices — they're injected by overwriting the ticks array via `afterBuildTicks`, regardless of whether real data exists exactly there.
- **Chart.js gotcha**: the `linear` axis defaults to `bounds: 'ticks'`, which expands `min`/`max` to its own auto-generated "round" ticks — `afterBuildTicks` overwrites them but doesn't fix that already-inflated `min`, leaving a phantom gap before the first real point. That's why `xAxis()` sets explicit `min`/`max` to the first/last real timestamp (plus `bounds: 'data'` as reinforcement). If that explicit `min`/`max` is removed, the gap comes back.
- **Backward-fill point clamp**: `filteredHistorialWithFill()` may prepend the last valuation *before* the selected range (so the line doesn't start at zero); its real date can be much earlier than the visible range, so in `renderCharts()` its `x` is clamped to the range edge (not its real date) — otherwise most of the chart width would be wasted on a flat segment outside the range.
- **Straight lines, no curves**: `tension: 0` in `makeDataset()` — with tension>0 and proportional spacing (very uneven gaps between points), Chart.js's bezier smoothing produced visible distortions near the edges. Point radius (`pointRadiusFor()`) decreases with point count so they don't pile up over long ranges.

### The Admin form is "state-backed" — it doesn't trust the browser to retain values

On iOS Safari, the Admin panel's `<input type="date">`/`<input type="time">` sometimes clear themselves: when switching tabs (`.tab-content` uses `display:none`/`block`, and the input loses its value when re-shown) or during the big reflow triggered by `renderAll()` after saving. It's a WebKit bug, not reproducible on Chromium — don't fix it by changing the tabs mechanism without testing on a real iPhone first.

The workaround lives in `src/admin.js`: `FORM_FIELDS` lists the IDs of all form fields; `saveFormSnapshot()` copies them to an in-memory object on every `input`/`change` (delegated on `#admin-panel`, see `bindAdminEvents()`); `restoreFormSnapshot()` (exported) reapplies them. It's called after `fetchAll()` in `submitMov()`/`submitFondo()`/`agregarParticipante()`/`quitarParticipante()`, and in `setTab()` (`src/ui/tabs.js`) when entering the `admin` tab. **If you add a new field to the Admin form, add it to `FORM_FIELDS`** or it will be left out of this mechanism.

### Other quirks

- **Zero emojis in the UI**: not in toasts, status messages, banners, or decorative icons (`src/ui/toast.js`, `src/admin.js`, `src/ui/banner.js`). Explicit request — the CSS color/class (`.ok`/`.err`) already communicates the state.
- **Admin panel auth is real, server-side**: `unlockAdmin()` (`src/admin.js`) POSTs the typed key to `/api/auth/verify`; the backend compares it against `ADMIN_PASSWORD` with `secrets.compare_digest` (`backend/app/main.py`). The key is never embedded in the frontend bundle — every write request resends it via `X-Admin-Key` and the backend re-validates it independently (there's no session/token, each request is checked on its own).
- **TRM (exchange rate)** is fetched live from Superfinanciera via `datos.gov.co` (`fetchTRM()`, `src/api/backend.js`), with a fallback to 4000 if the fetch fails.
- **`S.historial` is a per-day record, not a raw per-movement row**: `fetchAll()` (`src/api/backend.js`) dedupes `historial_fondo` keeping the most recent valuation per day (`fecha.slice(0, 10)` as the key). If the admin records several valuations on the same day, only the last one survives — this keeps the chart (`filteredHistorialWithFill()`, `src/render/charts.js`) from zigzagging intraday or repeating the same day on the x-axis. If you need the raw intraday detail, query `historial_fondo` directly against the SQLite DB, not through `/api/all`/`S.historial`.
- **No inline handlers**: the HTML has no `onclick`/`oninput`; all listeners are registered in `main.js`/`admin.js` via `addEventListener`, backed by `data-*` attributes (`data-tab`, `data-r`, `data-tipo`).
