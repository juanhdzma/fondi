import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Chart } from 'chart.js/auto';
import { historialGananciaFondo, historialParaGrafica } from '../computed.js';
import { S } from '../state.js';
import { compact, COP, fmt, signStr } from '../utils/format.js';
import { fmtDateShort, todayLocal } from '../utils/dates.js';
import { cssVar, useTheme, withAlpha } from '../theme';
import { tone } from './Delta';

export const RANGES = [
  ['1W', '1 semana', '1S'],
  ['2W', '2 semanas', '2S'],
  ['1M', '1 mes', '1M'],
  ['3M', '3 meses', '3M'],
  ['6M', '6 meses', '6M'],
  ['1A', '1 año', '1A'],
  ['todo', 'Todo', 'Todo'],
] as const;

export const RANGE_LABELS = Object.fromEntries(
  RANGES.map(([value, label]) => [value, value === 'todo' ? 'todo el periodo' : label]),
) as Record<string, string>;

type Row = Record<string, any> & { fecha: string };
type Point = { x: number; y: number; interpolated?: boolean };

function rangeCutoff(range: string) {
  const now = new Date();
  const days = (value: number) => new Date(now.getTime() - value * 86400000);
  const months = (value: number) => new Date(now.getFullYear(), now.getMonth() - value, now.getDate());
  const cutoffs: Record<string, Date | null> = {
    '1W': days(7),
    '2W': days(14),
    '1M': months(1),
    '3M': months(3),
    '6M': months(6),
    '1A': new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
    todo: null,
  };
  return cutoffs[range] ?? null;
}

function filteredWithFill(range: string, source: Row[]) {
  const cutoff = rangeCutoff(range);
  const raw = cutoff
    ? source.filter(row => new Date(`${row.fecha.split('T')[0]}T12:00:00`) >= cutoff)
    : source;
  if (!source.length) return [];

  let result = [...raw];
  const firstIndex = raw.length ? source.findIndex(row => row === raw[0]) : source.length;
  if (firstIndex > 0) result = [source[firstIndex - 1], ...result];
  else if (!raw.length) result = [source[source.length - 1]];

  const last = result.at(-1);
  const today = todayLocal();
  if (last && last.fecha.split('T')[0] < today) result.push({ ...last, fecha: today });
  return result;
}

// Ganancia del período sobre el capital en juego (valor inicial + aportes netos del período):
// capital = valorFinal - ganado. Con valor inicial 0 coincide con ganancia / aportado.
export function periodGainPct(startGain: number, endGain: number, endValue: number) {
  const gained = endGain - startGain;
  const capital = endValue - gained;
  return capital > 0 ? gained / capital * 100 : null;
}

export function rangeHistory(range: string) {
  return filteredWithFill(range, historialParaGrafica() as Row[]);
}

const toTimestamp = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).getTime();

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return fmtDateShort(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
}

export function computeCalendarTicks(timestamps: number[]) {
  if (!timestamps.length) return [];
  const start = timestamps[0];
  const end = timestamps.at(-1)!;
  const spanDays = (end - start) / 86400000;
  const startDate = new Date(start);
  let step: (value: number) => number;
  let first: number;
  let minGap: number;

  if (spanDays > 150) {
    step = value => {
      const date = new Date(value);
      return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
    };
    first = new Date(startDate.getFullYear(), startDate.getMonth(), 1).getTime();
    if (first < start) first = step(first);
    minGap = 15 * 86400000;
  } else if (spanDays > 20) {
    step = value => {
      const date = new Date(value);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7).getTime();
    };
    const differenceToMonday = (startDate.getDay() + 6) % 7;
    first = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - differenceToMonday).getTime();
    if (first < start) first = step(first);
    minGap = 4 * 86400000;
  } else if (spanDays > 8) {
    step = value => value + 4 * 86400000;
    first = start;
    minGap = 3 * 86400000;
  } else {
    step = value => value + 86400000;
    first = start;
    minGap = 0;
  }

  const ticks: number[] = [];
  for (let value = first; value <= end; value = step(value)) ticks.push(value);
  if (!ticks.length || ticks[0] - start >= minGap) ticks.unshift(start);
  else ticks[0] = start;
  if (!ticks.length || end - ticks.at(-1)! >= minGap) ticks.push(end);
  else ticks[ticks.length - 1] = end;
  return [...new Set(ticks)].sort((a, b) => a - b);
}

