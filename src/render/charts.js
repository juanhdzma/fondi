import { Chart } from 'chart.js/auto';
import { S, charts } from '../state.js';
import { participanteColor, historialParticipante, historialGananciaFondo } from '../computed.js';
import { fmtPct, signStr } from '../utils/format.js';
import { fmtDateShort } from '../utils/dates.js';

function rangeCutoff(range) {
  const now = new Date();
  const d = (days) => new Date(now - days * 86400000);
  const m = (months) => new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  const cutoffs = {
    '1W': d(7),  '2W': d(14),
    '1M': m(1),  '3M': m(3),  '6M': m(6),
    '1A': new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
    'todo': null,
  };
  return cutoffs[range] ?? null;
}

function filteredHistorial(range = S.range, source = S.historial) {
  const cut = rangeCutoff(range);
  if (!cut) return source;
  return source.filter(h => new Date(h.fecha.split('T')[0] + 'T12:00:00') >= cut);
}

function filteredHistorialWithFill(range = S.range, source = S.historial) {
  const raw = filteredHistorial(range, source);
  const all = source;
  if (!all.length) return [];

  let result = [...raw];

  // Backward fill: prepend el último punto conocido antes del rango
  // así el período empieza con el valor anterior aunque no haya entrada exacta en esa fecha
  const firstIdx = raw.length > 0
    ? all.findIndex(h => h === raw[0])
    : all.length;
  if (firstIdx > 0) {
    result = [all[firstIdx - 1], ...result];
  } else if (raw.length === 0) {
    result = [all[all.length - 1]];
  }

  // Forward fill: extender hasta hoy con el último valor conocido (línea plana)
  const today = new Date().toISOString().split('T')[0];
  const last = result[result.length - 1];
  if (last && last.fecha.split('T')[0] < today) {
    result.push({ ...last, fecha: today });
  }

  return result;
}

function makeGradient(chart, hex) {
  const { ctx, chartArea } = chart;
  if (!chartArea) return hex + '22';
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, hex + '44');
  g.addColorStop(1, hex + '00');
  return g;
}

const ACCENT   = '#0C243B';
const ACCENT_2 = '#4A6E93';

const toTs = fecha => new Date(fecha.slice(0, 10) + 'T12:00:00').getTime();

function fmtTs(ts) {
  const d = new Date(ts);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return fmtDateShort(`${y}-${m}-${day}`);
}

// ── Ticks del eje x alineados a calendario (inicio de mes/semana/cada 4 días), en posición
// proporcional al tiempo real — no por índice, para que un hueco de 6 días no ocupe lo mismo que uno de 1 ──
function computeCalendarTicks(timestamps) {
  const n = timestamps.length;
  if (n === 0) return [];

  const start = timestamps[0], end = timestamps[n - 1];
  const spanDays = (end - start) / 86400000;
  const startD = new Date(start);

  let stepFn, firstTarget, minGapMs;
  if (spanDays > 150) {
    // inicio de cada mes
    stepFn = t => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); };
    firstTarget = new Date(startD.getFullYear(), startD.getMonth(), 1).getTime();
    if (firstTarget < start) firstTarget = stepFn(firstTarget);
    minGapMs = 15 * 86400000;
  } else if (spanDays > 20) {
    // inicio de cada semana (lunes)
    stepFn = t => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getTime(); };
    const diffToMonday = (startD.getDay() + 6) % 7;
    firstTarget = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate() - diffToMonday).getTime();
    if (firstTarget < start) firstTarget = stepFn(firstTarget);
    minGapMs = 4 * 86400000;
  } else if (spanDays > 8) {
    // cada 4 días
    stepFn = t => t + 4 * 86400000;
    firstTarget = start;
    minGapMs = 3 * 86400000;
  } else {
    // todos los días
    stepFn = t => t + 86400000;
    firstTarget = start;
    minGapMs = 0;
  }

  const ticks = [];
  for (let t = firstTarget; t <= end; t = stepFn(t)) ticks.push(t);

  // Evita que el borde (inicio/fin) quede pegado al tick "natural" más cercano y las
  // etiquetas se encimen — si están muy cerca, el borde reemplaza al tick natural en vez de sumarse.
  if (!ticks.length || ticks[0] - start >= minGapMs) ticks.unshift(start);
  else ticks[0] = start;
  if (!ticks.length || end - ticks[ticks.length - 1] >= minGapMs) ticks.push(end);
  else ticks[ticks.length - 1] = end;

  return [...new Set(ticks)].sort((a, b) => a - b);
}

function xAxis(tickValues) {
  return {
    type: 'linear',
    bounds: 'data',
    min: tickValues[0],
    max: tickValues[tickValues.length - 1],
    ticks: { display: false },
    afterBuildTicks: axis => { axis.ticks = tickValues.map(value => ({ value })); },
    grid: { display: false },
    border: { display: false },
  };
}

