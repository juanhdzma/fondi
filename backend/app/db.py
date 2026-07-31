import datetime as dt
import glob
import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.environ.get("DB_PATH", "/data/fondi.db")
BACKUPS_TO_KEEP = 5

SCHEMA = """
CREATE TABLE IF NOT EXISTS historial_fondo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    valor_total REAL NOT NULL,
    precio_cuota REAL NOT NULL,
    cuotas_circ REAL NOT NULL,
    trm REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    persona TEXT NOT NULL,
    tipo TEXT NOT NULL,
    monto REAL NOT NULL,
    precio_cuota_dia REAL NOT NULL,
    cuotas REAL NOT NULL,
    monto_cop REAL NOT NULL,
    trm_dia REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS participantes_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    nombre TEXT NOT NULL,
    accion TEXT NOT NULL
);
"""


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA)


# El import es destructivo y el modelo es append-only (no hay UPDATE/DELETE para deshacer
# a mano): sin esta copia, importar el archivo equivocado es pérdida total de la historia.
def backup_db():
    if not os.path.isfile(DB_PATH):
        return None

    stamp = dt.datetime.now().strftime("%Y%m%dT%H%M%S")
    destino = f"{DB_PATH}.{stamp}.bak"
    with get_conn() as conn:
        destino_conn = sqlite3.connect(destino)
        try:
            conn.backup(destino_conn)
        finally:
            destino_conn.close()

    for viejo in sorted(glob.glob(f"{DB_PATH}.*.bak"))[:-BACKUPS_TO_KEEP]:
        try:
            os.remove(viejo)
        except OSError:
            pass

    return destino


def replace_all(historial, movimientos, participantes_config):
    backup_db()
    with get_conn() as conn:
        conn.execute("DELETE FROM historial_fondo")
        conn.execute("DELETE FROM movimientos")
        conn.execute("DELETE FROM participantes_config")

        conn.executemany(
            "INSERT INTO historial_fondo (fecha, valor_total, precio_cuota, cuotas_circ, trm) "
            "VALUES (:fecha, :valor_total, :precio_cuota, :cuotas_circ, :trm)",
            historial,
        )
        conn.executemany(
            "INSERT INTO movimientos (fecha, persona, tipo, monto, precio_cuota_dia, cuotas, monto_cop, trm_dia) "
            "VALUES (:fecha, :persona, :tipo, :monto, :precio_cuota_dia, :cuotas, :monto_cop, :trm_dia)",
            movimientos,
        )
        conn.executemany(
            "INSERT INTO participantes_config (fecha, nombre, accion) VALUES (:fecha, :nombre, :accion)",
            participantes_config,
        )
