import pytest

from app.domain import calcular_movimiento


def test_aporte_usa_el_valor_previo_del_fondo():
    resultado = calcular_movimiento("aporte", 600, 1800, 1000)

    assert resultado.precio_antes == 1.2
    assert resultado.cuotas == 500
    assert resultado.precio_despues == 1.2


def test_retiro_total_deja_la_cuota_base():
    resultado = calcular_movimiento("retiro", 1000, 0, 1000)

    assert resultado.cuotas == -1000
    assert resultado.cuotas_nuevas == 0
    assert resultado.precio_despues == 1


def test_aporte_no_acepta_un_fondo_final_negativo():
    with pytest.raises(ValueError, match="no puede ser menor"):
        calcular_movimiento("aporte", 100, 50, 100)
