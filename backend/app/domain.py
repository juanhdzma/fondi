from dataclasses import dataclass


@dataclass(frozen=True)
class MovimientoCalculado:
    precio_antes: float
    cuotas: float
    cuotas_nuevas: float
    precio_despues: float


def calcular_movimiento(tipo: str, monto: float, valor_fondo: float, cuotas_actuales: float) -> MovimientoCalculado:
    valor_antes = valor_fondo + monto if tipo == "retiro" else valor_fondo - monto
    if valor_antes < 0:
        raise ValueError("El valor del fondo después no puede ser menor que el aporte")

    precio_antes = valor_antes / cuotas_actuales if cuotas_actuales > 0 else 1
    if precio_antes <= 0:
        raise ValueError("No se puede calcular una cuota con valor cero")

    cuotas = monto / precio_antes
    if tipo == "retiro":
        cuotas = -cuotas
    cuotas_nuevas = cuotas_actuales + cuotas
    precio_despues = valor_fondo / cuotas_nuevas if cuotas_nuevas > 0 else 1
    return MovimientoCalculado(precio_antes, cuotas, cuotas_nuevas, precio_despues)
