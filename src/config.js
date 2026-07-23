// En dev (`npm run dev`) el backend corre aparte en :8000; en el build de producción
// ambos quedan en el mismo container/origen, así que las requests van relativas.
export const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:8000' : '';

// ── Rampa tonal (un solo acento, distintas intensidades) — avatares y barra de participación ──
export const PARTICIPANT_COLORS = ['#0C243B', '#1B3A5C', '#2F5478', '#4A6E93', '#7C93AF'];

// ── Mock data — cambiar a false cuando el backend esté listo ─
export const MOCK_MODE = false;

export const MOCK_HISTORIAL = [
  { fecha: '2026-05-25', valor_total: 8000,   precio_cuota: 1.0,     cuotas_circ: 8000, trm: 4050 },
  { fecha: '2026-06-01', valor_total: 8320,   precio_cuota: 1.04,    cuotas_circ: 8000, trm: 4060 },
  { fecha: '2026-06-08', valor_total: 8180,   precio_cuota: 1.0225,  cuotas_circ: 8000, trm: 4070 },
  { fecha: '2026-06-15', valor_total: 7650,   precio_cuota: 0.95625, cuotas_circ: 8000, trm: 4080 },
  { fecha: '2026-06-22', valor_total: 7420,   precio_cuota: 0.9275,  cuotas_circ: 8000, trm: 4090 },
  { fecha: '2026-06-29', valor_total: 7800,   precio_cuota: 0.975,   cuotas_circ: 8000, trm: 4075 },
  { fecha: '2026-07-06', valor_total: 8050,   precio_cuota: 1.00625, cuotas_circ: 8000, trm: 4060 },
  { fecha: '2026-07-13', valor_total: 8410,   precio_cuota: 1.05125, cuotas_circ: 8000, trm: 4045 },
  { fecha: '2026-07-20', valor_total: 8690,   precio_cuota: 1.08625, cuotas_circ: 8000, trm: 4030 },
  { fecha: '2026-07-23', valor_total: 8850,   precio_cuota: 1.10625, cuotas_circ: 8000, trm: 4020 },
];

export const MOCK_MOVIMIENTOS = [
  { fecha: '2026-05-25', persona: 'Ana',    tipo: 'aporte', monto: 3000, precio_cuota_dia: 1.0, cuotas: 3000, monto_cop: 12150000, trm_dia: 4050 },
  { fecha: '2026-05-25', persona: 'Luis',   tipo: 'aporte', monto: 2500, precio_cuota_dia: 1.0, cuotas: 2500, monto_cop: 10125000, trm_dia: 4050 },
  { fecha: '2026-05-25', persona: 'Carlos', tipo: 'aporte', monto: 1500, precio_cuota_dia: 1.0, cuotas: 1500, monto_cop: 6075000,  trm_dia: 4050 },
  { fecha: '2026-05-25', persona: 'Sofía',  tipo: 'aporte', monto: 1000, precio_cuota_dia: 1.0, cuotas: 1000, monto_cop: 4050000,  trm_dia: 4050 },
];

export const MOCK_PARTICIPANTES_LOG = [
  { fecha: '2026-05-25', nombre: 'Ana',    accion: 'agregar' },
  { fecha: '2026-05-25', nombre: 'Luis',   accion: 'agregar' },
  { fecha: '2026-05-25', nombre: 'Carlos', accion: 'agregar' },
  { fecha: '2026-05-25', nombre: 'Sofía',  accion: 'agregar' },
];
