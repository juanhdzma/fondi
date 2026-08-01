import { describe, expect, it } from 'vitest';
import { calcularCuotas, excedeSaldo } from './cuotas.js';

describe('calcularCuotas', () => {
  it('primer aporte: cuota inicial de $1', () => {
    const r = calcularCuotas({ tipo: 'aporte', monto: 1000, valorFondo: 1000, cuotasActuales: 0 });
    expect(r.precioAntes).toBe(1);
    expect(r.cuotas).toBe(1000);
    expect(r.cuotasNuevas).toBe(1000);
    expect(r.precioDespues).toBe(1);
  });

  it('aporte sin ganancia previa: no mueve el precio de cuota', () => {
    const r = calcularCuotas({ tipo: 'aporte', monto: 500, valorFondo: 1500, cuotasActuales: 1000 });
    expect(r.precioAntes).toBe(1);
    expect(r.cuotas).toBe(500);
    expect(r.precioDespues).toBe(1);
  });

  it('no diluye: el que ya estaba conserva su valor cuando el fondo subió antes del aporte', () => {
    // 1000 cuotas valían $1200 (subió 20%) y entra alguien con $600.
    const r = calcularCuotas({ tipo: 'aporte', monto: 600, valorFondo: 1800, cuotasActuales: 1000 });

    expect(r.precioAntes).toBeCloseTo(1.2, 10);
    expect(r.cuotas).toBeCloseTo(500, 10);
    expect(r.precioDespues).toBeCloseTo(1.2, 10);
    // El viejo mantiene sus $1200 y el nuevo tiene exactamente lo que puso.
    expect(1000 * r.precioDespues).toBeCloseTo(1200, 10);
    expect(r.cuotas * r.precioDespues).toBeCloseTo(600, 10);
  });

  it('no regala ganancia usando el precio del último checkpoint (regresión de dilución)', () => {
    // Checkpoint viejo: precio 1.0. Real al momento del aporte: 1.2.
    const r = calcularCuotas({ tipo: 'aporte', monto: 600, valorFondo: 1800, cuotasActuales: 1000 });
    const cuotasSiUsaraCheckpointViejo = 600 / 1.0;

    expect(r.cuotas).toBeLessThan(cuotasSiUsaraCheckpointViejo);
  });

  it('retiro: resta cuotas y deja el precio igual', () => {
    const r = calcularCuotas({ tipo: 'retiro', monto: 600, valorFondo: 1200, cuotasActuales: 1500 });

    expect(r.precioAntes).toBeCloseTo(1.2, 10);
    expect(r.cuotas).toBeCloseTo(-500, 10);
    expect(r.cuotasNuevas).toBeCloseTo(1000, 10);
    expect(r.precioDespues).toBeCloseTo(1.2, 10);
  });

  it('retiro con monto negativo se normaliza al mismo resultado', () => {
    const positivo = calcularCuotas({ tipo: 'retiro', monto: 600, valorFondo: 1200, cuotasActuales: 1500 });
    const negativo = calcularCuotas({ tipo: 'retiro', monto: -600, valorFondo: 1200, cuotasActuales: 1500 });

    expect(negativo.cuotas).toBeCloseTo(positivo.cuotas, 10);
  });

  it('retiro total: sin cuotas restantes cae al precio base', () => {
    const r = calcularCuotas({ tipo: 'retiro', monto: 1000, valorFondo: 0, cuotasActuales: 1000 });

    expect(r.cuotasNuevas).toBeCloseTo(0, 10);
    expect(r.precioDespues).toBe(1);
  });
});

describe('excedeSaldo', () => {
  it('un aporte nunca excede', () => {
    expect(excedeSaldo({ cuotas: 500, cuotasDisponibles: 0 })).toBe(false);
  });

  it('retiro dentro del saldo pasa', () => {
    expect(excedeSaldo({ cuotas: -300, cuotasDisponibles: 500 })).toBe(false);
  });

  it('retiro por más de lo que tiene la persona no pasa', () => {
    // El caso real: retirar 6000 en vez de 600 dejaría cuotas negativas sin forma de deshacerlo.
    expect(excedeSaldo({ cuotas: -5000, cuotasDisponibles: 500 })).toBe(true);
  });

  it('retiro total pasa aunque el redondeo deje un residuo mínimo', () => {
    const r = calcularCuotas({ tipo: 'retiro', monto: 1200, valorFondo: 0, cuotasActuales: 1000 });
    expect(excedeSaldo({ cuotas: r.cuotas, cuotasDisponibles: 1000 })).toBe(false);
  });
});