const TT_BASE = {
  backgroundColor: '#FFFFFF',
  borderColor: '#E7E7EA',
  borderWidth: 1,
  bodyColor: '#0C0D0F',
  footerColor: '#9AA0A6',
  padding: 12,
  bodyFont: { size: 15, weight: '700' },
  footerFont: { size: 11, weight: '600' },
  footerMarginTop: 4,
};

// El precio/valor va grande en el body (arriba), la fecha chica y gris en el footer (abajo) —
// al revés del orden default de Chart.js (title arriba, body abajo).
const tooltipNoTitle = () => '';
const tooltipFooterDate = items => items.length ? fmtTs(items[0].parsed.x) : '';

function chartOpts(tickValues) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { left: 4, right: 4, top: 4 } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...TT_BASE,
        callbacks: {
          title: tooltipNoTitle,
          label: ctx => ` $${new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ctx.parsed.y)} USD`,
          footer: tooltipFooterDate,
        }
      }
    },
    scales: {
      x: xAxis(tickValues),
      y: {
        position: 'right',
        ticks: {
          color: '#6E6F76',
          font: { size: 13 },
          callback: v => '$' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v),
        },
        grid: { color: '#E7E7EA' },
        border: { display: false },
      }
    }
  };
}

// Con pocos puntos se ven bien grandes; con muchos, se amontonan — el radio baja con la cantidad.
function pointRadiusFor(n) {
  if (n <= 10) return 2.2;
  if (n <= 25) return 1.5;
  if (n <= 50) return 1;
  return 0.6;
}

function makeDataset(points, color) {
  const r = pointRadiusFor(points.length);
  return {
    data: points,
    borderColor: color,
    backgroundColor: ctx => makeGradient(ctx.chart, color),
    fill: true, borderWidth: 3,
    pointRadius: r, pointHoverRadius: r + 2,
    pointBackgroundColor: color,
    pointHoverBackgroundColor: color,
    tension: 0,
  };
}

const GAIN_GREEN = '#17803D';
const GAIN_RED   = '#B4231F';

// Un segmento que cruza cero (empieza positivo, termina negativo o viceversa) no puede
// pintarse con un solo color sin que parte quede del lado equivocado de la línea de 0 —
// se inserta un punto interpolado exacto en y=0 en el cruce, así ningún segmento lo atraviesa.
function splitAtZero(points) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    result.push(points[i]);
    const a = points[i], b = points[i + 1];
    if (b && (a.y < 0) !== (b.y < 0)) {
      const t = a.y / (a.y - b.y);
      result.push({ x: a.x + (b.x - a.x) * t, y: 0, interpolated: true });
    }
  }
  return result;
}

// Ganancia acumulada: verde/rojo según el signo del segmento. Si p1 es el punto interpolado
// en y=0 (splitAtZero), su signo no dice nada — hay que mirar p0 (el extremo real) en su lugar,
// si no un cruce ascendente (negativo → 0) se pintaba verde en vez de rojo.
function gainSegmentColor(ctx) {
  const y1 = ctx.p1.parsed.y;
  const y  = y1 !== 0 ? y1 : ctx.p0.parsed.y;
  return y >= 0 ? GAIN_GREEN : GAIN_RED;
}

function makeGananciaDataset(rawPoints) {
  const r = pointRadiusFor(rawPoints.length);
  const points = splitAtZero(rawPoints);
  return {
    data: points,
    borderWidth: 3,
    fill: true,
    segment: {
      borderColor: gainSegmentColor,
      backgroundColor: ctx => gainSegmentColor(ctx) + '22',
    },
    pointRadius: ctx => ctx.raw?.interpolated ? 0 : r,
    pointHoverRadius: ctx => ctx.raw?.interpolated ? 0 : r + 2,
    pointBackgroundColor: ctx => (ctx.raw?.y ?? 0) >= 0 ? GAIN_GREEN : GAIN_RED,
    pointHoverBackgroundColor: ctx => (ctx.raw?.y ?? 0) >= 0 ? GAIN_GREEN : GAIN_RED,
    tension: 0,
  };
}

function cuotaChartOpts(tickValues) {
  return {
    responsive: true, maintainAspectRatio: false,
    layout: { padding: { left: 4, right: 4, top: 4 } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true, position: 'bottom',
        labels: { color: '#6E6F76', font: { size: 14 }, padding: 14, usePointStyle: true },
      },
      tooltip: {
        ...TT_BASE,
        callbacks: {
          title: tooltipNoTitle,
          label: ctx => {
            const v = ctx.parsed.y;
            const sign = v >= 0 ? '+' : '';
            const label = ctx.datasetIndex === 0 ? 'USD' : 'COP';
            return ` ${sign}${fmtPct(v)}% ${label}`;
          },
          footer: tooltipFooterDate,
        }
      }
    },
    scales: {
      x: xAxis(tickValues),
      y: {
        position: 'right',
        ticks: {
          color: '#6E6F76', font: { size: 13 },
          callback: v => (v >= 0 ? '+' : '') + fmtPct(v) + '%',
        },
        grid: { color: '#E7E7EA' }, border: { display: false },
      },
    }
  };
}

