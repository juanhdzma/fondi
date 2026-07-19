# Fondi

Web dashboard for managing a mutual-fund-style investment pool. Shows fund value, share price, individual ownership, and returns in USD and COP.

---

## ⚠️ PRIVATE USE ONLY — NO REAL AUTH

Reading the data requires no login: the Google Sheet is shared as "Anyone with the link — Viewer", so anyone with the URL can see every contribution, the fund value, and each person's shares. The Admin panel has a password (`ADMIN_KEY`), but it's validated frontend-only and ships embedded in the public JS bundle — it stops accidental clicks, not a real actor. Writes go through an append-only Apps Script (no UPDATE/DELETE), but anyone with the key can still append fake movements or valuations.

Do not expose this to the public internet (no open port-forward, no public reverse proxy) without your own auth layer in front (reverse proxy with basic auth, VPN/Tailscale, etc.) if the fund's data should stay private.

---

## Prerequisites

- Google Account
- Node.js 20+ (only for local development — the production container doesn't need it)
- GitHub account with access to GitHub Container Registry
- Server with Docker + Portainer (or any Docker host)

---

## 1. Google Sheet

### Create the Sheet

1. Create a new Google Sheet at [sheets.google.com](https://sheets.google.com)
2. Copy the **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/**SHEET_ID**/edit
   ```

### Create tabs with exactly these names

| Tab | Columns (in order) |
|---|---|
| `historial_fondo` | `fecha` · `valor_total_usd` · `precio_cuota_usd` · `cuotas_en_circulacion` · `trm` |
| `movimientos` | `fecha` · `persona` · `tipo` · `monto_usd` · `precio_cuota_dia` · `cuotas` · `monto_cop` · `trm_dia` |
| `participantes_config` | `fecha` · `nombre` · `accion` |
| `participantes` | `nombre` · `cuotas_totales` |

> `participantes_config` is an append-only log (like the others): each row is an `agregar` (add) or `quitar` (remove) event. The app computes the active list by taking, per name, the most recently recorded action — a row is never edited or deleted by hand.

> The first row of each tab must be the header. Data starts on row 2.

### Make the Sheet public (read-only)

1. **Share** button → **Change to anyone with the link**
2. Permission: **Viewer**

---

## 2. Google Apps Script (write path)

The admin panel writes data to the Sheet via an Apps Script deployed as a Web App.

### Create the script

1. In the Sheet: **Extensions → Apps Script**
2. Replace all the content with:

```javascript
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (data.action === 'movimiento') {
    ss.getSheetByName('movimientos').appendRow([
      data.fecha,
      data.persona,
      data.tipo,
      data.monto_usd,
      data.precio_cuota_dia,
      data.cuotas,
      data.monto_cop,
      data.trm_dia
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.action === 'actualizar_fondo') {
    ss.getSheetByName('historial_fondo').appendRow([
      data.fecha,
      data.valor_total_usd,
      data.precio_cuota_usd,
      data.cuotas_en_circulacion,
      data.trm
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.action === 'participante') {
    ss.getSheetByName('participantes_config').appendRow([
      data.fecha,
      data.nombre,
      data.accion
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ error: 'Acción desconocida' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Save** the project (Ctrl+S)
4. **Deploy → New deployment**
   - Type: **Web App**
   - Execute as: **Me** (your Google account)
   - Who has access: **Anyone**
5. Authorize the permissions when prompted
6. Copy the generated URL (format `https://script.google.com/macros/s/.../exec`)

> ⚠️ Every time you modify the script you must create a **new deployment**. Editing without redeploying doesn't affect the production URL.

---

## 3. Configure the app

Open `src/config.js` and edit the constants:

```javascript
export const SHEET_ID       = 'YOUR_SHEET_ID_HERE';
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/.../exec';
export const ADMIN_KEY      = 'YOUR_SECRET_KEY';
```

| Variable | Description |
|---|---|
| `SHEET_ID` | Google Sheet ID (from the URL) |
| `APPS_SCRIPT_URL` | Apps Script Web App URL |
| `ADMIN_KEY` | Key to access the admin panel |
| `MOCK_MODE` | `true` for test data, `false` to use the real Sheet |

Participants are no longer configured here: they're added and removed from the Admin panel → "Manage participants", and get saved to the `participantes_config` tab of the Sheet.

---

## 4. Run locally

```bash
npm install
npm run dev
# Open http://localhost:8080
```

`npm run build` generates the static site in `dist/` (what `docker build` runs); `npm run preview` serves it to check before deploying.

### Structure

```
index.html          Markup, no inline logic or styles
src/
  main.js            Entry point — wires up event listeners and boots the app
  config.js           Deployment constants (Sheet, Apps Script, admin key)
  state.js             In-memory state (S) and Chart.js instances
  computed.js            Derived state (share price, shares per participant, ...)
  admin.js                 Admin panel: auth, forms, movement/valuation submission
  style.css
  api/sheets.js        Reads the Sheet (CSV) and writes via Apps Script
  utils/                Formatters, CO number/CSV parser, dates, money inputs
  render/               One module per UI section (summary, movements, charts)
  ui/                   Tabs, chart date range, error banner, refresh
```

No framework — direct DOM manipulation, same as the single-file version, just split by domain and bundled with Vite.

---

## 5. Docker

### Manual build

```bash
docker build -t fondi .
docker run -p 8080:80 fondi
```

### Docker Compose (local)

```bash
docker compose up -d --build
# Open http://localhost:8080
```

Uses `docker-compose.yml` at the repo root (local build, no dependency on GHCR). To rebuild after a change: `docker compose up -d --build` again; to tear it down, `docker compose down`.

### GitHub Container Registry (GHCR)

The repo includes a workflow at `.github/workflows/docker.yml` that builds and publishes the image automatically on every push to `main`.

#### Initial setup

```bash
# 1. Create the repo on GitHub
gh repo create <user>/fondi --private --source=. --push

# 2. If the remote ended up on SSH and you don't have a key configured:
git remote set-url origin https://github.com/<user>/fondi.git
git push -u origin main
```

The workflow triggers automatically. In ~2 minutes the image lands at:
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

## 6. Deploy with Docker Compose (Portainer)

```yaml
services:
  fondi:
    image: ghcr.io/<user>/fondi:latest
    container_name: fondi
    restart: unless-stopped
    networks:
      - proxy

networks:
  proxy:
    external: true
```

> The `proxy` network must already exist (Traefik or another reverse proxy). The container serves on port **80**.

---

## 7. Workflow to update the app

```bash
# Edit code under src/
git add src/ index.html
git commit -m "feat: description of the change"
git push
# The GitHub Actions workflow rebuilds the image (npm run build inside the Dockerfile)
# Then in Portainer: pull + recreate the container
```

---

## Notes

- **TRM (exchange rate)**: fetched automatically from [datos.gov.co](https://www.datos.gov.co/resource/32sa-8pi3.json) (Superfinanciera Colombia, official TRM).
- **Writing to the Sheet**: uses `mode: 'no-cors'` due to Apps Script CORS limitations. The write still happens; the CSV re-fetch confirms the data.
- **Admin key**: validated frontend-only. Suitable for private personal/family use.
- **Date format**: the Sheet exports dates in Colombian format (`14/06/2026 17:56:00`). The app normalizes them to ISO automatically.
