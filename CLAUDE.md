# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. Code structure, symbols and call paths come from CodeGraph (`.codegraph/`); this file only keeps what the code can't tell you: commands, invariants and the reasons behind non-obvious decisions.

How the system works and why: `docs/ARCHITECTURE.md`. Deploy, config and backups: `docs/DEPLOYMENT.md`.

## What this is

"Fondi" — dashboard for managing a mutual-fund-style investment pool: several participants contribute/withdraw USD at different times, and each one owns a fraction of the fund measured in "shares" (like a collective investment fund). Shows fund value, share price, individual ownership, and returns in USD and COP.

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

There's no linter configured. Tests: `pytest` for the backend and `vitest` for DOM-free frontend logic. `npm run typecheck` validates the React/TypeScript boundary. Keep financial calculations outside JSX so they remain unit-testable. The only CI is `.github/workflows/docker.yml`: on every push to `main` and every pull request touching the app it runs both test suites; only a push to `main` whose tests pass publishes `ghcr.io/<user>/fondi:latest`.

To test changes without hitting the real backend, set `MOCK_MODE = true` in `src/config.js`.

`S` (`src/state.ts`) is the API snapshot in memory — if the browser hasn't completed a recent `fetchAll()`, everything derived from `computed.js` is stale. React owns only UI state.

## Backend rules

- **`GET /api/all` queries carry an explicit `ORDER BY fecha, id`**: without it rows come back in insertion order, which after an import is whatever order the xlsx had — and the frontend resolves "latest action per participant" and "latest valuation" positionally, so unordered rows silently change who counts as active.
- **`secrets.compare_digest` compares `X-Admin-Key` on bytes, not str** — on `str` it raises `TypeError` for any non-ASCII key, which surfaced as a 500 instead of a 401. Amounts have a lower bound but deliberately no upper bound (the fund has no natural ceiling).
- **`POST /api/movimiento` rejects a withdrawal that exceeds the person's shares** (`400`). A typo'd withdrawal would leave that participant permanently negative with no way to undo it. The frontend checks the same rule first via `excedeSaldo()`, but the server-side check is the one that can't be bypassed. `POST /api/import` deliberately skips it: a restore has to load history as-is.
- **`POST /api/movimiento` requires a nested `fondo` and inserts both rows in one transaction.** The backend computes the shares itself (`calcular_movimiento()`, `app/domain.py`) and rejects client-sent `cuotas` (`extra="forbid"`). A movement without its valuation would leave the old price against the new share count. Don't split it into two requests or trust the browser's figure.
- **`require_admin` rate-limits failures per client IP** (10 per 300s → `429`). One password, no session, so guessing was otherwise free. The in-process dict resets on restart and isn't shared across replicas — fine, this is a single container. The lockout is per origin, not per key: even the correct key gets `429`, which is why the unlock flow surfaces the backend's `detail`.
- **`_client_ip()` only reads `X-Forwarded-For` when `TRUST_PROXY` is set** (off by default). Behind a proxy every request carries the proxy's IP, so one failure would lock out everyone; exposed directly, the header is client-supplied and trusting it bypasses the limit. Keep it opt-in per deploy.
- **Pydantic models use `allow_inf_nan=False` and `_to_float()` rejects non-finite cells.** `inf` satisfies every `gt`/`ge` bound and both `json.loads` and `float()` accept it — an infinite amount was stored with a `201` and from then on `GET /api/all` answered `500` forever, with no way to delete the row.
- **The custom `RequestValidationError` handler returns `{"detail": "<campo>: <msg>"}` as a string.** FastAPI's default echoes the received value, which for `inf` can't be serialized (the `422` became a `500`), and its list of objects rendered as `[object Object]` in the Admin form.
- **`POST /api/import` is destructive by design**: `replace_all()` deletes the 3 tables and reloads them (missing sheets import as empty) — predictable restore, no merge logic. It calls `backup_db()` first (last 5 kept), confirmed with a native dialog in the frontend. Guards, each from a real failure:
  - Body read in 1 MB chunks against `MAX_IMPORT_BYTES` instead of one `await file.read()`.
  - A sheet missing any of `REQUIRED_COLUMNS` aborts with `400` — the parser defaults unknown columns to `0`/`""`, so wrong headers used to wipe the DB and load all-zero rows.
  - Every `aporte` needs `monto_cop > 0`: the COP gain takes it as the contribution's cost. `POST /api/movimiento` and the Admin form enforce the same rule. Retiros don't store COP and use that day's valuation TRM.
  - `tipo`/`accion` are validated against the API enums; unknown values abort with sheet and row number. Dates are normalized to the app's ISO strings whether Excel stored text or a real date.
