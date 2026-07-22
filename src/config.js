// En dev (`npm run dev`) el backend corre aparte en :8000; en el build de producción
// ambos quedan en el mismo container/origen, así que las requests van relativas.
export const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:8000' : '';

// ── Rampa tonal (un solo acento, distintas intensidades) — avatares y barra de participación ──
export const PARTICIPANT_COLORS = ['#0C243B', '#1B3A5C', '#2F5478', '#4A6E93', '#7C93AF'];

// ── Mock data — cambiar a false cuando el backend esté listo ─
export const MOCK_MODE = false;

export const MOCK_HISTORIAL = [
  { fecha: '2026-01-10', valor_total: 400,    precio_cuota: 1.0,   cuotas_circ: 400,       trm: 3300 },
  { fecha: '2026-01-31', valor_total: 402,    precio_cuota: 1.005, cuotas_circ: 400,       trm: 3315 },
  { fecha: '2026-02-20', valor_total: 457.82, precio_cuota: 1.02,  cuotas_circ: 449.019608, trm: 3350 },
  { fecha: '2026-02-28', valor_total: 454.61, precio_cuota: 1.012, cuotas_circ: 449.019608, trm: 3360 },
  { fecha: '2026-03-31', valor_total: 471.47, precio_cuota: 1.05,  cuotas_circ: 449.019608, trm: 3400 },
  { fecha: '2026-04-30', valor_total: 452.7,  precio_cuota: 1.075, cuotas_circ: 421.112631, trm: 3420 },
  { fecha: '2026-05-31', valor_total: 471.647,precio_cuota: 1.12,  cuotas_circ: 421.112631, trm: 3450 },
  { fecha: '2026-06-10', valor_total: 483.86, precio_cuota: 1.149, cuotas_circ: 421.112631, trm: 3475 },
];

export const MOCK_MOVIMIENTOS = [
  { fecha: '2026-01-10', persona: 'Patico',      tipo: 'aporte', monto: 100, precio_cuota_dia: 1.0,   cuotas: 100,       monto_cop: 330000, trm_dia: 3300 },
  { fecha: '2026-01-10', persona: 'Mariana',     tipo: 'aporte', monto: 100, precio_cuota_dia: 1.0,   cuotas: 100,       monto_cop: 330000, trm_dia: 3300 },
  { fecha: '2026-01-10', persona: 'Juancho',     tipo: 'aporte', monto: 80,  precio_cuota_dia: 1.0,   cuotas: 80,        monto_cop: 264000, trm_dia: 3300 },
  { fecha: '2026-01-10', persona: 'Juan Carlos', tipo: 'aporte', monto: 120, precio_cuota_dia: 1.0,   cuotas: 120,       monto_cop: 396000, trm_dia: 3300 },
  { fecha: '2026-02-20', persona: 'Patico',      tipo: 'aporte', monto: 50,  precio_cuota_dia: 1.02,  cuotas: 49.019608, monto_cop: 167500, trm_dia: 3350 },
  { fecha: '2026-04-30', persona: 'Mariana',     tipo: 'retiro', monto: 30,  precio_cuota_dia: 1.075, cuotas: -27.906977, monto_cop: 102000, trm_dia: 3400 },
];

export const MOCK_PARTICIPANTES_LOG = [
  { fecha: '2026-01-10', nombre: 'Patico',      accion: 'agregar' },
  { fecha: '2026-01-10', nombre: 'Mariana',     accion: 'agregar' },
  { fecha: '2026-01-10', nombre: 'Juancho',     accion: 'agregar' },
  { fecha: '2026-01-10', nombre: 'Juan Carlos', accion: 'agregar' },
];
