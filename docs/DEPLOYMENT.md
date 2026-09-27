# Deployment

Fondi ships as one image, `ghcr.io/juanhdzma/fondi:latest`, published by `.github/workflows/docker.yml` on every push to `main` that passes both test suites. The image is public, so pulling it needs no login. One `uvicorn` process serves the frontend and the API on port 8000; the SQLite database lives in `/data`.

## Portainer stack behind a reverse proxy

```yaml
services:
  fondi:
    image: ghcr.io/juanhdzma/fondi:latest
    container_name: fondi
    restart: unless-stopped
    environment:
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - TRUST_PROXY=1
    volumes:
      - fondi-db:/data
    networks:
      - proxy

networks:
  proxy:
    external: true

volumes:
  fondi-db:
    name: fondi_db
```

- The `proxy` network must already exist, and the proxy must route to container port **8000**.
- `TRUST_PROXY=1` makes the login rate limit count real clients from `X-Forwarded-For`. Without it, every request carries the proxy's IP and one wrong password locks out everyone. Never set it when the port is exposed directly: the header is then client-supplied and anyone can skip the limit.
- `name: fondi_db` pins the volume name. Without it Compose prefixes the stack name (`fondi_fondi-db`), so renaming the stack creates a new, empty volume: the app comes up healthy showing a fund of zero while the history sits in the old volume. The plain `docker run -v fondi-db:/data` from the README uses a different volume than this stack; pick one.

## Local build with Compose

`docker-compose.yml` at the repo root builds the image locally instead of pulling it and publishes it on port 8080:

```bash
cp .env.example .env    # set ADMIN_PASSWORD
docker compose up -d --build
```

The container listens on all interfaces, so other devices on the same network can open `http://<machine-ip>:8080`.

## Upgrading

A restart doesn't fetch a new `:latest`. Pull first (`docker compose pull`, or "Re-pull image" in Portainer), then recreate the container.

The container runs as uid `10001`. A volume created by an image from before that change is still owned by root, and the container refuses to start with `attempt to write a readonly database`. Fix it once:

```bash
docker run --rm -v fondi_db:/data alpine chown -R 10001:10001 /data
```

## Backups and restore

The database is the only copy of the fund's history. Two kinds of snapshots land next to it in `/data` as `fondi.db.<timestamp>.bak` (last 5 kept):

- one right before every `.xlsx` import;
- one every `BACKUP_INTERVAL_H` hours (default 24, `0` disables it).

Both live on the same volume, so they cover corruption and bad writes, not losing the volume. For that, pull the export off the box on a schedule:

```bash
curl -sf http://<host>:8080/api/export -o "fondi-$(date +%F).xlsx"
```

That file is a full restore: Admin → Restaurar desde archivo replaces all three tables with its contents. To roll back to a `.bak` instead, stop the container, copy the snapshot over `fondi.db` inside the volume and start it again.

## Separate frontend and API

The default is one container. To host the frontend elsewhere without code changes:

```bash
VITE_API_BASE_URL=https://api.example.com docker compose build
SERVE_STATIC=0 ALLOWED_ORIGINS=https://app.example.com docker compose up -d
```

Then serve the built `dist/` from the reverse proxy or any static host. The security headers (CSP) are sent only by the backend, so the static host needs its own.

## Configuration

All variables are optional; the defaults run. `.env.example` has the same list.

| Variable | Default | What it does |
|---|---|---|
| `ADMIN_PASSWORD` | `admin` | Admin panel password. Set your own; the default exists so a missing variable never makes the app unusable. |
| `TRUST_PROXY` | off | Read `X-Forwarded-For` for the login rate limit. Only behind a reverse proxy. |
| `BACKUP_INTERVAL_H` | `24` | Hours between automatic DB snapshots. `0` disables them. |
| `LOG_LEVEL` | `INFO` | Backend log level. |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS origins. Only needed when the frontend runs on another origin (`npm run dev`, or a split deploy). The compose file sets it empty. |
| `SERVE_STATIC` | `1` | `0` stops the backend from serving the frontend. |
| `VITE_API_BASE_URL` | same origin | Build-time API URL for a separately hosted frontend. |
| `DB_PATH` | `/data/fondi.db` | SQLite file. Must be on the mounted volume, or the history dies with the container. |
| `STATIC_DIR` | `../static` | Where the built frontend lives inside the image. |