- **Security headers (CSP etc.) are set in an HTTP middleware, not a `<meta>` in `index.html`**: the same HTML is served by Vite in dev against a backend on another port, and a `'self'` CSP in the markup would break HMR and calls to `:8000`. `connect-src` must keep `https://www.datos.gov.co` (TRM) and `style-src` needs `'unsafe-inline'` (inline `style=`). Any new external asset is blocked until listed there.
- **`BACKUP_INTERVAL_H` sleeps before the first snapshot** so pytest and short local runs never write one.
- **Keep `ADMIN_PASSWORD`'s `"admin"` default** in both `app/main.py` and `docker-compose.yml`: the app must never become unusable because the var was forgotten.
- **The static mount is conditional (`if SERVE_STATIC and os.path.isdir(STATIC_DIR)`)** and registered last: Starlette's `StaticFiles` 500s on every request if the directory is missing (standalone dev, pytest), and routes match in registration order, so new top-level routes go before `app.mount("/", ...)`.
- **CORS (`ALLOWED_ORIGINS`, default `*`) still matters though prod is same-origin**: in dev the frontend is on `:8080` and the backend on `:8000`, and `X-Admin-Key` forces a preflight on every admin `POST`. Removing it broke every Admin write in dev — caught only in a real browser, since `curl` doesn't send preflights.

## Architecture

**One image, one container, one `uvicorn` process** serving both the SPA and `/api/*`. **The runtime stage runs as uid `10001`**; `/data` is `chown`ed before `VOLUME` so a fresh volume inherits that owner. A volume from an older root-running image needs a one-time `chown` (`docs/DEPLOYMENT.md`), so don't change the uid casually. `init_db()` ends with a `PRAGMA user_version = 1` write probe because without it the container came up healthy on a read-only volume and only the saves failed, in production.

**The backend only does `INSERT` — append-only log, no UPDATE/DELETE.** A bad write can only be undone by exporting the xlsx, editing it and importing it back. That's why writes that belong together are one transaction and why the import takes a backup first.

### Participants

- `participantesActivos()` takes the latest `agregar`/`quitar` per name **by sorting on `fecha`, not arrival order**: after an import an old `quitar` below a newer `agregar` would drop an active participant. The backend `ORDER BY` makes it redundant in the normal path; keep both, the failure is silent.
- `participantesTodos()` (active ∪ anyone in `movimientos`) is what charts and cards use, so someone with real shares never disappears for leaving the active list. Removing a participant never deletes history or shares.
- **`agregar`/`quitar` decide who can receive movements; `ocultar`/`mostrar` decide who is shown** (`participanteOculto()`). They're independent: a hidden participant can still be active.

### The "shares" model

The math lives twice: `backend/app/domain.py` (authoritative, persisted) and `src/domain/cuotas.js` (Admin preview and pre-check). Change both and run both suites. Why the price comes from the value typed *after* the movement: `docs/ARCHITECTURE.md` (decision log). **Never use `precioCuota()` (the saved checkpoint) to price a new movement** — that was the dilution bug, and `cuotas.test.js` / `test_domain.py` cover it.

A valuation with no movement is different: there `cuotasCirc()` is correct because shares outstanding don't change.

### Charts