function xAxis(ticks: number[]) {
  return {
    type: 'linear' as const,
    bounds: 'data' as const,
    min: ticks[0],
    max: ticks.at(-1),
    ticks: { display: false },
    afterBuildTicks: (axis: any) => { axis.ticks = ticks.map(value => ({ value })); },
    grid: { display: false },
    border: { display: false },
  };
}

function gradient(chart: any, color: string) {
  const { ctx, chartArea } = chart;
  if (!chartArea) return 'transparent';
  const fill = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  fill.addColorStop(0, withAlpha(color, 0.3));
  fill.addColorStop(1, withAlpha(color, 0));
  return fill;
}

const tooltip = () => ({
  backgroundColor: cssVar('--menu'),
  borderColor: cssVar('--line'),
  borderWidth: 1,
  bodyColor: cssVar('--text'),
  footerColor: cssVar('--muted'),
  padding: 12,
  bodyFont: { size: 15, weight: '700' as const },
  footerFont: { size: 11, weight: '600' as const },
  footerMarginTop: 4,
});

const tappedTooltips = new WeakMap<Chart, string>();

export function nextTooltipTap(previous: string, point?: { datasetIndex: number; index: number }) {
  if (!point) return '';
  const next = `${point.datasetIndex}:${point.index}`;
  return next === previous ? '' : next;
}

function dismissTooltip(chart: Chart) {
  tappedTooltips.delete(chart);
  chart.setActiveElements([]);
  chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
  chart.update('none');
}

function dismissTooltipOutside(chart: Chart, canvas: HTMLCanvasElement) {
  const dismiss = (event: PointerEvent) => {
    if (event.target !== canvas) dismissTooltip(chart);
  };
  document.addEventListener('pointerdown', dismiss);
  return () => document.removeEventListener('pointerdown', dismiss);
}

function crosshairHooks(color: string, onLeave: () => void, chip?: { background: string; text: string }) {
  return {
    afterDatasetsDraw(chart: Chart) {
      const active = chart.getActiveElements()[0];
      if (!active) return;
      const { ctx, chartArea } = chart;
      const x = active.element.x;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      if (chip) {
        const label = formatTimestamp((chart.data.datasets[active.datasetIndex].data[active.index] as { x: number }).x);
        ctx.font = '600 11px Geist Variable, system-ui, sans-serif';
        const width = ctx.measureText(label).width + 14;
        const left = Math.min(Math.max(x - width / 2, chartArea.left), chartArea.right - width);
        ctx.setLineDash([]);
        ctx.fillStyle = chip.background;
        ctx.beginPath();
        ctx.roundRect(left, chartArea.bottom - 20, width, 20, 6);
        ctx.fill();
        ctx.fillStyle = chip.text;
        ctx.textBaseline = 'middle';
        ctx.fillText(label, left + 7, chartArea.bottom - 10);
      }
      ctx.restore();
    },
    afterEvent(chart: Chart, args: any) {
      if (args.event.type === 'mouseout') {
        chart.setActiveElements([]);
        onLeave();
      }
    },
  };
}

function pointRadius(count: number) {
  if (count <= 10) return 2.2;
  if (count <= 25) return 1.5;
  if (count <= 50) return 1;
  return 0.6;
}

function dataset(points: Point[], color: string) {
  const radius = pointRadius(points.length);
  return {
    data: points,
    borderColor: color,
    backgroundColor: (context: any) => gradient(context.chart, color),
    fill: true,
    borderWidth: 3,
    pointRadius: radius,
    pointHoverRadius: radius + 2,
    pointBackgroundColor: color,
    pointHoverBackgroundColor: color,
    tension: 0,
  };
}

