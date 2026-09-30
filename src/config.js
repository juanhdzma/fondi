// En dev (`npm run dev`) el backend corre aparte en :8000; en el build de producción
// ambos quedan en el mismo container/origen, así que las requests van relativas.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');

export const PARTICIPANT_COLORS = ['#7FA7D6', '#8FCAA6', '#EAB676', '#C79BD0', '#EC8F86', '#A9BB7B', '#9ECFD4'];

// ── Mock data — cambiar a false cuando el backend esté listo ─
export const MOCK_MODE = false;

// 30 valuaciones semanales (2 mar – 28 sep 2026, falta la del 13 jul para ver el hueco) generadas con el
// mismo modelo de cuotas del backend: cada movimiento se valora al precio de cuota de su semana.
export const MOCK_HISTORIAL = [
  { fecha: '2026-03-02', valor_total: 8000.0, precio_cuota: 1.0, cuotas_circ: 8000.0, trm: 3959.0 },
  { fecha: '2026-03-09', valor_total: 7993.72, precio_cuota: 0.999215, cuotas_circ: 8000.0, trm: 3972.35 },
  { fecha: '2026-03-16', valor_total: 7976.17, precio_cuota: 0.997021, cuotas_circ: 8000.0, trm: 3973.62 },
  { fecha: '2026-03-23', valor_total: 8000.75, precio_cuota: 1.000094, cuotas_circ: 8000.0, trm: 3924.71 },
  { fecha: '2026-03-30', valor_total: 9045.83, precio_cuota: 1.005728, cuotas_circ: 8994.3042, trm: 3873.65 },
  { fecha: '2026-04-06', valor_total: 9084.78, precio_cuota: 1.010059, cuotas_circ: 8994.3042, trm: 3825.98 },
  { fecha: '2026-04-13', valor_total: 9067.81, precio_cuota: 1.008173, cuotas_circ: 8994.3042, trm: 3815.55 },
  { fecha: '2026-04-20', valor_total: 10671.03, precio_cuota: 1.019649, cuotas_circ: 10465.3984, trm: 3773.55 },
  { fecha: '2026-04-27', valor_total: 10425.8, precio_cuota: 0.996216, cuotas_circ: 10465.3984, trm: 3784.43 },
  { fecha: '2026-05-04', valor_total: 10322.15, precio_cuota: 0.986312, cuotas_circ: 10465.3984, trm: 3790.03 },
  { fecha: '2026-05-11', valor_total: 10117.16, precio_cuota: 0.966724, cuotas_circ: 10465.3984, trm: 3837.54 },
  { fecha: '2026-05-18', valor_total: 12090.23, precio_cuota: 0.964151, cuotas_circ: 12539.7614, trm: 3872.68 },
  { fecha: '2026-05-25', valor_total: 12110.94, precio_cuota: 0.965803, cuotas_circ: 12539.7614, trm: 3832.82 },
  { fecha: '2026-06-01', valor_total: 12094.23, precio_cuota: 0.96447, cuotas_circ: 12539.7614, trm: 3810.21 },
  { fecha: '2026-06-08', valor_total: 12229.57, precio_cuota: 0.975263, cuotas_circ: 12539.7614, trm: 3774.19 },
  { fecha: '2026-06-15', valor_total: 13114.79, precio_cuota: 0.98206, cuotas_circ: 13354.376, trm: 3786.28 },
  { fecha: '2026-06-22', valor_total: 13156.8, precio_cuota: 0.985205, cuotas_circ: 13354.376, trm: 3788.79 },
  { fecha: '2026-06-29', valor_total: 13125.62, precio_cuota: 0.98287, cuotas_circ: 13354.376, trm: 3740.05 },
  { fecha: '2026-07-06', valor_total: 13128.34, precio_cuota: 0.983074, cuotas_circ: 13354.376, trm: 3756.49 },
  { fecha: '2026-07-20', valor_total: 13045.54, precio_cuota: 0.976874, cuotas_circ: 13354.376, trm: 3727.06 },
  { fecha: '2026-07-27', valor_total: 11641.97, precio_cuota: 0.96163, cuotas_circ: 12106.4954, trm: 3755.47 },
  { fecha: '2026-08-03', valor_total: 11747.71, precio_cuota: 0.970364, cuotas_circ: 12106.4954, trm: 3726.1 },
  { fecha: '2026-08-10', valor_total: 11828.06, precio_cuota: 0.977001, cuotas_circ: 12106.4954, trm: 3726.24 },
  { fecha: '2026-08-17', valor_total: 11972.98, precio_cuota: 0.988972, cuotas_circ: 12106.4954, trm: 3747.84 },
  { fecha: '2026-08-24', valor_total: 13693.13, precio_cuota: 0.990636, cuotas_circ: 13822.5649, trm: 3795.75 },
  { fecha: '2026-08-31', valor_total: 13674.3, precio_cuota: 0.989274, cuotas_circ: 13822.5649, trm: 3784.66 },
  { fecha: '2026-09-07', valor_total: 13812.8, precio_cuota: 0.999294, cuotas_circ: 13822.5649, trm: 3745.62 },
  { fecha: '2026-09-14', valor_total: 13886.03, precio_cuota: 1.004591, cuotas_circ: 13822.5649, trm: 3700 },
  { fecha: '2026-09-21', valor_total: 15004.45, precio_cuota: 1.013158, cuotas_circ: 14809.5774, trm: 3725.28 },
  { fecha: '2026-09-28', valor_total: 15106.7, precio_cuota: 1.020063, cuotas_circ: 14809.5774, trm: 3762.21 },
];

