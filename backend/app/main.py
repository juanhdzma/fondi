import os
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .db import get_conn, init_db, replace_all
from .xlsx import InvalidWorkbook, build_workbook, parse_workbook

# Default "admin" a propósito: uso familiar sin auth real de por sí (ver README), la
# prioridad es que la app no quede inutilizable si a alguien se le olvida setear la env var.
# Cambiala en el deploy real (ADMIN_PASSWORD en Portainer/.env).
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")
STATIC_DIR = os.environ.get("STATIC_DIR", os.path.join(os.path.dirname(__file__), "..", "static"))
# En producción front y back quedan en el mismo origen (mismo container/puerto) y esto no
# se usa; en `npm run dev` el frontend corre en :8080 y este backend en :8000 — orígenes
# distintos, así que el browser exige CORS (incluye preflight OPTIONS por el header
# X-Admin-Key). Sin esto, cualquier POST del panel admin falla en dev.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",")]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="fondi-backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_admin(x_admin_key: str = Header(default="")):
    if not ADMIN_PASSWORD or not secrets.compare_digest(x_admin_key, ADMIN_PASSWORD):
        raise HTTPException(status_code=401, detail="Clave incorrecta")


class Movimiento(BaseModel):
    fecha: str
    persona: str
    tipo: str
    monto_usd: float
    precio_cuota_dia: float
    cuotas: float
    monto_cop: float
    trm_dia: float


class Fondo(BaseModel):
    fecha: str
    valor_total_usd: float
    precio_cuota_usd: float
    cuotas_en_circulacion: float
    trm: float


class Participante(BaseModel):
    fecha: str
    nombre: str
    accion: str


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/auth/verify", dependencies=[Depends(require_admin)])
def verify_auth():
    return {"ok": True}


@app.get("/api/all")
def get_all():
    with get_conn() as conn:
        historial = conn.execute(
            "SELECT fecha, valor_total, precio_cuota, cuotas_circ, trm FROM historial_fondo"
        ).fetchall()
        movimientos = conn.execute(
            "SELECT fecha, persona, tipo, monto, precio_cuota_dia, cuotas, monto_cop, trm_dia FROM movimientos"
        ).fetchall()
        participantes = conn.execute(
            "SELECT fecha, nombre, accion FROM participantes_config"
        ).fetchall()

    return {
        "historial": [dict(r) for r in historial],
        "movimientos": [dict(r) for r in movimientos],
        "participantes_config": [dict(r) for r in participantes],
    }


@app.post("/api/movimiento", status_code=201, dependencies=[Depends(require_admin)])
def post_movimiento(m: Movimiento):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO movimientos (fecha, persona, tipo, monto, precio_cuota_dia, cuotas, monto_cop, trm_dia) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (m.fecha, m.persona, m.tipo, m.monto_usd, m.precio_cuota_dia, m.cuotas, m.monto_cop, m.trm_dia),
        )
    return {"ok": True}


@app.post("/api/fondo", status_code=201, dependencies=[Depends(require_admin)])
def post_fondo(f: Fondo):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO historial_fondo (fecha, valor_total, precio_cuota, cuotas_circ, trm) "
            "VALUES (?, ?, ?, ?, ?)",
            (f.fecha, f.valor_total_usd, f.precio_cuota_usd, f.cuotas_en_circulacion, f.trm),
        )
    return {"ok": True}


@app.post("/api/participante", status_code=201, dependencies=[Depends(require_admin)])
def post_participante(p: Participante):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO participantes_config (fecha, nombre, accion) VALUES (?, ?, ?)",
            (p.fecha, p.nombre, p.accion),
        )
    return {"ok": True}


@app.get("/api/export")
def export_xlsx():
    data = get_all()
    buf = build_workbook(data["historial"], data["movimientos"], data["participantes_config"])
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=fondi-export.xlsx"},
    )


@app.post("/api/import", dependencies=[Depends(require_admin)])
async def import_xlsx(file: UploadFile = File(...)):
    content = await file.read()
    try:
        parsed = parse_workbook(content)
    except InvalidWorkbook as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    replace_all(parsed["historial_fondo"], parsed["movimientos"], parsed["participantes_config"])
    return {"ok": True, "counts": {k: len(v) for k, v in parsed.items()}}


# Sirve el build de Vite (dist/) — montado al final para que las rutas /api/* de arriba
# tengan prioridad de match sobre el catch-all de archivos estáticos. Si el directorio no
# existe (dev del backend sin build, o tests) simplemente no se monta, en vez de que
# StaticFiles tire 500 en cada request que no matchea una ruta de arriba.
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
