import { beforeEach, describe, expect, it } from 'vitest';
import { S } from './state.js';
import {
  latest, precioCuota, cuotasCirc, calcParticipante,
  participantesActivos, participantesTodos,
  historialParticipante, historialGananciaFondo,
} from './computed.js';

const mov = (persona, tipo, monto, cuotas, fecha, extra = {}) =>
  ({ persona, tipo, monto, cuotas, fecha, precio_cuota_dia: monto / Math.abs(cuotas), ...extra });

beforeEach(() => {
  S.trm = 4000;
  S.historial = [];
  S.movimientos = [];
  S.participantesLog = [];
});

describe('latest / precioCuota / cuotasCirc', () => {
  it('sin historial: precio de cuota inicial de $1', () => {
    expect(latest()).toBe(null);
    expect(precioCuota()).toBe(1);
  });

  it('toma la última valuación del historial', () => {
    S.historial = [
      { fecha: '2026-01-01', valor_total: 1000, precio_cuota: 1, cuotas_circ: 1000, trm: 4000 },
      { fecha: '2026-02-01', valor_total: 1200, precio_cuota: 1.2, cuotas_circ: 1000, trm: 4000 },
    ];
    expect(latest().fecha).toBe('2026-02-01');
    expect(precioCuota()).toBe(1.2);
  });

  it('una valuación en 0 no se disfraza de cuota a $1', () => {
    // Solo llega por import; devolver 1 acá inventaba valor para cuotas que no lo tienen.
    S.historial = [{ fecha: '2026-01-01', valor_total: 0, precio_cuota: 0, cuotas_circ: 1000, trm: 4000 }];
    expect(precioCuota()).toBe(0);
  });

  it('las cuotas en circulación son la suma de los movimientos, retiros incluidos', () => {
    S.movimientos = [
      mov('Ana', 'aporte', 1000, 1000, '2026-01-01'),
      mov('Luis', 'aporte', 500, 500, '2026-01-02'),
      mov('Ana', 'retiro', 200, -200, '2026-01-03'),
    ];
    expect(cuotasCirc()).toBe(1300);
  });
});

describe('participantesActivos', () => {
  it('la última acción por nombre gana', () => {
    S.participantesLog = [
      { fecha: '2026-01-01', nombre: 'Ana', accion: 'agregar' },
      { fecha: '2026-02-01', nombre: 'Luis', accion: 'agregar' },
      { fecha: '2026-03-01', nombre: 'Luis', accion: 'quitar' },
    ];
    expect(participantesActivos()).toEqual(['Ana']);
  });

  it('ordena por fecha y no por el orden de las filas', () => {
    // Después de un import el orden es el del xlsx: un "quitar" viejo debajo de un "agregar"
    // nuevo sacaba de la lista a alguien que sí está activo.
    S.participantesLog = [
      { fecha: '2026-06-01', nombre: 'Ana', accion: 'agregar' },
      { fecha: '2026-03-01', nombre: 'Ana', accion: 'quitar' },
      { fecha: '2026-01-01', nombre: 'Ana', accion: 'agregar' },
    ];
    expect(participantesActivos()).toEqual(['Ana']);
  });

  it('reingreso después de un quitar', () => {
    S.participantesLog = [
      { fecha: '2026-01-01', nombre: 'Ana', accion: 'agregar' },
      { fecha: '2026-02-01', nombre: 'Ana', accion: 'quitar' },
      { fecha: '2026-03-01', nombre: 'Ana', accion: 'agregar' },
    ];
    expect(participantesActivos()).toEqual(['Ana']);
  });
});

