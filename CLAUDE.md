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
npm test          # vitest — unit tests of the share math (src/domain/)

# Backend, for local frontend dev
cd backend && pip install -r requirements-dev.txt
ADMIN_PASSWORD=whatever uvicorn app.main:app --port 8000 --reload
cd backend && python -m pytest

# Docker (multi-stage build: node build → python/FastAPI runtime, one image)
docker build -t fondi .
docker run -p 8080:8000 -e ADMIN_PASSWORD=whatever -v fondi-db:/data fondi
```

There's no linter configured. Tests: `pytest` for the backend (`backend/tests/`) and `vitest` for the DOM-free frontend logic — `src/domain/cuotas.test.js` (share math), `src/computed.test.js` (everything derived per participant) and `src/utils/money-input.test.js`. The rest of the frontend (`render/`, `admin.js`, `ui/`) is DOM-coupled and untested, so **anything worth testing should be extracted into `src/domain/`, `src/computed.js` or `src/utils/` first** rather than tested in place. The only CI is `.github/workflows/docker.yml`, which on every push to `main` that touches `index.html`, `src/**`, `public/**`, `package.json`, `Dockerfile`, `backend/**`, or the workflow file itself runs both test suites and, **only if they pass** (`needs: test`), builds and publishes the single image to `ghcr.io/<user>/fondi:latest` (also runnable manually via `workflow_dispatch`).

To test changes without hitting the real backend, set `MOCK_MODE = true` in `src/config.js` — it uses `MOCK_HISTORIAL`/`MOCK_MOVIMIENTOS`/`MOCK_PARTICIPANTES_LOG` instead of calling `/api/all`.

## `src/` structure

```
main.js          Entry point — wires up event listeners (no inline onclick in the HTML) and calls fetchAll()
config.js        Deployment constants: API_BASE_URL, MOCK_MODE/MOCK_*
state.js         S (in-memory state: trm, historial, movimientos, participantesLog, range, personaRange, heroMetric) + charts (Chart.js instances)
computed.js      latest(), precioCuota(), cuotasCirc(), calcParticipante(), participantesActivos(), participantesTodos(), historialParticipante(), historialGananciaFondo() — everything derives from S
admin.js         Full admin panel: unlock, tipo toggle, previewFondo/previewMov/previewTrm (live hints), submitMov, submitFondo, add/remove participant, xlsx import/export
api/backend.js   fetchAll/postMovimiento/postFondo/postParticipante/exportUrl/postImportXlsx/fetchTRM — all I/O against the FastAPI backend
domain/cuotas.js calcularCuotas() + excedeSaldo() — the share math, pure and DOM-free so it can be unit tested (cuotas.test.js)
utils/           dates.js (incl. todayLocal()), format.js, money-input.js, html.js (esc())
render/          resumen.js, movimientos.js, charts.js — one module per UI section; index.js exposes renderAll()
ui/              tabs.js (setTab/setRange), banner.js (error banner), toast.js (confirmation popup), refresh.js
```

`state.js` (`S` and `charts`) is the single source of truth in memory — if the browser hasn't done a recent `fetchAll()`, everything derived from `computed.js` is stale.

## `backend/` structure

FastAPI + SQLite (stdlib `sqlite3`, no ORM — the schema is three flat tables). Same process also serves the built frontend (see Architecture below) — there's no nginx anymore.

```
app/main.py   FastAPI app: auth dependency, all routes, mounts dist/ as static files
app/db.py     Schema (historial_fondo, movimientos, participantes_config) + sqlite3 connection helper (WAL + busy_timeout) + backup_db() + replace_all()
app/xlsx.py   build_workbook()/parse_workbook() — the xlsx export/import format
tests/        pytest + FastAPI TestClient
```

- `GET /api/all` — returns `{historial, movimientos, participantes_config}` as JSON (already typed/named fields, no CSV parsing needed on the frontend side). **All three queries carry an explicit `ORDER BY fecha, id`**: without it rows come back in insertion order, which after an import is whatever order the xlsx had — and the frontend resolves "latest action per participant" and "latest valuation" positionally, so unordered rows silently change who counts as active.
- `POST /api/movimiento` / `/api/fondo` / `/api/participante` — each requires header `X-Admin-Key` matching the `ADMIN_PASSWORD` env var (compared server-side with `secrets.compare_digest` **on bytes, not str** — on `str` it raises `TypeError` for any non-ASCII key, which surfaced as a 500 instead of a 401). Payloads are validated by pydantic: `tipo` is `Literal["aporte","retiro"]`, `accion` is `Literal["agregar","quitar"]`, amounts are bounded and `fecha` must match `FECHA_RE` — an invalid write is a `422` and touches nothing.
- **`POST /api/movimiento` rejects a withdrawal that exceeds the person's shares** (`400`, `TOLERANCIA_CUOTAS` absorbs float error on a total exit). A typo'd withdrawal would leave that participant permanently negative — there's no UPDATE/DELETE to undo it, only export-edit-import. The frontend checks the same rule first via `excedeSaldo()` (`src/domain/cuotas.js`, unit-tested) so the admin gets the message before the request, but the server-side check is the one that can't be bypassed. `POST /api/import` deliberately skips it: a restore has to be able to load history as-is.
- **`POST /api/movimiento` takes an optional nested `fondo` object and inserts BOTH rows in one transaction.** This is how the Admin panel writes a movement: a movement changes shares outstanding, so if its valuation didn't land, the fund would keep the *old* share price against the *new* share count and every participant's numbers would be wrong — with no UPDATE/DELETE to fix it. Don't split this back into two sequential requests.
- `POST /api/auth/verify` — same auth dependency, no-op besides returning `200`/`401`. Used by the Admin panel's "unlock" screen to validate the key before showing the form (see `unlockAdmin()` in `src/admin.js`).
- **`require_admin` rate-limits failures per client IP** (`AUTH_MAX_FAILS` 10 per `AUTH_WINDOW_S` 300s → `429`). There's one password and no session, so every request re-submits it and guessing was otherwise free and unlimited. The counter is a plain in-process dict (expired entries are purged on each failure) — it resets on restart, which is fine for the threat model; it is *not* shared across replicas, and this app runs as a single container. The lockout is per origin, not per key: while it's active even the correct key gets `429` — which is why `unlockAdmin()` (`src/admin.js`) surfaces the backend's `detail` instead of always saying "Clave incorrecta".
- **The client IP comes from `_client_ip()`, which only reads `X-Forwarded-For` when `TRUST_PROXY` is set** (env var, off by default). Behind a reverse proxy every request carries the proxy's IP, so one failed attempt would lock out everyone; with the port exposed directly the header is client-supplied and trusting it would make the limit trivially bypassable (a different value per attempt). It has to be opt-in per deploy — don't make it unconditional.
- **The pydantic models carry `allow_inf_nan=False` (`SIN_INF_NAN` in `app/main.py`) and `_to_float()` (`app/xlsx.py`) rejects non-finite cells.** `inf` satisfies every `gt`/`ge` bound (`inf > 0` is True), `cuotas` has no bound at all, and both `json.loads` and `float()` accept those literals — so a movement with an infinite amount was stored with a `201` and from then on `GET /api/all` answered `500` forever (json can't serialize `inf`), with no UPDATE/DELETE to remove the row.
- **A custom `RequestValidationError` handler returns `{"detail": "<campo>: <msg>"}` as a string.** FastAPI's default echoes the received value in the `422` body, which for an `inf` can't be serialized — the rejection turned into a `500`, defeating the guard above. It also fixes the display side: `postJSON()` does `throw new Error(detail.detail)`, and the default list of error objects rendered as `[object Object]` in the Admin form.
- `GET /api/export` — no auth (read is public, same as `/api/all`), streams an `.xlsx` with one sheet per table (`historial_fondo`, `movimientos`, `participantes_config`), header row + raw column names matching `app/db.py`'s schema.
- `POST /api/import` — requires `X-Admin-Key`, multipart `file` upload. The body is read in 1 MB chunks against `MAX_IMPORT_BYTES` (5 MB → `413`) instead of `await file.read()` in one shot; a real export of this app weighs kilobytes. **A sheet that's present but missing any of `REQUIRED_COLUMNS` (`app/xlsx.py`) aborts with `400`** — the parser defaults unknown columns to `0.0`/`""`, so a workbook with the wrong headers used to wipe the DB and replace it with rows whose amounts and shares were all zero. Columns *not* in that list (`trm`, `monto_cop`, `precio_cuota_dia`) may still be missing: they only affect the COP view. **Destructive: `replace_all()` deletes the 3 tables and reloads them from the workbook** (missing sheets import as empty, not left alone) — this is by design (predictable restore/migration, no merge/dedup logic), confirmed with a `confirm()` prompt client-side (`importXlsx()` in `src/admin.js`) before the request fires. `replace_all()` calls `backup_db()` first, which snapshots the DB to `<DB_PATH>.<timestamp>.bak` next to it (last 5 kept) — importing the wrong file is recoverable, which matters because nothing else in this app can undo a write. `tipo`/`accion` cells are lower-cased and validated against the same enums as the API; an unknown value aborts the import with the sheet and row number instead of silently poisoning the share math. Dates in cells are normalized back to the app's ISO string convention regardless of whether Excel stored them as text or as a real date/datetime value (`_to_fecha_str()` in `app/xlsx.py`).
- **A `@app.middleware("http")` adds `Content-Security-Policy` + `X-Content-Type-Options` + `Referrer-Policy` + `X-Frame-Options` to every response.** The CSP is a header and **not** a `<meta>` in `index.html` on purpose: the same HTML is served by Vite in dev against a backend on another port, and a `'self'`-based CSP baked into the markup would break HMR and every call to `:8000`. Sent from here, it only applies when this process serves the build. `connect-src` has to keep `https://www.datos.gov.co` (the TRM fetch) and `style-src` needs `'unsafe-inline'` (the markup uses inline `style=` attributes); if you add an external asset, it will be blocked until it's listed here.
- **`BACKUP_INTERVAL_H`** (default 24, `0` disables) — an asyncio task started in `lifespan` calls `backup_db()` every N hours, on top of the pre-import backup. It sleeps *before* the first snapshot, so short-lived processes (pytest, a quick local run) never write one. Both kinds of backup land inside the same volume as the DB, so they cover corruption and bad writes, not losing the volume — the off-box `.xlsx` export is still the real backup (see README).
- `DB_PATH` (default `/data/fondi.db`) and `ADMIN_PASSWORD` (**default `"admin"`, both in `app/main.py` and in `docker-compose.yml`'s `${ADMIN_PASSWORD:-admin}`**) are the two env vars the backend needs in production. The default is intentional — this is a private family app with no real security boundary to begin with (see "Admin panel auth" below); the priority is that it never becomes unusable because someone forgot to set the var. Set your own in `.env`/Portainer before exposing this beyond your LAN.
- `STATIC_DIR` (default `../static` relative to `app/`) is where the built frontend lives inside the image — see the root `Dockerfile`. **The mount is conditional (`if os.path.isdir(STATIC_DIR)`)**: when the directory doesn't exist (running the backend standalone for local frontend dev, or under pytest) the app simply serves no static routes instead of crashing — Starlette's `StaticFiles` re-checks the directory on every request and 500s if it's missing, so this used to break the very setup described below before `check_dir=False` was replaced with this check.
- `ALLOWED_ORIGINS` (comma-separated, default `*`) configures CORS. **This one still matters even though prod is same-origin**: `npm run dev` runs the frontend on `:8080` and the backend separately on `:8000` — different origins — so the browser sends CORS preflight (`OPTIONS`) for every admin `POST` (custom `X-Admin-Key` header forces it). Without CORS enabled, every write from the Admin panel fails in dev (this was a real regression caught by an actual browser test — `curl`-only testing didn't catch it, since `curl` doesn't send preflights).

`src/config.js`'s `API_BASE_URL` is `''` in production builds (`import.meta.env.DEV` is false) — same origin as the page. In `npm run dev` it points at `http://localhost:8000` (run the backend separately with `uvicorn app.main:app --port 8000 --reload` for local frontend dev — see the `ALLOWED_ORIGINS` note above, it's why this still works cross-origin).

## Architecture

**One image, one container.** The root `Dockerfile` is multi-stage: `node` builds `dist/`, then a `python` stage installs FastAPI and copies `dist/` in as static files (`COPY --from=build /app/dist ./static`) alongside the backend code. **The runtime stage runs as a non-root user (uid `10001`)**; `/data` is created and `chown`ed *before* the `VOLUME` instruction so a fresh named volume inherits that owner. A volume created by an older root-running image keeps root ownership and SQLite can't write to it — that needs a one-time `chown` documented in the README, so don't change the uid casually. `init_db()` ends with a `PRAGMA user_version = 1` write probe precisely for this: without it the container came up **healthy** on a read-only volume (reads and the healthcheck don't write) and only the saves failed, one at a time, in production. At runtime there's a single `uvicorn` process serving both the SPA and the `/api/*` routes on the same port — no nginx, no second container. CORS is still enabled (see `ALLOWED_ORIGINS` above) because the same backend is also run standalone for local frontend dev, where origins do differ. The browser talks to one backend over HTTP/JSON either way — no more Google Sheets/Apps Script in the loop.

- **Read**: `fetchAll()` (`src/api/backend.js`) does a single `GET /api/all`.
- **Write**: `postMovimiento()`/`postFondo()`/`postParticipante()` (`src/api/backend.js`) do real `POST` requests with `X-Admin-Key` and read the actual JSON response/status — unlike the old `postScript()`, there's no more `mode: 'no-cors'` blind-write; a `401`/`400` surfaces as a real error in the form.
- The backend (`backend/app/main.py`) only does `INSERT` — **it's still an append-only log, there's no UPDATE/DELETE.** That part of the model didn't change, only where it's stored and that writes are now actually authenticated server-side. The consequence worth keeping in mind: a bad write can't be undone in the app, only by exporting the xlsx, editing it and importing it back. That's why writes that belong together are one transaction and why the import takes a backup first.
- Static file routes are mounted last in `main.py`, after every `/api/*` route — Starlette matches in registration order, so the catch-all static mount never shadows an API route. If you add a new top-level route, define it before the `app.mount("/", StaticFiles(...))` line at the bottom of the file.

### Data model (SQLite tables, `backend/app/db.py`)

| Table | Columns | Who fills it |
|---|---|---|
| `historial_fondo` | `fecha, valor_total, precio_cuota, cuotas_circ, trm` | Snapshots — a total fund value confirmed by the admin at each point in time. Can have several rows on the same day (intraday valuations); the frontend dedupes them (see below) |
| `movimientos` | `fecha, persona, tipo, monto, precio_cuota_dia, cuotas, monto_cop, trm_dia` | One individual contribution/withdrawal per row |
| `participantes_config` | `fecha, nombre, accion` | Append-only log of `agregar`/`quitar` (add/remove) — Admin panel → "Manage participants". `participantesActivos()` (`src/computed.js`) takes the latest action per name |

### Dynamic participants

`PARTICIPANTS` no longer exists as a static constant in `config.js`. The list comes from `participantesLog` (`src/state.js`), populated from the `participantes_config` tab:

- `participantesActivos()` — the latest `agregar`/`quitar` action per name wins, **decided by sorting on `fecha`, not by the order the rows arrive in**: after an import the row order is the xlsx's, and an old `quitar` sitting below a newer `agregar` would drop an active participant from the list. The backend's `ORDER BY` makes this redundant in the normal path; both sides are cheap and the failure is silent, so keep them. Used for the "Register movement" `<select>` (you can only contribute/withdraw for someone active).
- `participantesTodos()` — active ∪ any `persona` that appears in `movimientos`, even if removed afterward. Used in `resumen.js`/`charts.js` so someone with real shares never disappears from their card or the donut chart just for leaving the active list.

Removing a participant never deletes their history or shares — it just takes them out of the selection list for new movements.

### The "shares" model — the non-obvious part

The fund works like a mutual fund: each contribution/withdrawal is converted to "shares" at the share price in effect at that moment, and `share_price = total_fund_value / shares_outstanding`. This means **the share price used to convert a contribution into shares must reflect the REAL fund value right before that contribution** — if a stale share price is used (from an old checkpoint, without capturing later gains/losses), the new contributor buys shares "cheap" and gets a free ride on gains that belonged to earlier contributors (dilution).

`calcularCuotas()` (`src/domain/cuotas.js`) resolves this by deriving the "just before" share price from the `fund value after` (which the admin types in by hand and is assumed correct) and the movement amount — it does **not** read the share price from the last saved checkpoint (that was a real bug, fixed; see commit history). The formula:

```js
valorAntes  = tipo === 'retiro' ? valorFondo + abs : valorFondo - abs;
precioAntes = cuotasActuales > 0 ? valorAntes / cuotasActuales : 1;
```

It's a pure function, kept out of `admin.js` on purpose: it's the highest-risk logic in the app and this is the only way it can be unit tested. `submitMov()` and `previewMov()` both call it, so the live hint and the saved row can't drift apart. **If you touch it, run `npm test`** — `cuotas.test.js` includes the dilution regression as an explicit case: don't go back to using `precioCuota()` (the cached checkpoint) to compute the shares of a new movement.

`submitFondo()` (`src/admin.js`) is different: it records a "valuation" (a value change with no contribution/withdrawal, e.g. weekly close) — there it's correct to use `cuotasCirc()` because shares outstanding don't change, only the price.

### The chart x-axis — proportional to time, not by index

`src/render/charts.js` plots with `type: 'linear'` on the x-axis using real timestamps (`{x: ms, y: valor}` per point), not a `category` axis with an array of labels — so a 6-day gap takes up 6x the width of a 1-day gap. If you go back to an index/label-based axis, that proportionality is lost (this was exactly the reported and fixed bug).

- **Calendar-aligned ticks**: `computeCalendarTicks()` decides the granularity based on the visible span (month if >150 days, week if >20, every 4 days if >8, otherwise every day) and returns exact timestamps (start of month/week), not data indices — they're injected by overwriting the ticks array via `afterBuildTicks`, regardless of whether real data exists exactly there.
- **Chart.js gotcha**: the `linear` axis defaults to `bounds: 'ticks'`, which expands `min`/`max` to its own auto-generated "round" ticks — `afterBuildTicks` overwrites them but doesn't fix that already-inflated `min`, leaving a phantom gap before the first real point. That's why `xAxis()` sets explicit `min`/`max` to the first/last real timestamp (plus `bounds: 'data'` as reinforcement). If that explicit `min`/`max` is removed, the gap comes back.
- **Backward-fill point clamp**: `filteredHistorialWithFill()` may prepend the last valuation *before* the selected range (so the line doesn't start at zero); its real date can be much earlier than the visible range, so in `renderCharts()` its `x` is clamped to the range edge (not its real date) — otherwise most of the chart width would be wasted on a flat segment outside the range.
- **Straight lines, no curves**: `tension: 0` in `makeDataset()` — with tension>0 and proportional spacing (very uneven gaps between points), Chart.js's bezier smoothing produced visible distortions near the edges. Point radius (`pointRadiusFor()`) decreases with point count so they don't pile up over long ranges.
- **"Ganancia acumulada" line color needs a zero-crossing split, not just per-segment sign**: `makeGananciaDataset()` colors the line green above zero / red below via Chart.js's `segment.borderColor`, which colors a whole segment by one endpoint's sign — a segment that crosses zero (e.g. -$50 → +$30) would otherwise render as a single solid color even though half of it is on the wrong side of the line. `splitAtZero()` fixes this by inserting an interpolated point at exactly `y: 0` wherever consecutive points change sign, so no segment ever straddles zero. `gainSegmentColor()` then has to fall back to `p0`'s sign when `p1` is that interpolated zero point (its own sign is meaningless — "0 is not negative" would otherwise miscolor every ascending crossing green from the bottom up). Both halves (`splitAtZero` + the `p0` fallback) are required together; this exact combination was arrived at by fixing two related bugs in the same session — don't simplify one away without re-checking both crossing directions (descending AND ascending) against real data with a sign change.

### The persona chart's tooltip is custom HTML, not Chart.js's native one

`personaChartOpts()` (`src/render/charts.js`) sets `tooltip: { enabled: false, external: personaTooltipHandler }` instead of the usual `callbacks` config used by the other two charts. Reason: the design calls for "Valor actual"/"Invertido" in bold but the dollar amount next to each in regular weight, on the same line — Chart.js's native canvas-rendered tooltip applies one uniform font per body line, so it can't mix weights within a line. `personaTooltipHandler()` builds a small floating `<div id="persona-tooltip">` with `<b>` around just the label, positioned via `chart.canvas.getBoundingClientRect()` + `tooltip.caretX/caretY`. `resetPersonaChart()` removes this element from the DOM — if you add another chart with the same pattern, don't forget an equivalent cleanup or a stray tooltip div can outlive its chart.

### The Admin form is "state-backed" — it doesn't trust the browser to retain values

On iOS Safari, the Admin panel's `<input type="date">`/`<input type="time">` sometimes clear themselves: when switching tabs (`.tab-content` uses `display:none`/`block`, and the input loses its value when re-shown) or during the big reflow triggered by `renderAll()` after saving. It's a WebKit bug, not reproducible on Chromium — don't fix it by changing the tabs mechanism without testing on a real iPhone first.

The workaround lives in `src/admin.js`: `FORM_FIELDS` lists the IDs of all form fields; `saveFormSnapshot()` copies them to an in-memory object on every `input`/`change` (delegated on `#admin-panel`, see `bindAdminEvents()`); `restoreFormSnapshot()` (exported) reapplies them. It's called after `fetchAll()` in `submitMov()`/`submitFondo()`/`agregarParticipante()`/`quitarParticipante()`, and in `setTab()` (`src/ui/tabs.js`) when entering the `admin` tab. **If you add a new field to the Admin form, add it to `FORM_FIELDS`** or it will be left out of this mechanism.

### Other quirks

- **Every write in the Admin panel is guarded against a double click** — `conBoton()` (`src/admin.js`) disables the button for the duration of the request, and `submitMov()`/`submitFondo()` do the same inline. The log is append-only, so a duplicated row can't be deleted from the app; on the import it's worse, since the second run would back up the *already replaced* DB and push a good snapshot out of the 5-backup rotation.
- **`precioCuota()` (`src/computed.js`) only falls back to `1` when there's no history at all.** With a valuation saved it returns its price as-is, even if that's `0` — the old `|| 1` invented a dollar of value per share for a fund worth nothing (reachable via import, not through the UI).
- **`fmtMoneyInput()` (`src/utils/money-input.js`) restores the caret by counting real characters** (digits and the decimal comma), not by index: thousand separators appear and disappear as you type and shift every index after them. It used to force the caret to the end on every keystroke, which made it impossible to fix a digit in the middle of an amount. Deleting a thousand separator itself is still a no-op (the formatter puts it right back) — that one needs to know the input was a deletion, which `input` alone doesn't tell us.
- **Zero emojis in the UI**: not in toasts, status messages, banners, or decorative icons (`src/ui/toast.js`, `src/admin.js`, `src/ui/banner.js`). Explicit request — the CSS color/class (`.ok`/`.err`) already communicates the state.
- **Admin panel auth is real, server-side**: `unlockAdmin()` (`src/admin.js`) POSTs the typed key to `/api/auth/verify`; the backend compares it against `ADMIN_PASSWORD` with `secrets.compare_digest` (`backend/app/main.py`). The key is never embedded in the frontend bundle — every write request resends it via `X-Admin-Key` and the backend re-validates it independently (there's no session/token, each request is checked on its own).
- **TRM (exchange rate)** is fetched live from Superfinanciera via `datos.gov.co` (`fetchTRM()`, `src/api/backend.js`), with a fallback to 4000 if the fetch fails. It runs with `AbortSignal.timeout(4000)` and **in parallel with `/api/all`, not before it** — it used to be awaited first, so a slow day at that third party left the whole dashboard on skeletons waiting for a value that has a fallback anyway. `renderAll()` still waits for both so COP figures don't render twice.
- **Money formatting goes through `src/utils/format.js`, which instantiates its `Intl.NumberFormat`s once at module level.** Several of these run inside Chart.js tick/tooltip callbacks — those fire per tick per render, and building a formatter in there was allocating one per call. Don't write `new Intl.NumberFormat(...)` in a render path; add a helper there instead.
- **The Admin panel blocks a valuation when there are 0 shares outstanding but the fund already has history** (`submitFondo()`/`previewFondo()`): the "first record" path sets `cuotas = valor` to start the fund at $1/share, and reusing it after everyone withdrew would invent shares no movement backs, tripping `renderConsistencyCheck()`. First record is `!latest()`, not `!cuotasCirc()`.
- **`previewTrm()` warns when the implied TRM (COP/USD) deviates more than 15% from `S.trm`** — the entered rate is stored as-is and can't be corrected afterward, so a missing zero in the COP amount would otherwise go in unnoticed.
- **Form labels use `for`/`id`, and the two-input "Fecha y hora" rows are a `role="group"` + `aria-labelledby`** instead of a `<label>` wrapping two controls. The tab bar is a real `role="tablist"` whose `aria-selected` is kept in sync by `setTab()` (`src/ui/tabs.js`) — if you add a tab, update the attribute there too, not just the class.
- **`S.historial` is a per-day record, not a raw per-movement row**: `fetchAll()` (`src/api/backend.js`) dedupes `historial_fondo` keeping the most recent valuation per day (`fecha.slice(0, 10)` as the key). If the admin records several valuations on the same day, only the last one survives — this keeps the chart (`filteredHistorialWithFill()`, `src/render/charts.js`) from zigzagging intraday or repeating the same day on the x-axis. If you need the raw intraday detail, query `historial_fondo` directly against the SQLite DB, not through `/api/all`/`S.historial`.
- **Never build a date with `toISOString()`** — use `todayLocal()` (`src/utils/dates.js`). `toISOString()` returns the date in **UTC**: in Colombia (GMT-5) everything after 19:00 local is already the next day, so `nowLocal()` was stamping movements and valuations with tomorrow's date plus today's local hour, and the chart's forward-fill was extending a day into the future. Both call sites (`src/admin.js`, `src/render/charts.js`) go through `todayLocal()` now.
- **Participant names are escaped before hitting `innerHTML`** — `esc()` (`src/utils/html.js`), used in `resumen.js`, `movimientos.js` and `admin.js`. Names are admin-supplied so this isn't a real XSS boundary, but an unescaped quote broke the row markup and the `data-nombre` of the remove button.
- **The Admin panel warns when the two share-count sources disagree**: `renderConsistencyCheck()` (`src/admin.js`) compares `cuotasCirc()` (the sum of `movimientos.cuotas`, which is what the whole frontend derives from) against `historial_fondo.cuotas_circ` from the latest valuation (which nothing else reads). They only drift via an import whose `historial` is complete but whose `movimientos` aren't — and when they do, every participant's percentage is silently wrong. The banner (`#admin-check`) stays hidden while the difference is ≤ 0.01.
- **No inline handlers**: the HTML has no `onclick`/`oninput`; all listeners are registered in `main.js`/`admin.js` via `addEventListener`, backed by `data-*` attributes (`data-tab`, `data-r`, `data-tipo`).
- **Two independent range selectors share the same `.range-btn` class**: the hero chart's range buttons and "Evolución de tu inversión"'s range buttons both use `.range-btn` for shared styling, but the persona-chart ones also carry `.persona-range-btn` so `main.js`/`setRange()` (`src/ui/tabs.js`) can exclude them (`:not(.persona-range-btn)`) and `setPersonaRange()` can target only them — they drive separate state (`S.range` vs `S.personaRange`). If you add a third range selector elsewhere, give it its own distinguishing class too, or it'll silently piggyback on one of the two existing handlers.