function standardOptions(ticks: number[]) {
  return {
    animation: false as const,
    events: ['mousemove', 'mouseout', 'click'],
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { left: 4, right: 4, top: 4 } },
    interaction: { mode: 'index' as const, intersect: false },
    onClick: (_event: any, elements: Array<{ datasetIndex: number; index: number }>, chart: Chart) => {
      const next = nextTooltipTap(tappedTooltips.get(chart) ?? '', elements[0]);
      if (!next) dismissTooltip(chart);
      else tappedTooltips.set(chart, next);
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltip(),
        callbacks: {
          title: () => '',
          label: (context: any) => ` ${fmt(context.parsed.y)}`,
          footer: (items: any[]) => items.length ? formatTimestamp(items[0].parsed.x) : '',
        },
      },
    },
    scales: {
      x: xAxis(ticks),
      y: {
        position: 'right' as const,
        ticks: { color: cssVar('--muted'), font: { size: 12 }, callback: (value: any) => compact(value) },
        grid: { color: cssVar('--line') },
        border: { display: false },
      },
    },
  };
}

export type HeroPoint = { ts: number; fecha: string; valor: number; aportado: number; ganancia: number; ganancia_cop: number; trm: number };

export function heroChange(start: HeroPoint | undefined, end: HeroPoint | undefined, currency: 'usd' | 'cop' = 'usd') {
  if (!start || !end || start === end) return null;
  return currency === 'usd'
    ? periodGainPct(start.ganancia, end.ganancia, end.valor)
    : periodGainPct(start.ganancia_cop, end.ganancia_cop, end.valor * end.trm);
}

// Lo que el fondo ganó entre dos puntos: la diferencia de ganancia acumulada, así un aporte o
// un retiro en el medio no cuenta como ganancia ni como pérdida.
export function heroGain(start: HeroPoint | undefined, end: HeroPoint | undefined) {
  return start && end ? end.ganancia - start.ganancia : 0;
}

export type Grain = 'day' | 'week' | 'month' | 'year';

export function bucketStart(ts: number, grain: Grain) {
  const date = new Date(ts);
  if (grain === 'year') return new Date(date.getFullYear(), 0, 1).getTime();
  if (grain === 'month') return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  const back = grain === 'week' ? (date.getDay() + 6) % 7 : 0;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back).getTime();
}

const MAX_LINE_POINTS = 150;

// Largest-Triangle-Three-Buckets: por encima del presupuesto, deja en cada tramo el snapshot real
// que más forma aporta (picos y valles incluidos), así la línea no se aplana y cada punto
// seleccionable sigue diciendo lo que el fondo valía ese día.
export function downsample<T extends { ts: number }>(points: T[], value: (point: T) => number, budget = MAX_LINE_POINTS) {
  if (budget < 3 || points.length <= budget) return points;
  const kept = [points[0]];
  const size = (points.length - 2) / (budget - 2);
  let previous = points[0];
  for (let bucket = 0; bucket < budget - 2; bucket++) {
    const start = Math.floor(bucket * size) + 1;
    const end = Math.floor((bucket + 1) * size) + 1;
    const next = points.slice(end, Math.min(Math.floor((bucket + 2) * size) + 1, points.length - 1));
    const target = next.length ? next : [points[points.length - 1]];
    const avgTs = target.reduce((sum, point) => sum + point.ts, 0) / target.length;
    const avgValue = target.reduce((sum, point) => sum + value(point), 0) / target.length;
    let best = points[start];
    let bestArea = -1;
    for (const point of points.slice(start, end)) {
      const area = Math.abs((previous.ts - avgTs) * (value(point) - value(previous)) - (previous.ts - point.ts) * (avgValue - value(previous)));
      if (area > bestArea) [best, bestArea] = [point, area];
    }
    kept.push(best);
    previous = best;
  }
  kept.push(points[points.length - 1]);
  return kept;
}

export function heroSeries(range: string): HeroPoint[] {
  const rows = filteredWithFill(range, historialParaGrafica(historialGananciaFondo() as any) as Row[]);
  const cutoff = rangeCutoff(range)?.getTime();
  const points = rows.map((row, index) => {
    const value = toTimestamp(row.fecha);
    return { ...(row as any), ts: index === 0 && cutoff && value < cutoff ? cutoff : value };
  });
  return downsample(points, point => point.ganancia);
}

