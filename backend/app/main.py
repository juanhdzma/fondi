import logging
import os
import secrets
from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .db import get_conn, init_db, replace_all
from .xlsx import InvalidWorkbook, build_workbook, parse_workbook

# uvicorn solo configura handlers para sus propios loggers: sin esto el logger raíz se queda
# en WARNING y los INFO de cada escritura no salen por ningún lado.
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("fondi")

FECHA_RE = r"^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$"

# Default "admin" a propósito: uso familiar sin auth real de por sí (ver README), la
# prioridad es que la app no quede inutilizable si a alguien se le olvida setear la env var.
# Cambiala en el deploy real (ADMIN_PASSWORD en Portainer/.env).
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")
STATIC_DIR = os.environ.get("STATIC_DIR", os.path.join(os.path.dirname(__file__), "..", "static"))
# En producción front y back quedan en el mismo origen (mismo container/puerto) y esto no
# se usa; en `npm run dev` el frontend corre en :8080 y este backend en :8000 — orígenes
# distintos, así que el browser exige CORS (incluye preflight OPTIONS por el header
# X-Admin-Key). Sin esto, cualquier POST del panel admin falla en dev.
# Vacío = ningún origen cruzado permitido (el caso de prod, mismo origen). Sin el filtro,
# ALLOWED_ORIGINS="" dejaba la lista en [""], que es lo mismo pero por accidente.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]


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


# compare_digest sobre str tira TypeError si hay caracteres no-ASCII (una clave con "ñ"
# daba 500 en vez de 401) — comparando bytes eso no pasa.
def require_admin(x_admin_key: str = Header(default="")):
    if not ADMIN_PASSWORD or not secrets.compare_digest(x_admin_key.encode(), ADMIN_PASSWORD.encode()):
        raise HTTPException(status_code=401, detail="Clave incorrecta")


class Fondo(BaseModel):
    fecha: str = Field(pattern=FECHA_RE)
    # ge=0 y no gt=0: un retiro total deja el fondo en 0 con 0 cuotas, y eso es válido.
    valor_total_usd: float = Field(ge=0)
    precio_cuota_usd: float = Field(gt=0)
    cuotas_en_circulacion: float = Field(ge=0)
    trm: float = Field(ge=0)


class Movimiento(BaseModel):
    fecha: str = Field(pattern=FECHA_RE)
    persona: str = Field(min_length=1)
    tipo: Literal["aporte", "retiro"]
    monto_usd: float = Field(gt=0)
    precio_cuota_dia: float = Field(gt=0)
    cuotas: float
    monto_cop: float = Field(ge=0)
    trm_dia: float = Field(ge=0)
    # Valuación del fondo que resulta de este movimiento. Va en el mismo request para que
    # ambas filas entren en una sola transacción: un movimiento sin su valuación cambia las
    # cuotas en circulación dejando el precio de cuota viejo, y todos los porcentajes de
    # todos los participantes quedan mal sin forma de deshacerlo (el log es append-only).
    fondo: Optional[Fondo] = None


class Participante(BaseModel):
    fecha: str = Field(pattern=FECHA_RE)
    nombre: str = Field(min_length=1)
    accion: Literal["agregar", "quitar"]


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


def _insert_fondo(conn, f: Fondo):
    conn.execute(
        "INSERT INTO historial_fondo (fecha, valor_total, precio_cuota, cuotas_circ, trm) "
        "VALUES (?, ?, ?, ?, ?)",
        (f.fecha, f.valor_total_usd, f.precio_cuota_usd, f.cuotas_en_circulacion, f.trm),
    )


# Un retiro por más cuotas de las que la persona tiene la deja en negativo, y como no hay
# UPDATE ni DELETE eso no se arregla desde la app: solo exportando el xlsx y reimportándolo.
# El front ya lo valida, pero es la regla que no puede depender del navegador.
TOLERANCIA_CUOTAS = 1e-6


@app.post("/api/movimiento", status_code=201, dependencies=[Depends(require_admin)])
def post_movimiento(m: Movimiento):
    with get_conn() as conn:
        if m.cuotas < 0:
            actuales = conn.execute(
                "SELECT COALESCE(SUM(cuotas), 0) AS total FROM movimientos WHERE persona = ?",
                (m.persona,),
            ).fetchone()["total"]
            if actuales + m.cuotas < -TOLERANCIA_CUOTAS:
                raise HTTPException(
                    status_code=400,
                    detail=f"{m.persona} tiene {actuales:.4f} cuotas y el retiro pide {-m.cuotas:.4f}",
                )

        conn.execute(
            "INSERT INTO movimientos (fecha, persona, tipo, monto, precio_cuota_dia, cuotas, monto_cop, trm_dia) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (m.fecha, m.persona, m.tipo, m.monto_usd, m.precio_cuota_dia, m.cuotas, m.monto_cop, m.trm_dia),
        )
        if m.fondo is not None:
            _insert_fondo(conn, m.fondo)

    log.info(
        "movimiento persona=%s tipo=%s monto_usd=%s cuotas=%.4f fecha=%s valuacion=%s",
        m.persona, m.tipo, m.monto_usd, m.cuotas, m.fecha,
        m.fondo.valor_total_usd if m.fondo else "sin",
    )
    return {"ok": True}


@app.post("/api/fondo", status_code=201, dependencies=[Depends(require_admin)])
def post_fondo(f: Fondo):
    with get_conn() as conn:
        _insert_fondo(conn, f)

    log.info(
        "valuacion valor_total=%s precio_cuota=%.6f cuotas_circ=%.4f fecha=%s",
        f.valor_total_usd, f.precio_cuota_usd, f.cuotas_en_circulacion, f.fecha,
    )
    return {"ok": True}


@app.post("/api/participante", status_code=201, dependencies=[Depends(require_admin)])
def post_participante(p: Participante):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO participantes_config (fecha, nombre, accion) VALUES (?, ?, ?)",
            (p.fecha, p.nombre, p.accion),
        )

    log.info("participante nombre=%s accion=%s fecha=%s", p.nombre, p.accion, p.fecha)
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

    counts = {k: len(v) for k, v in parsed.items()}
    log.warning("import destructivo aplicado archivo=%s counts=%s", file.filename, counts)
    return {"ok": True, "counts": counts}


# Sirve el build de Vite (dist/) — montado al final para que las rutas /api/* de arriba
# tengan prioridad de match sobre el catch-all de archivos estáticos. Si el directorio no
# existe (dev del backend sin build, o tests) simplemente no se monta, en vez de que
# StaticFiles tire 500 en cada request que no matchea una ruta de arriba.
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
