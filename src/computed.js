import { S } from './state.js';
import { PARTICIPANT_COLORS } from './config.js';

export function latest() {
  return S.historial.length ? S.historial[S.historial.length - 1] : null;
}

export function precioCuota() {
  return latest()?.precio_cuota || 1;
}

export function cuotasCirc() {
  return S.movimientos.reduce((s, m) => s + m.cuotas, 0);
}

// Participantes activos según el log agregar/quitar (última acción por nombre gana)
export function participantesActivos() {
  const estado = new Map();
  for (const p of S.participantesLog) estado.set(p.nombre, p.accion);
  return [...estado.entries()]
    .filter(([, accion]) => accion === 'agregar')
    .map(([nombre]) => nombre);
}

// Activos + cualquiera con movimientos históricos (aunque haya sido quitado después)
export function participantesTodos() {
  const activos = participantesActivos();
  const vistos = new Set(activos);
  const extra = [];
  for (const m of S.movimientos) {
    if (!vistos.has(m.persona)) { vistos.add(m.persona); extra.push(m.persona); }
  }
  return [...activos, ...extra];
}

export function calcParticipante(nombre) {
  const movs          = S.movimientos.filter(m => m.persona === nombre);
  const cuotas        = movs.reduce((s, m) => s + m.cuotas, 0);
  const aportes       = movs.filter(m => m.tipo === 'aporte');
  const retiros       = movs.filter(m => m.tipo === 'retiro');
  const aportes_monto = aportes.reduce((s, m) => s + m.monto, 0);
  const aportes_cuotas= aportes.reduce((s, m) => s + m.cuotas, 0);
  const retiros_monto = retiros.reduce((s, m) => s + m.monto, 0);
  const pc            = precioCuota();
  const valor_actual  = cuotas * pc;
  const neto_invertido= aportes_monto - retiros_monto;
  const precio_prom   = aportes_cuotas > 0 ? aportes_monto / aportes_cuotas : 0;
  const ganancia_pct  = precio_prom > 0 ? (pc - precio_prom) / precio_prom * 100 : 0;
  const ganancia_monto= valor_actual + retiros_monto - aportes_monto;

  // ── COP ──────────────────────────────────────────────────────────────────
  const cop_invertido  = aportes.reduce((s, m) => s + (m.monto_cop || 0), 0);
  const cop_retirado   = retiros.reduce((s, m) => s + (m.monto_cop || 0), 0);
  const has_cop        = cop_invertido > 0;
  const trm_actual     = S.trm || 1;
  const valor_cop      = valor_actual * trm_actual;
  const ganancia_cop   = valor_cop + cop_retirado - cop_invertido;
  const ganancia_cop_pct = has_cop ? ganancia_cop / cop_invertido * 100 : 0;
  // TRM promedio de entrada (COP invertido / USD invertido)
  const trm_avg_entrada = aportes_monto > 0 ? cop_invertido / aportes_monto : 0;
  // Desglose: cuánto ganó por fondo vs por TRM
  const ganancia_fondo_cop = ganancia_monto * trm_actual;
  const ganancia_trm_cop   = ganancia_cop - ganancia_fondo_cop;

  return {
    nombre, cuotas, valor_actual, aportes_monto, retiros_monto, neto_invertido,
    precio_prom, ganancia_pct, ganancia_monto,
    cop_invertido, cop_retirado, has_cop, valor_cop,
    ganancia_cop, ganancia_cop_pct, trm_avg_entrada,
    ganancia_fondo_cop, ganancia_trm_cop,
  };
}

// Color de acento asignado a un participante — mismo orden que en resumen.js
export function participanteColor(nombre) {
  const sorted = participantesTodos()
    .map(n => calcParticipante(n))
    .sort((a, b) => b.cuotas - a.cuotas);
  const idx = sorted.findIndex(p => p.nombre === nombre);
  return PARTICIPANT_COLORS[Math.max(idx, 0) % PARTICIPANT_COLORS.length];
}

// Valor de la inversión del participante y su neto invertido en cada snapshot del
// historial del fondo, usando sus cuotas/aportes acumulados a esa fecha (no los totales actuales)
export function historialParticipante(nombre) {
  const movs = S.movimientos
    .filter(m => m.persona === nombre)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return S.historial.map(h => {
    const hasta = movs.filter(m => m.fecha <= h.fecha);
    const cuotas = hasta.reduce((s, m) => s + m.cuotas, 0);
    const invertido = hasta.reduce((s, m) => s + (m.tipo === 'retiro' ? -m.monto : m.monto), 0);
    return { fecha: h.fecha, valor: cuotas * h.precio_cuota, invertido };
  });
}
