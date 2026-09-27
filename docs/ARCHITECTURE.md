# Architecture

Fondi is a modular monolith: the Vite build and the FastAPI API run in one container, while the frontend and backend stay separate modules joined only through HTTP. The backend is the only owner of the database and of the share math that gets persisted.

## System context

One household admin writes; a handful of participants read. The app runs as a single container on a home server, usually behind a reverse proxy, with a SQLite file on a Docker volume. The only external dependency is the daily COP/USD exchange rate from datos.gov.co, fetched by the browser with a 4-second timeout; when it fails the app uses the last known rate, or 4000.

## Layer map and dependency rule

| Layer | Lives in | May depend on |
|---|---|---|
| Screens | `src/components/` | derived state, snapshot, I/O adapter |
| Derived state | `src/computed.js`, `src/domain/` | snapshot only (pure) |
| Snapshot | `src/state.ts` | nothing |
| I/O adapter | `src/api/backend.js` | HTTP |
| API | `backend/app/main.py` | domain, persistence, xlsx |
| Domain | `backend/app/domain.py` | nothing (pure) |
| Persistence | `backend/app/db.py`, `backend/app/xlsx.py` | sqlite3, openpyxl |

Financial math never lives in JSX, so it stays unit-testable. The frontend computes shares only for the live preview and to warn before a request; the backend recomputes them from its own share count and stores its result.

## Project structure

```
index.html             Vite shell
public/                Icons and theme.js (applies the saved theme before first paint)
src/
  App.tsx              Data refresh, navigation, theme toggle and load errors
  components/          Summary, Movements, Admin and the Chart.js components
  state.ts             In-memory snapshot of GET /api/all
  computed.js          Derived figures: share price, per-participant value and gain
  domain/cuotas.js     Share math for the Admin preview
  api/backend.js       All HTTP I/O, plus the exchange-rate fetch
  config.js            API base URL, participant colors, mock mode and fixtures
  style.css            Design tokens for both themes and all styles
backend/
  app/main.py          FastAPI app: auth, rate limit, routes, security headers, static mount
  app/domain.py        Authoritative share calculation for a movement
  app/db.py            Schema, connection helper, backups and the import swap
  app/xlsx.py          xlsx export/import format and validation
  tests/               pytest + FastAPI TestClient
Dockerfile             Node build stage, then the Python runtime serving dist/
```

## Data and storage

One SQLite file (`/data/fondi.db`) with three append-only tables. The backend only ever inserts; the one exception is an import, which replaces all three tables after taking a backup.

| Table | Holds |
|---|---|
| `historial_fondo` | Valuations: total value, share price, shares outstanding and exchange rate at a point in time. Several per day are allowed; the frontend keeps the last one per day. |
| `movimientos` | Contributions and withdrawals: person, USD amount, share price used, shares (negative for a withdrawal), COP paid and the day's rate. |
| `participantes_config` | Log of `agregar`/`quitar` (who can receive movements) and `ocultar`/`mostrar` (who is shown). The latest action per person wins. |

Invariants the code relies on:

- Every read comes back `ORDER BY fecha, id`, and the frontend also sorts by date before resolving "latest".
- A movement and the valuation right after it are inserted in one transaction.
- A withdrawal can't take a person below zero shares (`400`), except through an import, which loads history as-is.
- Every contribution has a COP amount above zero, since COP gains use it as the cost.

Backups (`fondi.db.<timestamp>.bak`, last 5 kept) are written before each import and every `BACKUP_INTERVAL_H` hours, in the same volume.

## Glossary

Code and UI use Spanish terms; this doc uses the English ones.

| In code | In English | Meaning |
|---|---|---|
| `cuota` | Share | Unit of ownership. A person's stake is their share count. |
| `precio_cuota` | Share price | Fund value / shares outstanding. |
| `cuotas_circ` | Shares outstanding | Sum of every movement's shares. |
| `aporte` / `retiro` | Contribution / withdrawal | Money in or out, converted to shares at the price right before it. |
| `valuación`, `historial` | Valuation | A fund value confirmed by the admin; changes the price, not the shares. |
| `TRM` | Exchange rate | Official COP/USD rate of the day, from datos.gov.co. |

## Decision log

| Decision | Why | Trade-off |
|---|---|---|
| Append-only log, no UPDATE or DELETE | A financial history edited in place loses its audit trail, and a bad edit is invisible. | Corrections go through export, edit and import; every import takes a DB backup first, and related writes go in one transaction. |
| Share price comes from the value typed after the movement | Using the last saved valuation let a newcomer buy shares at a stale, lower price and ride earlier gains (dilution). | The admin must type the real fund value at every movement; a regression test covers the dilution case on both sides. |
| The backend recomputes shares instead of trusting the browser | The browser's figure is a preview; persisted numbers must not depend on client code. | The math exists twice (`domain.py` and `cuotas.js`), each with its own tests. |
| One container serves the SPA and the API | It runs on one home server behind Portainer; two services would double the deploy surface. | The split stays possible with `SERVE_STATIC=0` and `VITE_API_BASE_URL`, no code changes. |
| SQLite with stdlib `sqlite3`, no ORM | Three flat tables, one writer, kilobytes of data. | No migrations framework; schema changes are handled by hand in `init_db()`. |
| One password, no session, rate limit per IP | A private family app; the simplest thing that can't be guessed for free. | Every write resends the key. The limit lives in memory, resets on restart and needs `TRUST_PROXY` behind a proxy. |
| Security headers sent by the backend, not a `<meta>` tag | The same HTML is served by Vite in dev against a backend on another port; a `'self'` policy in the markup would break it. | The policy only applies when the backend serves the build; new external assets must be added to it. |
| Import replaces everything, no merge | A restore must be predictable; merge and dedup logic would be the riskiest code in the app. | It is destructive by design: a confirmation dialog and a pre-import backup guard it. |
