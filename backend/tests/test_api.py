import importlib
import io
import os

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("ADMIN_PASSWORD", "s3cret")

    from app import db as db_module
    from app import main as main_module

    importlib.reload(db_module)
    importlib.reload(main_module)

    with TestClient(main_module.app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_admin_password_defaults_to_admin_when_unset(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)

    from app import db as db_module
    from app import main as main_module

    importlib.reload(db_module)
    importlib.reload(main_module)

    with TestClient(main_module.app) as c:
        r = c.post("/api/auth/verify", headers={"X-Admin-Key": "admin"})
        assert r.status_code == 200

        r = c.post("/api/auth/verify", headers={"X-Admin-Key": "not-admin"})
        assert r.status_code == 401


def test_get_all_empty(client):
    r = client.get("/api/all")
    assert r.status_code == 200
    assert r.json() == {"historial": [], "movimientos": [], "participantes_config": []}


def test_post_movimiento_requires_auth(client):
    payload = {
        "fecha": "2026-01-10T00:00", "persona": "Patico", "tipo": "aporte",
        "monto_usd": 100, "precio_cuota_dia": 1.0, "cuotas": 100, "monto_cop": 330000, "trm_dia": 3300,
    }
    r = client.post("/api/movimiento", json=payload)
    assert r.status_code == 401

    r = client.post("/api/movimiento", json=payload, headers={"X-Admin-Key": "wrong"})
    assert r.status_code == 401


def test_post_movimiento_then_get_all(client):
    payload = {
        "fecha": "2026-01-10T00:00", "persona": "Patico", "tipo": "aporte",
        "monto_usd": 100, "precio_cuota_dia": 1.0, "cuotas": 100, "monto_cop": 330000, "trm_dia": 3300,
    }
    r = client.post("/api/movimiento", json=payload, headers={"X-Admin-Key": "s3cret"})
    assert r.status_code == 201

    r = client.get("/api/all")
    assert len(r.json()["movimientos"]) == 1
    assert r.json()["movimientos"][0]["persona"] == "Patico"


def test_post_fondo(client):
    payload = {
        "fecha": "2026-01-10T00:00", "valor_total_usd": 400, "precio_cuota_usd": 1.0,
        "cuotas_en_circulacion": 400, "trm": 3300,
    }
    r = client.post("/api/fondo", json=payload, headers={"X-Admin-Key": "s3cret"})
    assert r.status_code == 201

    r = client.get("/api/all")
    assert len(r.json()["historial"]) == 1


def test_auth_verify(client):
    r = client.post("/api/auth/verify")
    assert r.status_code == 401

    r = client.post("/api/auth/verify", headers={"X-Admin-Key": "s3cret"})
    assert r.status_code == 200


def test_post_participante(client):
    payload = {"fecha": "2026-01-10T00:00", "nombre": "Patico", "accion": "agregar"}
    r = client.post("/api/participante", json=payload, headers={"X-Admin-Key": "s3cret"})
    assert r.status_code == 201

    r = client.get("/api/all")
    assert r.json()["participantes_config"] == [payload]


def test_export_xlsx(client):
    client.post("/api/movimiento", headers={"X-Admin-Key": "s3cret"}, json={
        "fecha": "2026-01-10T00:00", "persona": "Patico", "tipo": "aporte",
        "monto_usd": 100, "precio_cuota_dia": 1.0, "cuotas": 100, "monto_cop": 330000, "trm_dia": 3300,
    })

    r = client.get("/api/export")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    wb = load_workbook(io.BytesIO(r.content))
    assert wb.sheetnames == ["historial_fondo", "movimientos", "participantes_config"]
    rows = list(wb["movimientos"].iter_rows(values_only=True))
    assert rows[0] == ("fecha", "persona", "tipo", "monto", "precio_cuota_dia", "cuotas", "monto_cop", "trm_dia")
    assert rows[1][1] == "Patico"


def _xlsx_bytes(sheets):
    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


def test_import_requires_auth(client):
    content = _xlsx_bytes({"movimientos": [["fecha", "persona", "tipo", "monto", "precio_cuota_dia", "cuotas", "monto_cop", "trm_dia"]]})
    r = client.post("/api/import", files={"file": ("data.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert r.status_code == 401


def test_import_replaces_existing_data(client):
    client.post("/api/participante", headers={"X-Admin-Key": "s3cret"},
                json={"fecha": "2026-01-01T00:00", "nombre": "Viejo", "accion": "agregar"})

    content = _xlsx_bytes({
        "historial_fondo": [
            ["fecha", "valor_total", "precio_cuota", "cuotas_circ", "trm"],
            ["2026-01-10", 400, 1.0, 400, 3300],
        ],
        "movimientos": [
            ["fecha", "persona", "tipo", "monto", "precio_cuota_dia", "cuotas", "monto_cop", "trm_dia"],
            ["2026-01-10T00:00", "Patico", "aporte", 100, 1.0, 100, 330000, 3300],
        ],
        "participantes_config": [
            ["fecha", "nombre", "accion"],
            ["2026-01-10T00:00", "Patico", "agregar"],
        ],
    })

    r = client.post("/api/import", headers={"X-Admin-Key": "s3cret"},
                     files={"file": ("data.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert r.status_code == 200
    assert r.json()["counts"] == {"historial_fondo": 1, "movimientos": 1, "participantes_config": 1}

    data = client.get("/api/all").json()
    assert len(data["historial"]) == 1
    assert len(data["movimientos"]) == 1
    assert data["participantes_config"] == [{"fecha": "2026-01-10T00:00", "nombre": "Patico", "accion": "agregar"}]


def test_import_invalid_file(client):
    r = client.post("/api/import", headers={"X-Admin-Key": "s3cret"},
                     files={"file": ("data.xlsx", b"not an xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert r.status_code == 400
