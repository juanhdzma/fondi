# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Fondi" — dashboard for managing a mutual-fund-style investment pool: several participants contribute/withdraw USD at different times, and each one owns a fraction of the fund measured in "shares" (like a collective investment fund). Shows fund value, share price, individual ownership, and returns in USD and COP.

Vanilla JS + Chart.js, no framework — the DOM is manipulated directly (`innerHTML`, `render*()` functions), there's no reactive state. Bundled with Vite; `index.html` is markup only, the logic lives in `src/` as ES modules.

## Commands

```bash
npm install
npm run dev       # http://localhost:8080
npm run build     # generates dist/ (what the Dockerfile runs)
npm run preview   # serves dist/ to verify before deploying

# Docker (multi-stage build: node build → nginx serve)
docker build -t fondi .
docker run -p 8080:80 fondi
```

There's no linter or test runner configured. The only "CI" is `.github/workflows/docker.yml`, which on every push to `main` that touches `index.html`, `src/**`, `package.json`, or `Dockerfile` builds and publishes the image to `ghcr.io/<user>/fondi:latest`.

To test changes without risking the real Sheet, set `MOCK_MODE = true` in `src/config.js` — it uses `MOCK_HISTORIAL`/`MOCK_MOVIMIENTOS` instead of hitting Google Sheets.

## `src/` structure

```
main.js          Entry point — wires up event listeners (no inline onclick in the HTML) and calls fetchAll()
config.js        Deployment constants: SHEET_ID, APPS_SCRIPT_URL, ADMIN_KEY, MOCK_MODE/MOCK_*
state.js         S (in-memory state: trm, historial, movimientos, participantesLog, range) + charts (Chart.js instances)
computed.js      latest(), precioCuota(), cuotasCirc(), calcParticipante(), participantesActivos(), participantesTodos() — everything derives from S
admin.js         Full admin panel: unlock, tipo toggle, previewFondo, submitMov, submitFondo, add/remove participant
api/sheets.js    fetchCSV/postScript/fetchTRM/fetchAll — all I/O against Google
utils/           csv.js (CSV parser + CO number format), dates.js, format.js, money-input.js
render/          resumen.js, movimientos.js, charts.js — one module per UI section; index.js exposes renderAll()
ui/              tabs.js (setTab/setRange), banner.js (error banner), toast.js (confirmation popup), refresh.js
```

`state.js` (`S` and `charts`) is the single source of truth in memory — if the browser hasn't done a recent `fetchAll()`, everything derived from `computed.js` is stale.

## Architecture

**There's no backend of its own.** The "server" is a public (read-only) Google Sheet + a Google Apps Script deployed as a Web App (write-only). The browser reads and writes directly against Google, with no intermediary:

- **Read**: `fetchCSV()` (`src/api/sheets.js`) hits the Sheet's public `gviz/tq?tqx=out:csv` endpoint (no auth required, the Sheet must be shared as "Anyone with the link — Viewer").
- **Write**: `postScript()` (`src/api/sheets.js`) does a `POST` to the Apps Script with `mode: 'no-cors'` — the HTTP response can't be read (a CORS limitation of Apps Script), so confirmation that something was saved is implicit: success is assumed and then a re-fetch (`fetchAll()`) happens to reflect the real state.
- The Apps Script (fully documented in `README.md`, section 2) is a `doPost` with three actions (`movimiento`, `actualizar_fondo`, `participante`) that only do `appendRow` — **it's an append-only log, there's no UPDATE/DELETE nor server-side validation.**

### Data model (Sheet tabs)

| Tab | Columns | Who fills it |
|---|---|---|
| `historial_fondo` | `fecha, valor_total_usd, precio_cuota_usd, cuotas_en_circulacion, trm` | Snapshots — a total fund value confirmed by the admin at each point in time. Can have several rows on the same day (intraday valuations); the frontend dedupes them (see below) |
| `movimientos` | `fecha, persona, tipo, monto_usd, precio_cuota_dia, cuotas, monto_cop, trm_dia` | One individual contribution/withdrawal per row |
| `participantes_config` | `fecha, nombre, accion` | Append-only log of `agregar`/`quitar` (add/remove) — Admin panel → "Manage participants". `participantesActivos()` (`src/computed.js`) takes the latest action per name |
| `participantes` | `nombre, cuotas_totales` | **A formula**, not data: `=SUMIF(movimientos!B:B,"<nombre>",movimientos!F:F)` — recalculates itself. Not read by the frontend (visual reference within the Sheet only) |

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
- **Admin panel auth is cosmetic**: `ADMIN_KEY` (`src/config.js`) is validated frontend-only, and ends up embedded in the public bundle. Accepted for private family use (see `README.md`), it's not a real security control.
- **Colombian number format parser**: `parseCONumber()` (`src/utils/csv.js`) distinguishes `1.300,00` (thousands+decimal) from `11,23` (decimal only) from `1.300` (thousands only) — a heuristic based on the number of digits after the last period. Dates are normalized from Colombian format to ISO in `normDate()` (`src/utils/dates.js`).
- **TRM (exchange rate)** is fetched live from Superfinanciera via `datos.gov.co` (`fetchTRM()`, `src/api/sheets.js`), with a fallback to 4000 if the fetch fails.
- **`S.historial` is a per-day record, not a raw per-movement row from the Sheet**: `fetchAll()` (`src/api/sheets.js`) dedupes `historial_fondo` keeping the most recent valuation per day (`fecha.slice(0, 10)` as the key). If the admin records several valuations on the same day, only the last one survives — this keeps the chart (`filteredHistorialWithFill()`, `src/render/charts.js`) from zigzagging intraday or repeating the same day on the x-axis. If you need the raw intraday detail, read `histRows` before the dedupe, not `S.historial`.
- **No inline handlers**: the HTML has no `onclick`/`oninput`; all listeners are registered in `main.js`/`admin.js` via `addEventListener`, backed by `data-*` attributes (`data-tab`, `data-r`, `data-tipo`).