describe('participantesTodos', () => {
  it('incluye a quien fue quitado pero tiene movimientos', () => {
    S.participantesLog = [
      { fecha: '2026-01-01', nombre: 'Ana', accion: 'agregar' },
      { fecha: '2026-01-01', nombre: 'Luis', accion: 'agregar' },
      { fecha: '2026-02-01', nombre: 'Luis', accion: 'quitar' },
    ];
    S.movimientos = [mov('Luis', 'aporte', 500, 500, '2026-01-05')];

    expect(participantesActivos()).toEqual(['Ana']);
    expect(participantesTodos()).toEqual(['Ana', 'Luis']);
  });

  it('no repite a alguien activo que además tiene movimientos', () => {
    S.participantesLog = [{ fecha: '2026-01-01', nombre: 'Ana', accion: 'agregar' }];
    S.movimientos = [
      mov('Ana', 'aporte', 500, 500, '2026-01-05'),
      mov('Ana', 'aporte', 300, 300, '2026-01-06'),
    ];
    expect(participantesTodos()).toEqual(['Ana']);
  });
});

describe('calcParticipante', () => {
  it('sin movimientos devuelve ceros, no NaN', () => {
    S.historial = [{ fecha: '2026-01-01', valor_total: 1000, precio_cuota: 1, cuotas_circ: 1000, trm: 4000 }];
    const p = calcParticipante('Fantasma');

    expect(p.cuotas).toBe(0);
    expect(p.valor_actual).toBe(0);
    expect(p.ganancia_monto).toBe(0);
    expect(p.ganancia_pct).toBe(0);
    expect(p.has_cop).toBe(false);
    for (const v of Object.values(p)) expect(Number.isNaN(v)).toBe(false);
  });

  it('valor actual y ganancia con el fondo arriba', () => {
    S.historial = [{ fecha: '2026-02-01', valor_total: 1200, precio_cuota: 1.2, cuotas_circ: 1000, trm: 4000 }];
    S.movimientos = [mov('Ana', 'aporte', 1000, 1000, '2026-01-01', { monto_cop: 4000000, trm_dia: 4000 })];

    const p = calcParticipante('Ana');
    expect(p.cuotas).toBe(1000);
    expect(p.valor_actual).toBeCloseTo(1200, 10);
    expect(p.precio_prom).toBeCloseTo(1, 10);
    expect(p.ganancia_monto).toBeCloseTo(200, 10);
    expect(p.ganancia_pct).toBeCloseTo(20, 10);
  });

  it('un retiro no cuenta como pérdida: la ganancia suma lo ya retirado', () => {
    // Aporta 1000, el fondo sube 20%, retira 600. Le quedan cuotas por 600 y ya sacó 600:
    // no ganó ni perdió nada por retirar, la ganancia sigue siendo la del fondo.
    S.historial = [{ fecha: '2026-02-01', valor_total: 600, precio_cuota: 1.2, cuotas_circ: 500, trm: 4000 }];
    S.movimientos = [
      mov('Ana', 'aporte', 1000, 1000, '2026-01-01'),
      mov('Ana', 'retiro', 600, -500, '2026-02-01'),
    ];

    const p = calcParticipante('Ana');
    expect(p.cuotas).toBeCloseTo(500, 10);
    expect(p.valor_actual).toBeCloseTo(600, 10);
    expect(p.neto_invertido).toBeCloseTo(400, 10);
    expect(p.ganancia_monto).toBeCloseTo(200, 10);
  });

  it('el precio promedio de entrada ignora los retiros', () => {
    S.historial = [{ fecha: '2026-03-01', valor_total: 2000, precio_cuota: 2, cuotas_circ: 1000, trm: 4000 }];
    S.movimientos = [
      mov('Ana', 'aporte', 1000, 1000, '2026-01-01'),   // a $1
      mov('Ana', 'aporte', 1000, 500, '2026-02-01'),    // a $2
      mov('Ana', 'retiro', 1000, -500, '2026-03-01'),
    ];

    const p = calcParticipante('Ana');
    // 2000 USD aportados por 1500 cuotas compradas, sin que el retiro mueva el promedio.
    expect(p.precio_prom).toBeCloseTo(2000 / 1500, 10);
  });

  it('desglosa la ganancia en COP entre fondo y TRM', () => {
    S.trm = 5000;
    S.historial = [{ fecha: '2026-02-01', valor_total: 1200, precio_cuota: 1.2, cuotas_circ: 1000, trm: 5000 }];
    S.movimientos = [mov('Ana', 'aporte', 1000, 1000, '2026-01-01', { monto_cop: 4000000, trm_dia: 4000 })];

    const p = calcParticipante('Ana');
    expect(p.has_cop).toBe(true);
    expect(p.valor_cop).toBeCloseTo(6000000, 6);
    expect(p.trm_avg_entrada).toBeCloseTo(4000, 10);
    expect(p.ganancia_cop).toBeCloseTo(2000000, 6);
    // 200 USD de ganancia del fondo a TRM de hoy, el resto es lo que aportó la subida del dólar.
    expect(p.ganancia_fondo_cop).toBeCloseTo(1000000, 6);
    expect(p.ganancia_trm_cop).toBeCloseTo(1000000, 6);
    expect(p.ganancia_fondo_cop + p.ganancia_trm_cop).toBeCloseTo(p.ganancia_cop, 6);
  });
});

