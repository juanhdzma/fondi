import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.environ.get("DB_PATH", "/data/fondi.db")

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


def replace_all(historial, movimientos, participantes_config):
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
