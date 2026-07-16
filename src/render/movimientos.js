import { S } from '../state.js';
import { participantesTodos, calcParticipante, participanteColor } from '../computed.js';
import { fmt, fmtPct, COP, signStr } from '../utils/format.js';
import { fmtDate } from '../utils/dates.js';
import { renderPersonaChart, resetPersonaChart } from './charts.js';

function populateFiltroPersona() {
  const sel = document.getElementById('filter-persona');
  const current = sel.value;
  const nombres = participantesTodos();
  sel.innerHTML = '<option value="">Todos los participantes</option>' +
    nombres.map(n => `<option${n === current ? ' selected' : ''}>${n}</option>`).join('');
}

const fmtCOP = n => n ? '$' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n) : '—';

function renderPersonaPanel(nombre) {
  const p = calcParticipante(nombre);
  const cls = p.ganancia_pct > 0 ? 'pos' : p.ganancia_pct < 0 ? 'neg' : 'zero';
  const color = participanteColor(nombre);

  document.getElementById('mov-persona-summary').innerHTML = `
    <div class="p-head" style="margin-bottom:18px">
      <div class="p-avatar" style="background:${color}">${p.nombre.charAt(0).toUpperCase()}</div>
      <div class="p-name">${p.nombre}</div>
    </div>
    <div class="p-summary-grid">
      <div>
        <div class="summary-label">Valor actual</div>
        <div class="summary-value">${fmt(p.valor_actual)}<span class="summary-unit">USD</span></div>
        ${p.has_cop ? `<div class="summary-sub">${COP(Math.round(p.valor_cop))} COP</div>` : ''}
      </div>
      <div>
        <div class="summary-label">Ganancia</div>
        <div class="summary-value">${signStr(p.ganancia_monto)}${fmt(Math.abs(p.ganancia_monto))}<span class="summary-unit">USD</span></div>
        <div style="margin-top:6px"><span class="gain-badge ${cls}">${signStr(p.ganancia_pct)}${fmtPct(Math.abs(p.ganancia_pct))}%</span></div>
      </div>
      <div>
        <div class="summary-label">Total aportado</div>
        <div class="summary-value">${fmt(p.aportes_monto)}<span class="summary-unit">USD</span></div>
        ${p.has_cop ? `<div class="summary-sub">${fmtCOP(p.cop_invertido)} COP · TRM prom ${fmtCOP(p.trm_avg_entrada)}</div>` : ''}
        ${p.retiros_monto > 0 ? `<div class="summary-sub">${fmt(p.retiros_monto)} USD retirados</div>` : ''}
      </div>
    </div>`;

  renderPersonaChart(nombre);
}

export function renderMovimientos() {
  populateFiltroPersona();
  const filtro = document.getElementById('filter-persona').value;
  const panel  = document.getElementById('mov-persona-panel');
  const list   = document.getElementById('mov-list');

  if (filtro) {
    panel.style.display = '';
    renderPersonaPanel(filtro);
  } else {
    panel.style.display = 'none';
    resetPersonaChart();
  }

  let movs = [...S.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (filtro) movs = movs.filter(m => m.persona === filtro);

  if (!movs.length) {
    list.innerHTML = `<li style="text-align:center;color:var(--text-secondary);padding:40px">Sin movimientos</li>`;
    return;
  }

  list.innerHTML = movs.map(m => `
    <li class="mov-card">
      <div class="mov-who">
        <div class="mov-persona">${m.persona}</div>
        <div class="mov-fecha">${fmtDate(m.fecha)}</div>
      </div>
      <div class="mov-figures">
        <div class="mov-monto"><span class="badge badge-${m.tipo}">${m.tipo}</span>${fmt(m.monto)} USD</div>
        <div class="mov-meta">${fmtCOP(m.monto_cop)} COP · TRM ${m.trm_dia ? fmtCOP(m.trm_dia) : '—'}</div>
      </div>
    </li>`).join('');
}