const monthYearFormatter = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });

export function periodLabel(ts: number, grain: Grain) {
  if (grain === 'year') return String(new Date(ts).getFullYear());
  if (grain === 'month') return monthYearFormatter.format(new Date(ts));
  if (grain === 'week') return `semana del ${formatTimestamp(ts)}`;
  return formatTimestamp(ts);
}

export function HeroChart({ range, onHover }: { range: string; onHover: (point: HeroPoint | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const points = useMemo(() => heroSeries(range), [range, S.historial, S.movimientos]);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  useEffect(() => {
    if (!canvas.current || !points.length) return;
    const ticks = computeCalendarTicks(points.map(point => point.ts));
    const muted = cssVar('--muted');
    const surface = cssVar('--surface');
    const [pos, neg] = [cssVar('--pos'), cssVar('--neg')];
    const gains = points.map(point => heroGain(points[0], point));
    const [low, high] = [Math.min(0, ...gains), Math.max(0, ...gains)];
    const pad = (high - low) * 0.12;
    const split = (chart: any, alpha: number) => {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return 'transparent';
      const zero = Math.min(1, Math.max(0, (scales.y.getPixelForValue(0) - chartArea.top) / chartArea.height));
      const fill = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      fill.addColorStop(0, withAlpha(pos, alpha));
      fill.addColorStop(zero, withAlpha(pos, alpha));
      fill.addColorStop(zero, withAlpha(neg, alpha));
      fill.addColorStop(1, withAlpha(neg, alpha));
      return fill;
    };

    const endDot = {
      id: 'heroEnd',
      afterDatasetsDraw(chart: Chart) {
        const end = chart.getDatasetMeta(0).data.at(-1);
        if (!end) return;
        const { ctx } = chart;
        ctx.save();
        ctx.fillStyle = gains.at(-1)! < 0 ? neg : pos;
        ctx.strokeStyle = surface;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      },
    };

    const chart = new Chart(canvas.current, {
      type: 'line',
      data: {
        datasets: [
          {
            data: points.map((point, index) => ({ x: point.ts, y: gains[index] })),
            borderColor: (context: any) => split(context.chart, 1),
            backgroundColor: (context: any) => split(context.chart, 0.18),
            fill: 'origin',
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: (context: any) => (context.parsed?.y ?? 0) < 0 ? neg : pos,
            pointHoverBorderColor: surface,
            pointHoverBorderWidth: 3,
            tension: 0,
          },
        ] as any,
      },
      plugins: [endDot, { id: 'heroCrosshair', ...crosshairHooks(muted, () => hoverRef.current(null)) }],
      options: {
        animation: false,
        events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { left: 2, right: 8, top: 8, bottom: 4 } },
        interaction: { mode: 'index', intersect: false },
        onHover: (_event: any, elements: Array<{ index: number }>) => {
          hoverRef.current(elements.length ? points[elements[0].index] : null);
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            ...xAxis(ticks),
            ticks: { display: true, color: muted, font: { size: 11 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 18, callback: (value: any) => formatTimestamp(Number(value)) },
          },
          y: {
            position: 'left',
            suggestedMin: low < 0 ? low - pad : 0,
            suggestedMax: high > 0 ? high + pad : low < 0 ? 0 : 1,
            ticks: { color: muted, font: { size: 11 }, maxTicksLimit: 5, callback: (value: any) => value === 0 ? '0' : `${signStr(value)}${compact(Math.abs(value))}` },
            grid: { color: (context: any) => context.tick?.value === 0 ? withAlpha(muted, 0.55) : cssVar('--line') },
            border: { display: false },
          },
        },
      } as any,
    });
    const stopOutsideDismiss = dismissTooltipOutside(chart, canvas.current);
    return () => {
      stopOutsideDismiss();
      chart.destroy();
    };
  }, [points, theme]);

  if (!points.length) return <div className="empty"><div className="empty-title">Sin historial</div><p className="empty-text">El gráfico aparecerá después de la primera valuación.</p></div>;

  const gain = heroGain(points[0], points.at(-1));

  return (
    <>
      <div className="hero-canvas">
        <canvas ref={canvas} role="img" aria-label="Ganancia del fondo en el período" aria-describedby="chart-hero-summary" />
      </div>
      <p className="sr-only" id="chart-hero-summary">
        En {RANGE_LABELS[range]} el fondo {gain >= 0 ? 'ganó' : 'perdió'} {fmt(Math.abs(gain))}.
      </p>
    </>
  );
}

export const CHART_PERIODS = [['week', 'Semana'], ['month', 'Mes'], ['year', 'Año']] as const;
export type Period = typeof CHART_PERIODS[number][0];
const PERIOD_LIMIT: Record<Period, number> = { week: 12, month: 12, year: Infinity };

type ParticipantRow = { fecha: string; valor: number; invertido: number; aportado_cop: number; trm: number };
export type PeriodPoint = ParticipantRow & { ts: number; periodo: number; periodo_cop: number; periodo_pct: number | null; periodo_cop_pct: number | null; aporte: number; first: boolean; gap: boolean; span: number };

function nextBucket(ts: number, period: Period) {
  const date = new Date(ts);
  if (period === 'year') return new Date(date.getFullYear() + 1, 0, 1).getTime();
  if (period === 'month') return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7).getTime();
}