// ── % de cambio en el rango seleccionado sobre una key del historial ──
function periodPct(data, key) {
  if (data.length < 2) return null;
  const s = data[0][key], e = data[data.length - 1][key];
  return s > 0 ? (e - s) / s * 100 : null;
}

const RANGE_LABELS = {
  '1W': '1 semana', '2W': '2 semanas', '1M': '1 mes',
  '3M': '3 meses', '6M': '6 meses', '1A': '1 año', 'todo': 'todo el periodo',
};

export function renderCharts() {
  const data = filteredHistorialWithFill();
  if (!data.length) return;

  // El primer punto puede venir de backward-fill (última valuación antes del rango, con fecha
  // real muy anterior); se clampea al inicio visible del rango para que la línea arranque ahí
  // y no desperdicie la mayor parte del ancho del chart en un tramo plano fuera del rango.
  const cutoff = rangeCutoff(S.range);
  const cutoffTs = cutoff ? cutoff.getTime() : null;
  const ts = data.map((h, i) => {
    const t = toTs(h.fecha);
    return (i === 0 && cutoffTs != null && t < cutoffTs) ? cutoffTs : t;
  });
  const tickValues = computeCalendarTicks(ts);

  const totalPoints = data.map((h, i) => ({ x: ts[i], y: h.valor_total }));

  // ── % de cambio del precio cuota — USD y COP normalizados desde 0% en el primer punto ──
  const base0    = data[0]?.precio_cuota || 1;
  const baseCOP0 = data[0] ? data[0].precio_cuota * (data[0].trm || S.trm || 1) : 1;
  const pctUSDPoints = data.map((h, i) => ({ x: ts[i], y: (h.precio_cuota / base0 - 1) * 100 }));
  const pctCOPPoints = data.map((h, i) => ({ x: ts[i], y: (h.precio_cuota * (h.trm || S.trm || 1) / baseCOP0 - 1) * 100 }));

  // ── Ganancia acumulada del fondo — misma serie de fechas que `data`, filtrada/rellenada igual ──
  const gananciaData = filteredHistorialWithFill(S.range, historialGananciaFondo());
  const gananciaPoints = gananciaData.map((h, i) => ({ x: ts[i], y: h.ganancia }));

  // ── Chart hero: un solo canvas, cambia según S.heroMetric ──
  const metric = S.heroMetric;
  if (charts.hero && charts.heroMetric !== metric) { charts.hero.destroy(); charts.hero = null; }

  if (metric === 'cuota') {
    if (charts.hero) {
      charts.hero.data.datasets[0].data = pctUSDPoints;
      charts.hero.data.datasets[1].data = pctCOPPoints;
      charts.hero.options.scales.x = xAxis(tickValues);
      charts.hero.update('none');
    } else {
      const dsPctUSD = { ...makeDataset(pctUSDPoints, ACCENT), label: 'USD', fill: false };
      const dsPctCOP = { ...makeDataset(pctCOPPoints, ACCENT_2), label: 'COP', fill: false };
      charts.hero = new Chart(document.getElementById('chart-hero'), {
        type: 'line',
        data: { datasets: [dsPctUSD, dsPctCOP] },
        options: cuotaChartOpts(tickValues),
      });
    }
  } else if (metric === 'ganancia') {
    if (charts.hero) {
      charts.hero.data.datasets[0].data = splitAtZero(gananciaPoints);
      charts.hero.options.scales.x = xAxis(tickValues);
      charts.hero.update('none');
    } else {
      charts.hero = new Chart(document.getElementById('chart-hero'), {
        type: 'line',
        data: { datasets: [makeGananciaDataset(gananciaPoints)] },
        options: chartOpts(tickValues),
      });
    }
  } else {
    if (charts.hero) {
      charts.hero.data.datasets[0].data = totalPoints;
      charts.hero.options.scales.x = xAxis(tickValues);
      charts.hero.update('none');
    } else {
      charts.hero = new Chart(document.getElementById('chart-hero'), {
        type: 'line',
        data: { datasets: [makeDataset(totalPoints, ACCENT)] },
        options: chartOpts(tickValues),
      });
    }
  }
  charts.heroMetric = metric;

  // ── Deltas de las tarjetas fijas: siempre sobre el rango seleccionado ──
  const periodLabel = RANGE_LABELS[S.range] || '';
  const setChg = (id, pct) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (pct === null) { el.textContent = ''; el.className = 'stat-chg'; return; }
    el.innerHTML = `${signStr(pct)}${fmtPct(Math.abs(pct))}%<span class="stat-chg-period"> · ${periodLabel}</span>`;
    el.className = `stat-chg ${pct > 0 ? 'pos' : pct < 0 ? 'neg' : 'muted'}`;
  };
  setChg('stat-fondo-chg', periodPct(data, 'valor_total'));
  setChg('stat-cuota-chg', periodPct(data, 'precio_cuota'));
}