- **The x-axis is `type: 'linear'` over real timestamps, not a category axis** — a 6-day gap must take 6x the width of a 1-day gap (a reported bug).
- **Explicit `min`/`max` on the x-axis**: the `linear` axis defaults to `bounds: 'ticks'`, which inflates `min` to its own round ticks; `afterBuildTicks` replaces the ticks but not that `min`, leaving a phantom gap before the first point.
- **The backward-fill point is clamped to the range edge**, not its real date, or most of the width is wasted on a flat segment outside the range.
- **`tension: 0`**: bezier smoothing with very uneven gaps distorted the line near the edges.
- **Hero overlay markers carry no names** (explicit request). They sit at the movement's real date with `valueAt()` interpolating, because the retiro-day snapshot is not on the value line. `setOverlay` compares with the previous value — without that guard `afterUpdate` re-renders in a loop.
- **The hero line is downsampled with LTTB above 150 points, never averaged**, so every hoverable point is a real value and peaks survive.
- **The y-axis never crosses zero for a non-negative series** (`suggestedMin`/`suggestedMax`, 8% pad, clamped at 0) — `grace: '8%'` pushed it to a -20k tick.
- **The contributed line uses every snapshot with `stepped: 'before'`**, so a withdrawal steps down on its own day; `'after'` draws the jump at the previous point.
- **Period percentages are gain over capital at stake, never share price**: gain / (start value + net contributions). A raw `valor_total` change counts contributions as return, and share-price return disagreed in sign with the person's own gain.
- **Memoize chart rows** (`heroSeries(range)`, `ParticipantChart` rows): hover re-renders the parent, and a new array per render rebuilt the chart on every mouse move and reset the hover.

### Admin form

- **Every field is controlled React state**: on iOS Safari native date/time inputs cleared when their containers were hidden or re-rendered. Keep new fields controlled.
- **Every write is guarded against double click** (one `busy` operation): the log is append-only, and a second import would back up the already replaced DB and push a good snapshot out of the rotation.
- **A valuation is blocked with 0 shares outstanding but existing history**: the "first record" path sets `cuotas = valor` ($1/share), and reusing it after everyone withdrew would invent unbacked shares. First record is `!latest()`, not `!cuotasCirc()`.
- **`previewTrm()` warns above 15% deviation from `S.trm`**: the rate can't be corrected afterward, so a missing zero would go unnoticed.
- **The share-count mismatch warning** (`cuotasCirc()` vs latest `cuotas_circ`, > 0.01) catches an import with complete `historial` but incomplete `movimientos`.

### Theme, fonts and colors

- **Dark is the default; light is opt-in** via `data-theme="light"`, persisted in `localStorage` (`fondi-theme`). `public/theme.js` applies it before first paint and is external because the CSP's `script-src 'self'` blocks inline scripts.
- **All colors are CSS tokens** in `style.css`. Chart.js can't read CSS variables: charts call `cssVar()` at creation and depend on `useTheme()` to rebuild; canvas gradients use `withAlpha()` because `color-mix()` isn't reliable in canvas.
- **Geist is self-hosted** (`@fontsource-variable/geist`): Google Fonts and `data:` fonts are blocked by the CSP — keep the files above Vite's inline limit.
- **Participant colors are pastels**: text on them uses `--on-pastel`, never white.
- **Money format is `US$ 12.450` / `$ 48.230.000`** via `format.js`; callers don't append " USD"/" COP", and plain numbers use `fmtN`/`fmtN0`. Formatters are module-level — never `new Intl.NumberFormat(...)` in a render path (Chart.js callbacks run per tick).

### Other rules

- **Zero emojis in the UI** (explicit request); `.ok`/`.err` classes carry the state.
- **Never build a date with `toISOString()`** — use `todayLocal()`. It returns UTC: in Colombia everything after 19:00 is already tomorrow.
- **`S.historial` keeps only the last valuation per day** (dedupe in `fetchAll()`), so charts don't zigzag intraday. Raw intraday detail is only in SQLite.
- **`precioCuota()` falls back to `1` only with no history at all**; a saved price of `0` is returned as-is — the old `|| 1` invented value for a worthless fund.
- **TRM is fetched in parallel with `/api/all`, not before it**, with a 4s timeout and fallback 4000: awaiting it first left the dashboard on skeletons whenever the third party was slow.
- **`fmtMoneyInput()` restores the caret by counting digits and the decimal comma**, not by index, since separators shift as you type. Deleting a separator itself is still a no-op (would need to know the input was a deletion).
- **Names and backend errors render as JSX text** — never reintroduce `dangerouslySetInnerHTML` for them.
- **The admin key is never in the bundle**; every write resends it and the backend validates each request independently.
- **Resumen hides participants with zero shares**; their history stays in Movimientos. The waffle uses largest remainder so it always sums 100 and any non-zero share gets a cell.
- **Accessibility**: labels use `htmlFor`/`id`, two-input date/time rows are a labeled `role="group"`, and the tab bar is a real `role="tablist"` with `aria-selected`/`tabIndex` in sync.