const gapPoint = (ts: number): PeriodPoint => ({ fecha: '', valor: 0, invertido: 0, aportado_cop: 0, trm: 0, ts, periodo: 0, periodo_cop: 0, periodo_pct: null, periodo_cop_pct: null, aporte: 0, first: false, gap: true, span: 0 });

// Último snapshot de cada período y su ganancia contra el período anterior, sin contar aportes:
// diferencia de (valor - aportado), en USD y en COP. El primer período arranca de ganancia 0.
// Un período sin valuación queda como hueco (`gap`) para que el eje siga el calendario; la
// ganancia de ese tramo cae en el siguiente período registrado, que lleva `span` > 1.
export function periodSummary(rows: ParticipantRow[], period: Period): PeriodPoint[] {
  const lastByBucket = new Map<number, ParticipantRow>();
  for (const row of rows) {
    if (!lastByBucket.size && !row.valor && !row.invertido) continue;
    lastByBucket.set(bucketStart(toTimestamp(row.fecha), period), row);
  }
  let previous = { usd: 0, cop: 0, invertido: 0, ts: 0 };
  const points: PeriodPoint[] = [];
  for (const [ts, row] of lastByBucket) {
    let span = 1;
    if (points.length) for (let missing = nextBucket(previous.ts, period); missing < ts; missing = nextBucket(missing, period)) {
      points.push(gapPoint(missing));
      span += 1;
    }
    const trm = row.trm || S.trm || 1;
    const gain = { usd: row.valor - row.invertido, cop: row.valor * trm - row.aportado_cop };
    points.push({
      ...row,
      trm,
      ts,
      periodo: gain.usd - previous.usd,
      periodo_cop: gain.cop - previous.cop,
      periodo_pct: periodGainPct(previous.usd, gain.usd, row.valor),
      periodo_cop_pct: periodGainPct(previous.cop, gain.cop, row.valor * trm),
      aporte: row.invertido - previous.invertido,
      first: !points.length,
      gap: false,
      span,
    });
    previous = { ...gain, invertido: row.invertido, ts };
  }
  return points.slice(-PERIOD_LIMIT[period]);
}

// El período calendario en curso (esta semana, este mes o este año hasta hoy): su último snapshot,
// o null si todavía no hay valuación en él, para no presentar el período anterior como el actual.
export function currentPeriodPoint(points: PeriodPoint[], period: Period, today = todayLocal()) {
  const last = points.at(-1);
  return last && last.ts === bucketStart(toTimestamp(today), period) ? last : null;
}

const monthLongFormatter = new Intl.DateTimeFormat('es-CO', { month: 'long' });

