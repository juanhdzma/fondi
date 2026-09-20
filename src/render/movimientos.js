import { S } from '../state.js';
import { participantesTodos, calcParticipante, participanteColor, porcentajeRetiro } from '../computed.js';
import { fmt, fmtPct, COP, signStr } from '../utils/format.js';
import { fmtDate, normDate } from '../utils/dates.js';
import { esc } from '../utils/html.js';
import { renderPersonaChart, resetPersonaChart } from './charts.js';

function populateFiltroPersona() {
  const sel = document.getElementById('filter-persona');
  const current = sel.value;
  const nombres = participantesTodos();
  sel.innerHTML = '<option value="">Todos los participantes</option>' +
    nombres.map(n => `<option value="${esc(n)}"${n === current ? ' selected' : ''}>${esc(n)}</option>`).join('');
}

const fmtCOP = n => n ? COP(n) : '—';
const MONTH = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });

function fmtMonth(fecha) {
  const key = normDate(fecha).slice(0, 7);
  const label = MONTH.format(new Date(`${key}-01T12:00:00`));
  return [key, label.charAt(0).toUpperCase() + label.slice(1)];
}

function renderPersonaPanel(nombre) {
  const p = calcParticipante(nombre);
  const cls = p.ganancia_pct > 0 ? 'pos' : p.ganancia_pct < 0 ? 'neg' : 'zero';
  const color = participanteColor(nombre);

  document.getElementById('mov-persona-summary').innerHTML = `
    <div class="p-head" style="margin-bottom:18px">
      <div class="p-avatar" style="background:${color}">${esc(p.nombre.charAt(0).toUpperCase())}</div>
      <div class="p-name">${esc(p.nombre)}</div>
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

  const visibles = new Set(participantesTodos());
  let movs = S.movimientos.filter(m => visibles.has(m.persona)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (filtro) movs = movs.filter(m => m.persona === filtro);

  if (!movs.length) {
    list.innerHTML = `
      <li class="empty">
        <div class="empty-title">Sin movimientos</div>
        <p class="empty-text">Los aportes y retiros aparecerán aquí.</p>
      </li>`;
    return;
  }

  let currentMonth = '';
  list.innerHTML = movs.map(m => {
    const [month, label] = fmtMonth(m.fecha);
    const heading = month === currentMonth ? '' : `<li class="mov-month"><h2>${label}</h2></li>`;
    currentMonth = month;
    return `${heading}
      <li class="mov-card">
        <div class="mov-who">
          <div class="mov-persona">${esc(m.persona)}</div>
          <div class="mov-fecha">${fmtDate(m.fecha)}</div>
        </div>
        <div class="mov-figures">
          <div class="mov-monto"><span class="badge badge-${esc(m.tipo)}">${esc(m.tipo)}</span>${fmt(m.monto)} USD</div>
          <div class="mov-meta">${m.tipo === 'retiro' ? `Retiró ${fmtPct(porcentajeRetiro(m))}% de su saldo` : `${fmtCOP(m.monto_cop)} COP · TRM ${m.trm_dia ? fmtCOP(m.trm_dia) : '—'}`}</div>
        </div>
      </li>`;
  }).join('');
}
