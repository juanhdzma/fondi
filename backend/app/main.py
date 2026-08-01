import asyncio
import logging
import os
import secrets
import time
from contextlib import asynccontextmanager, suppress
from typing import Literal, Optional

from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .db import backup_db, get_conn, init_db, replace_all
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

# El único destructivo es el import; el resto es append-only. Esta copia periódica cubre lo
# que el backup del import no: corrupción del archivo o un borrado accidental del volumen.
# Vive al lado de la DB, así que NO reemplaza sacar el xlsx a otra máquina (ver README).
BACKUP_INTERVAL_H = float(os.environ.get("BACKUP_INTERVAL_H", "24"))
MAX_IMPORT_BYTES = 5 * 1024 * 1024
# La clave es única y sin sesión: cada request la reintenta. Sin freno, probar claves contra
# /api/auth/verify es gratis e ilimitado.
AUTH_MAX_FAILS = 10
AUTH_WINDOW_S = 300

CSP = (
    "default-src 'self'; "
    "connect-src 'self' https://www.datos.gov.co; "
    "img-src 'self' data:; "
    "style-src 'self' 'unsafe-inline'; "
    "script-src 'self'; "
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)


async def _backup_periodico():
    while True:
        await asyncio.sleep(BACKUP_INTERVAL_H * 3600)
        try:
            destino = await asyncio.to_thread(backup_db)
            log.info("backup automático %s", destino)
        except Exception:
            log.exception("backup automático falló")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    tarea = asyncio.create_task(_backup_periodico()) if BACKUP_INTERVAL_H > 0 else None
    yield
    if tarea:
        tarea.cancel()
        with suppress(asyncio.CancelledError):
            await tarea


app = FastAPI(title="fondi-backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# La CSP se manda como header y no como <meta> en el index.html a propósito: el mismo HTML
# lo sirve Vite en dev contra el backend en otro puerto, y una CSP con 'self' ahí rompería
# el HMR y las llamadas a :8000. Acá solo aplica cuando este proceso sirve el build.
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = CSP
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    return response


_auth_fails: dict[str, tuple[int, float]] = {}


# compare_digest sobre str tira TypeError si hay caracteres no-ASCII (una clave con "ñ"
# daba 500 en vez de 401) — comparando bytes eso no pasa.
def require_admin(request: Request, x_admin_key: str = Header(default="")):
    ip = request.client.host if request.client else "desconocida"
    ahora = time.monotonic()

    intentos, desde = _auth_fails.get(ip, (0, ahora))
    if ahora - desde > AUTH_WINDOW_S:
        intentos, desde = 0, ahora
    if intentos >= AUTH_MAX_FAILS:
        raise HTTPException(status_code=429, detail="Demasiados intentos fallidos, esperá unos minutos")

    if not ADMIN_PASSWORD or not secrets.compare_digest(x_admin_key.encode(), ADMIN_PASSWORD.encode()):
        for vieja in [k for k, (_, ts) in _auth_fails.items() if ahora - ts > AUTH_WINDOW_S]:
            del _auth_fails[vieja]
        _auth_fails[ip] = (intentos + 1, desde)
        log.warning("auth fallida ip=%s intentos=%d", ip, intentos + 1)
        raise HTTPException(status_code=401, detail="Clave incorrecta")

    _auth_fails.pop(ip, None)


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


# ORDER BY explícito: sin él el orden es el de inserción, que después de un import es el
# orden de filas del xlsx. El front resuelve "última acción gana" por participante y
# "última valuación" con ese orden, así que unas filas desordenadas cambian el resultado.
@app.get("/api/all")
def get_all():
    with get_conn() as conn:
        historial = conn.execute(
            "SELECT fecha, valor_total, precio_cuota, cuotas_circ, trm FROM historial_fondo "
            "ORDER BY fecha, id"
        ).fetchall()
        movimientos = conn.execute(
            "SELECT fecha, persona, tipo, monto, precio_cuota_dia, cuotas, monto_cop, trm_dia "
            "FROM movimientos ORDER BY fecha, id"
        ).fetchall()
        participantes = conn.execute(
            "SELECT fecha, nombre, accion FROM participantes_config ORDER BY fecha, id"
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
    # Se lee por partes con tope: un xlsx real de esta app pesa kilobytes, y sin límite un
    # upload grande se traga la memoria/disco del container antes de que openpyxl lo mire.
    partes, total = [], 0
    while chunk := await file.read(1 << 20):
        total += len(chunk)
        if total > MAX_IMPORT_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"El archivo supera el máximo de {MAX_IMPORT_BYTES // (1024 * 1024)} MB",
            )
        partes.append(chunk)
    content = b"".join(partes)

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
