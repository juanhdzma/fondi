# Architecture

Fondi is a modular monolith by default: the Vite build and FastAPI API run in one container, while the frontend and backend remain separate modules joined only through HTTP.

## Modules

- `src/` owns rendering, local form validation and previews. `src/api/backend.js` is its only HTTP adapter.
- `backend/app/` owns authentication, persistence, imports and authoritative share calculations.
- SQLite is owned exclusively by the backend. The frontend never reads the database or derives persisted values.
- Participant configuration is append-only: `agregar`/`quitar` control new movements, while `ocultar`/`mostrar` control whether a person appears in Resumen and Movimientos.

## Movement contract

`POST /api/movimiento` accepts the participant, movement type, USD/COP amounts, movement TRM and the fund value after the movement. The backend derives the share price, shares acquired or withdrawn and the resulting fund snapshot in one transaction.

`POST /api/fondo` accepts a valuation amount and TRM. The backend derives the share count and price from its own history.

The frontend may calculate the same values for a live hint, but that result is not persisted or trusted by the backend.

## Deployment seam

The default image serves both the frontend and API. To separate them later without rewriting code:

1. Build the frontend with `VITE_API_BASE_URL=https://api.example.com`.
2. Run the backend with `SERVE_STATIC=0` and `ALLOWED_ORIGINS=https://app.example.com`.
3. Serve the generated frontend with the existing reverse proxy or any static host.

No shared package, second database or asynchronous queue is required for this split.