describe('historialParticipante', () => {
  it('usa las cuotas acumuladas a cada fecha, no las de hoy', () => {
    S.historial = [
      { fecha: '2026-01-01', valor_total: 1000, precio_cuota: 1, cuotas_circ: 1000, trm: 4000 },
      { fecha: '2026-02-01', valor_total: 2200, precio_cuota: 1.1, cuotas_circ: 2000, trm: 4000 },
    ];
    S.movimientos = [
      mov('Ana', 'aporte', 1000, 1000, '2026-01-01'),
      mov('Ana', 'aporte', 1100, 1000, '2026-02-01'),
    ];

    const h = historialParticipante('Ana');
    expect(h[0]).toEqual({ fecha: '2026-01-01', valor: 1000, invertido: 1000 });
    expect(h[1].valor).toBeCloseTo(2200, 10);
    expect(h[1].invertido).toBeCloseTo(2100, 10);
  });

  it('un movimiento posterior a la valuación no cuenta en ese punto', () => {
    S.historial = [{ fecha: '2026-01-01', valor_total: 1000, precio_cuota: 1, cuotas_circ: 1000, trm: 4000 }];
    S.movimientos = [mov('Ana', 'aporte', 500, 500, '2026-06-01')];

    expect(historialParticipante('Ana')[0]).toEqual({ fecha: '2026-01-01', valor: 0, invertido: 0 });
  });
});

describe('historialGananciaFondo', () => {
  it('descuenta los aportes netos acumulados a cada fecha', () => {
    S.historial = [
      { fecha: '2026-01-01', valor_total: 1000, precio_cuota: 1, cuotas_circ: 1000, trm: 4000 },
      { fecha: '2026-02-01', valor_total: 1200, precio_cuota: 1.2, cuotas_circ: 1000, trm: 4000 },
      { fecha: '2026-03-01', valor_total: 1900, precio_cuota: 1.27, cuotas_circ: 1500, trm: 4000 },
    ];
    S.movimientos = [
      mov('Ana', 'aporte', 1000, 1000, '2026-01-01'),
      mov('Luis', 'aporte', 600, 500, '2026-03-01'),
    ];

    const g = historialGananciaFondo();
    expect(g[0].ganancia).toBeCloseTo(0, 10);
    expect(g[1].ganancia).toBeCloseTo(200, 10);
    expect(g[2].ganancia).toBeCloseTo(300, 10);
  });

  it('un retiro no se lee como pérdida', () => {
    S.historial = [
      { fecha: '2026-01-01', valor_total: 1000, precio_cuota: 1, cuotas_circ: 1000, trm: 4000 },
      { fecha: '2026-02-01', valor_total: 400, precio_cuota: 1, cuotas_circ: 400, trm: 4000 },
    ];
    S.movimientos = [
      mov('Ana', 'aporte', 1000, 1000, '2026-01-01'),
      mov('Ana', 'retiro', 600, -600, '2026-02-01'),
    ];

    expect(historialGananciaFondo()[1].ganancia).toBeCloseTo(0, 10);
  });
});
