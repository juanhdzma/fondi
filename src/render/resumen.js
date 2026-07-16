import { S } from '../state.js';
import { PARTICIPANT_COLORS } from '../config.js';
import { latest, calcParticipante, participantesTodos, participantesActivos, cuotasCirc } from '../computed.js';
import { fmt, fmtPct, fmtN, COP, signStr } from '../utils/format.js';

export function renderResumen() {
  const l = latest();

  if (!l) {
    document.getElementById('stat-fondo-value').textContent = '—';
    document.getElementById('stat-fondo-chg').textContent = '';
    document.getElementById('stat-cuota-value').textContent = '—';
    document.getElementById('stat-cuota-chg').textContent = '';
    document.getElementById('stat-aportado-value').textContent = '—';
    document.getElementById('stat-ganancia-value').textContent = '—';
    document.getElementById('stat-cuotas-value').textContent = '—';
    document.getElementById('stat-cuota-cop-value').textContent = '—';
    document.getElementById('participantes-count').textContent = '—';
    document.getElementById('participants-grid').innerHTML =
      `<div class="empty">
        <div class="empty-title">Fondo vacío</div>
        <div class="empty-text">El admin puede registrar aportes y el primer valor del fondo en el panel Admin.</div>
      </div>`;
    return;
  }

  // ── Valor del fondo / precio de cuota: valor actual (el % de cambio lo pone renderCharts según el rango) ──
  document.getElementById('stat-fondo-value').textContent = `${fmt(l.valor_total)} USD`;
  document.getElementById('stat-cuota-value').textContent = `${fmt(l.precio_cuota)} USD`;

  // ── Participantes: filas planas ──
  const sorted = participantesTodos()
    .map(n => calcParticipante(n))
    .sort((a, b) => b.cuotas - a.cuotas);

  const totalCuotas = cuotasCirc();

  // ── Sub-fila dentro de "Precio de cuota": cuotas en circulación y su valor en COP ──
  document.getElementById('stat-cuotas-value').textContent = fmtN(totalCuotas, 2);
  document.getElementById('stat-cuota-cop-value').textContent = `${COP(Math.round(l.precio_cuota * (S.trm || 1)))} COP`;

  // ── Sub-fila dentro de "Valor del fondo": aportado vs. ganancia acumulada ──
  const totalAportado = sorted.reduce((s, p) => s + p.neto_invertido, 0);
  const totalGanancia = sorted.reduce((s, p) => s + p.ganancia_monto, 0);
  const gananciaPct   = totalAportado > 0 ? totalGanancia / totalAportado * 100 : 0;
  const clsGanancia   = totalGanancia > 0 ? 'pos' : totalGanancia < 0 ? 'neg' : '';

  document.getElementById('stat-aportado-value').textContent = `${fmt(totalAportado)} USD`;
  const ganEl = document.getElementById('stat-ganancia-value');
  ganEl.textContent = `${signStr(totalGanancia)}${fmt(Math.abs(totalGanancia))} USD (${signStr(gananciaPct)}${fmtPct(Math.abs(gananciaPct))}%)`;
  ganEl.className = clsGanancia;

  document.getElementById('participantes-count').textContent = participantesActivos().length;

  document.getElementById('participants-grid').innerHTML = sorted.map((p, idx) => {
    const clsUSD = p.ganancia_pct > 0 ? 'pos' : p.ganancia_pct < 0 ? 'neg' : 'zero';

    const tone     = PARTICIPANT_COLORS[idx % PARTICIPANT_COLORS.length];
    const inicial  = p.nombre.charAt(0).toUpperCase();
    const pctFondo = totalCuotas > 0 ? Math.max(0, p.cuotas) / totalCuotas * 100 : 0;

    return `
    <div class="p-row">
      <div class="p-avatar" style="background:${tone}">${inicial}</div>
      <div class="p-main">
        <div class="p-name">${p.nombre}</div>
        <div class="p-bar-row">
          <div class="p-bar"><span style="width:${pctFondo.toFixed(1)}%;background:${tone}"></span></div>
          <span class="p-pct">${pctFondo.toFixed(0)}%</span>
        </div>
      </div>
      <div class="p-figures">
        <div class="p-monto">${fmt(p.valor_actual)}</div>
        <div class="p-chg ${clsUSD}">${signStr(p.ganancia_pct)}${fmtPct(Math.abs(p.ganancia_pct))}%</div>
      </div>
    </div>`;
  }).join('');
}