export function resetLineCharts() {
  if (charts.hero) { charts.hero.destroy(); charts.hero = null; charts.heroMetric = null; }
}

// ── Tooltip HTML custom: solo el label ("Valor actual"/"Invertido") en negrilla, el monto no —
// el tooltip nativo de Chart.js no permite mezclar pesos de fuente dentro de una misma línea.
function getPersonaTooltipEl() {
  let el = document.getElementById('persona-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'persona-tooltip';
    Object.assign(el.style, {
      position: 'absolute', pointerEvents: 'none', zIndex: '50',
      background: '#FFFFFF', border: '1px solid #E7E7EA', borderRadius: '10px',
      padding: '10px 12px', fontSize: '14px', color: '#0C0D0F',
      boxShadow: '0 4px 14px rgba(16,24,40,.1)', transition: 'opacity .1s ease',
      transform: 'translate(-50%, -110%)', opacity: '0',
    });
    document.body.appendChild(el);
  }
  return el;
}

function personaTooltipHandler({ chart, tooltip }) {
  const el = getPersonaTooltipEl();
  if (tooltip.opacity === 0) { el.style.opacity = '0'; return; }

  const fmtUsd = v => '$' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const lines = tooltip.dataPoints.map(dp => `<div><b>${dp.dataset.label}</b>: ${fmtUsd(dp.parsed.y)} USD</div>`).join('');
  const date  = tooltip.dataPoints.length ? fmtTs(tooltip.dataPoints[0].parsed.x) : '';

  el.innerHTML = `${lines}<div style="color:#9AA0A6;font-size:11px;font-weight:600;margin-top:4px">${date}</div>`;

  const rect = chart.canvas.getBoundingClientRect();
  el.style.opacity = '1';
  el.style.left = `${rect.left + window.scrollX + tooltip.caretX}px`;
  el.style.top = `${rect.top + window.scrollY + tooltip.caretY}px`;
}

// ── Línea: valor actual vs. invertido de un participante en el tiempo (tab Movimientos) ──
function personaChartOpts(tickValues) {
  return {
    responsive: true, maintainAspectRatio: false,
    layout: { padding: { left: 4, right: 4, top: 4 } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true, position: 'bottom',
        labels: { color: '#6E6F76', font: { size: 14 }, padding: 14, usePointStyle: true },
      },
      tooltip: { enabled: false, external: personaTooltipHandler },
    },
    scales: {
      x: xAxis(tickValues),
      y: {
        position: 'right',
        ticks: {
          color: '#6E6F76', font: { size: 13 },
          callback: v => '$' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v),
        },
        grid: { color: '#E7E7EA' }, border: { display: false },
      },
    }
  };
}

export function renderPersonaChart(nombre) {
  const raw = historialParticipante(nombre);
  const data = filteredHistorialWithFill(S.personaRange, raw);
  if (!data.length) { resetPersonaChart(); return; }

  // Mismo clamp que el chart hero: el primer punto (posible backward-fill) no arranca
  // en su fecha real si esta cae fuera del rango visible.
  const cutoff = rangeCutoff(S.personaRange);
  const cutoffTs = cutoff ? cutoff.getTime() : null;
  const ts = data.map((h, i) => {
    const t = toTs(h.fecha);
    return (i === 0 && cutoffTs != null && t < cutoffTs) ? cutoffTs : t;
  });
  const valorPoints = data.map((h, i) => ({ x: ts[i], y: h.valor }));
  const invertidoPoints = data.map((h, i) => ({ x: ts[i], y: h.invertido }));
  const color = participanteColor(nombre);
  const tickValues = computeCalendarTicks(ts);

  const dsValor = { ...makeDataset(valorPoints, color), label: 'Valor actual' };
  const dsInvertido = { ...makeDataset(invertidoPoints, '#9CA3AF'), label: 'Invertido', fill: false, borderDash: [6, 4] };

  if (charts.persona) charts.persona.destroy();
  charts.persona = new Chart(document.getElementById('chart-persona'), {
    type: 'line',
    data: { datasets: [dsValor, dsInvertido] },
    options: personaChartOpts(tickValues),
  });
}

export function resetPersonaChart() {
  if (charts.persona) { charts.persona.destroy(); charts.persona = null; }
  document.getElementById('persona-tooltip')?.remove();
}