export const MOCK_MOVIMIENTOS = [
  { fecha: '2026-03-02', persona: 'Ana', tipo: 'aporte', monto: 3000, precio_cuota_dia: 1.0, cuotas: 3000.0, monto_cop: 11877007, trm_dia: 3959.0 },
  { fecha: '2026-03-02', persona: 'Luis', tipo: 'aporte', monto: 2500, precio_cuota_dia: 1.0, cuotas: 2500.0, monto_cop: 9897506, trm_dia: 3959.0 },
  { fecha: '2026-03-02', persona: 'Carlos', tipo: 'aporte', monto: 1500, precio_cuota_dia: 1.0, cuotas: 1500.0, monto_cop: 5938504, trm_dia: 3959.0 },
  { fecha: '2026-03-02', persona: 'Sofía', tipo: 'aporte', monto: 1000, precio_cuota_dia: 1.0, cuotas: 1000.0, monto_cop: 3959002, trm_dia: 3959.0 },
  { fecha: '2026-03-30', persona: 'Ana', tipo: 'aporte', monto: 1000, precio_cuota_dia: 1.005728, cuotas: 994.3042, monto_cop: 3873645, trm_dia: 3873.65 },
  { fecha: '2026-04-20', persona: 'Luis', tipo: 'aporte', monto: 1500, precio_cuota_dia: 1.019649, cuotas: 1471.0942, monto_cop: 5660330, trm_dia: 3773.55 },
  { fecha: '2026-05-18', persona: 'Mateo', tipo: 'aporte', monto: 2000, precio_cuota_dia: 0.964151, cuotas: 2074.363, monto_cop: 7745352, trm_dia: 3872.68 },
  { fecha: '2026-06-15', persona: 'Carlos', tipo: 'aporte', monto: 800, precio_cuota_dia: 0.98206, cuotas: 814.6146, monto_cop: 3029020, trm_dia: 3786.28 },
  { fecha: '2026-07-27', persona: 'Ana', tipo: 'retiro', monto: 1200, precio_cuota_dia: 0.96163, cuotas: -1247.8806, monto_cop: 0, trm_dia: 3755.47 },
  { fecha: '2026-08-24', persona: 'Sofía', tipo: 'aporte', monto: 1200, precio_cuota_dia: 0.990636, cuotas: 1211.3432, monto_cop: 4554905, trm_dia: 3795.75 },
  { fecha: '2026-08-24', persona: 'Mateo', tipo: 'aporte', monto: 500, precio_cuota_dia: 0.990636, cuotas: 504.7263, monto_cop: 1897877, trm_dia: 3795.75 },
  { fecha: '2026-09-21', persona: 'Luis', tipo: 'aporte', monto: 1000, precio_cuota_dia: 1.013158, cuotas: 987.0125, monto_cop: 3725280, trm_dia: 3725.28 },
];

export const MOCK_PARTICIPANTES_LOG = [
  { fecha: '2026-03-02', nombre: 'Ana', accion: 'agregar' },
  { fecha: '2026-03-02', nombre: 'Luis', accion: 'agregar' },
  { fecha: '2026-03-02', nombre: 'Carlos', accion: 'agregar' },
  { fecha: '2026-03-02', nombre: 'Sofía', accion: 'agregar' },
  { fecha: '2026-05-18', nombre: 'Mateo', accion: 'agregar' },
];