export function periodToDateLabel(point: PeriodPoint, period: Period) {
  if (period === 'week') return `Esta semana (desde el ${formatTimestamp(point.ts)})`;
  if (period === 'year') return `${new Date(point.ts).getFullYear()} a la fecha`;
  const month = monthLongFormatter.format(new Date(point.ts));
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} al ${Number(point.fecha.slice(8, 10))}`;
}

export function fitBarThickness(width: number, count: number, perGroup: number, max: number) {
  return Math.max(4, Math.min(max, Math.floor(width / Math.max(count, 1) * 0.72 / perGroup)));
}

const monthShortFormatter = new Intl.DateTimeFormat('es-CO', { month: 'short' });

function barLabel(ts: number, period: Period) {
  const date = new Date(ts);
  if (period === 'year') return String(date.getFullYear());
  if (period === 'week') return formatTimestamp(ts);
  return `${monthShortFormatter.format(date).replace('.', '')} ${String(date.getFullYear()).slice(2)}`;
}

// Rangos por eje para dos series de escalas distintas (USD y COP) con el cero a la misma altura:
// ambos ejes reservan la misma fracción `below` para negativos, la mayor que pida cualquiera.
export function alignedRanges(series: number[][], grace = 0.15) {
  const extents = series.map(values => ({ pos: Math.max(0, ...values), neg: Math.max(0, ...values.map(value => -value)) }));
  const below = Math.min(0.9, Math.max(0, ...extents.map(({ pos, neg }) => pos + neg > 0 ? neg / (pos + neg) : 0)));
  return extents.map(({ pos, neg }) => {
    const span = Math.max(pos / (1 - below), below > 0 ? neg / below : 0, 1) * (1 + grace);
    return { min: -below * span, max: (1 - below) * span };
  });
}

const signedMoney = (value: number, unit: string) => `${signStr(value)}${unit} ${compact(Math.abs(value))}`;

type Pad = { left: number; right: number };
const samePad = (a: Pad, b: Pad) => Math.abs(a.left - b.left) < 0.5 && Math.abs(a.right - b.right) < 0.5;

function barOptions(onArea: (pad: Pad) => void, thickness: (width: number) => number) {
  return {
    animation: false as const,
    events: [],
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 10, left: 0, right: 0, bottom: 2 } },
    onResize: (chart: Chart, size: { width: number }) => { chart.data.datasets.forEach((dataset: any) => { dataset.barThickness = thickness(size.width); }); },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: {
        beginAtZero: true,
        ticks: { display: false, maxTicksLimit: 4 },
        grid: { drawTicks: false, color: (context: any) => context.tick?.value === 0 ? withAlpha(cssVar('--muted'), 0.55) : cssVar('--line') },
        border: { display: false },
      },
    },
    _onArea: onArea,
  };
}

// Reporta el chartArea para alinear las filas HTML del eje con el centro de cada categoría.
const areaSync = { id: 'areaSync', afterLayout: (chart: any) => chart.options._onArea?.({ left: chart.chartArea.left, right: chart.width - chart.chartArea.right }) };

// Chips sobre el cero en los períodos sin barras: "Inicio" en el primero (su ganancia siempre sería
// 0) y "Sin valor" donde no hubo valuación. Si el chip no entra en el ancho del período, queda "—".
function periodChips(points: PeriodPoint[], withStart: boolean) {
  return {
    id: 'periodChips',
    afterDatasetsDraw(chart: Chart) {
      const { ctx, chartArea } = chart;
      const slot = chartArea.width / Math.max(points.length, 1);
      const y = Math.min(chart.scales.y.getPixelForValue(0), chartArea.bottom - 11);
      ctx.save();
      ctx.font = '650 10px Geist Variable, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      points.forEach((point, index) => {
        const label = point.gap ? 'Sin valor' : withStart && point.first ? 'Inicio' : '';
        if (!label) return;
        const text = ctx.measureText(label).width + 14 <= slot - 4 ? label : '—';
        const width = ctx.measureText(text).width + 14;
        const x = chart.scales.x.getPixelForValue(index);
        ctx.fillStyle = cssVar('--surface-2');
        ctx.strokeStyle = cssVar('--line');
        ctx.beginPath();
        ctx.roundRect(x - width / 2, y - 9, width, 18, 9);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = cssVar('--muted');
        ctx.fillText(text, x, y + 0.5);
      });
      ctx.restore();
    },
  };
}

function totalsChart(canvas: HTMLCanvasElement, points: PeriodPoint[], onArea: (pad: Pad) => void) {
  const thickness = (width: number) => fitBarThickness(width, points.length, 1, 44);
  const initial = thickness(canvas.parentElement?.clientWidth ?? 600);
  const segment = { barThickness: initial, grouped: false, borderSkipped: 'start' as const };
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: points.map(point => point.ts),
      datasets: [
        { label: 'Aportado', data: points.map(point => point.gap ? null : [0, Math.max(0, Math.min(point.invertido, point.valor))]), backgroundColor: withAlpha(cssVar('--muted'), 0.45), ...segment },
        { label: 'Ganancia', data: points.map(point => !point.gap && point.valor > point.invertido ? [Math.max(0, point.invertido), point.valor] : null), backgroundColor: withAlpha(cssVar('--pos'), 0.7), borderRadius: 4, ...segment },
        { label: 'Pérdida', data: points.map(point => !point.gap && point.valor < point.invertido ? [Math.max(0, point.valor), point.invertido] : null), backgroundColor: withAlpha(cssVar('--neg'), 0.7), borderRadius: 4, ...segment },
      ] as any,
    },
    plugins: [areaSync, periodChips(points, false)],
    options: barOptions(onArea, thickness) as any,
  });
}

const COP_ALPHA = 0.45;

function gainChart(canvas: HTMLCanvasElement, points: PeriodPoint[], onArea: (pad: Pad) => void) {
  const usd = points.map(point => point.first || point.gap ? null : point.periodo);
  const cop = points.map(point => point.first || point.gap ? null : point.periodo_cop);
  const [usdRange, copRange] = alignedRanges([usd.map(Number), cop.map(Number)]);
  const pos = cssVar('--pos');
  const neg = cssVar('--neg');
  const colors = (values: Array<number | null>, alpha: number) => values.map(value => withAlpha((value ?? 0) >= 0 ? pos : neg, alpha));
  const thickness = (width: number) => fitBarThickness(width, points.length, 2, 26);
  const options = barOptions(onArea, thickness) as any;
  options.scales.y = { ...options.scales.y, min: usdRange.min, max: usdRange.max };
  options.scales.y1 = { display: false, min: copRange.min, max: copRange.max };
  // Con barThickness fijo Chart.js junta las barras del grupo sin espacio; el borde transparente
  // deja una separación de 2px sin volver al reparto por categoría que las separaba demasiado.
  const bars = { barThickness: thickness(canvas.parentElement?.clientWidth ?? 600), borderRadius: 4, borderWidth: { left: 1, right: 1 }, borderColor: 'transparent' };
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: points.map(point => point.ts),
      datasets: [
        { label: 'USD', data: usd, yAxisID: 'y', backgroundColor: colors(usd, 1), ...bars },
        { label: 'COP', data: cop, yAxisID: 'y1', backgroundColor: colors(cop, COP_ALPHA), ...bars },
      ] as any,
    },
    plugins: [areaSync, periodChips(points, true)],
    options,
  });
}

function AxisRow({ points, period, pad, render }: { points: PeriodPoint[]; period: Period; pad: Pad; render: (point: PeriodPoint) => ReactNode }) {
  return (
    <div className="bar-axis" style={{ paddingLeft: pad.left, paddingRight: pad.right }}>
      {points.map(point => (
        <div
          key={point.ts}
          className={`bar-axis-item${point.gap ? ' gap' : ''}`}
        >
          <span className="bar-axis-label">{barLabel(point.ts, period)}</span>
          <span className="bar-axis-values">{render(point)}</span>
        </div>
      ))}
    </div>
  );
}

const NO_PAD: Pad = { left: 0, right: 0 };
const SPAN_UNITS: Record<Period, string> = { week: 'semanas', month: 'meses', year: 'años' };

export function ParticipantBars({ name, period, points }: { name: string; period: Period; points: PeriodPoint[] }) {
  const totals = useRef<HTMLCanvasElement>(null);
  const gains = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const [pads, setPads] = useState<[Pad, Pad]>([NO_PAD, NO_PAD]);
  const scrollers = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (!totals.current || !gains.current || !points.length) return;
    const area = (slot: 0 | 1) => (pad: Pad) => setPads(current => samePad(current[slot], pad) ? current : (slot ? [current[0], pad] : [pad, current[1]]));
    const charts = [totalsChart(totals.current, points, area(0)), gainChart(gains.current, points, area(1))];
    return () => charts.forEach(chart => chart.destroy());
  }, [name, period, points, theme]);

  useEffect(() => {
    scrollers.current.forEach(scroller => { if (scroller) scroller.scrollLeft = scroller.scrollWidth; });
  }, [points]);

  // En pantallas angostas cada gráfica se desliza (4 períodos a la vista); las dos se mueven juntas
  // para que los períodos sigan alineados.
  const syncScroll = (source: HTMLDivElement) => scrollers.current.forEach(scroller => {
    if (scroller && scroller !== source && scroller.scrollLeft !== source.scrollLeft) scroller.scrollLeft = source.scrollLeft;
  });
  const scroller = (slot: 0 | 1, children: ReactNode) => (
    <div className="bar-scroll" ref={element => { scrollers.current[slot] = element; }} onScroll={event => syncScroll(event.currentTarget)}>
      <div className="bar-scroll-inner" style={{ '--periods': points.length } as CSSProperties}>{children}</div>
    </div>
  );

  if (!points.length) return <div className="empty"><div className="empty-title">Sin historial</div></div>;
  const last = points.at(-1)!;

  return (
    <>
      {scroller(0, <>
        <div className="chart-wrap">
          <canvas ref={totals} role="img" aria-label={`Aportado y valor de ${name} por período`} aria-describedby="chart-persona-summary" />
        </div>
        <AxisRow points={points} period={period} pad={pads[0]} render={point => point.gap ? null : (
          <>
            <b>US$ {compact(point.valor)}</b>
            <small className={`flow ${tone(point.aporte)}`}>{point.aporte ? signedMoney(point.aporte, 'US$') : '·'}</small>
          </>
        )} />
      </>)}
      <div className="bar-legend">
        <span><i className="sw-contrib" />Aportado</span>
        <span><i className="sw-gain" />Ganancia</span>
        <span><i className="sw-loss" />Pérdida</span>
      </div>
      <div className="chart-subtitle">Ganancia del período</div>
      {scroller(1, <>
        <div className="chart-wrap gain-wrap">
          <canvas ref={gains} role="img" aria-label={`Ganancia en dólares y pesos de ${name} por período`} aria-describedby="chart-persona-summary" />
        </div>
        <AxisRow points={points} period={period} pad={pads[1]} render={point => point.first || point.gap ? null : (
          <>
            <b className={tone(point.periodo)}>{signedMoney(point.periodo, 'US$')}</b>
            <small className={`cop ${tone(point.periodo_cop)}`}>{signedMoney(point.periodo_cop, '$')}</small>
            {point.span > 1 && <small className="span">{point.span} {SPAN_UNITS[period]}</small>}
          </>
        )} />
      </>)}
      <div className="bar-legend">
        <span><i className="sw-usd" />USD</span>
        <span><i className="sw-cop" />COP</span>
      </div>
      <p className="sr-only" id="chart-persona-summary" aria-live="polite">
        En {periodLabel(last.ts, period)} {name} tiene {fmt(last.valor)} con {fmt(last.invertido)} aportado; el período {last.periodo >= 0 ? 'ganó' : 'perdió'} {fmt(Math.abs(last.periodo))} y {COP(Math.round(Math.abs(last.periodo_cop)))}.
      </p>
    </>
  );
}
