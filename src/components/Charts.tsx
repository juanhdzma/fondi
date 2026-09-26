import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart } from 'chart.js/auto';
import { historialGananciaFondo, historialParaGrafica, historialParticipante, participanteColor } from '../computed.js';
import { S } from '../state.js';
import { laneLayout } from '../utils/lanes.js';
import { compact, fmt, fmt0 } from '../utils/format.js';
import { fmtDateShort, todayLocal } from '../utils/dates.js';
import { useReducedMotion } from 'motion/react';
import { cssVar, useTheme, withAlpha } from '../theme';

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

export function periodPct(data: Row[], key: string) {
  if (data.length < 2) return null;
  const start = Number(data[0][key]);
  const end = Number(data.at(-1)?.[key]);
  return start > 0 ? (end - start) / start * 100 : null;
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

export type HeroPoint = { ts: number; fecha: string; valor: number; aportado: number; ganancia: number; precio_cuota: number; trm: number };

export function heroSeries(range: string): HeroPoint[] {
  const rows = filteredWithFill(range, historialParaGrafica(historialGananciaFondo() as any) as Row[]);
  const cutoff = rangeCutoff(range)?.getTime();
  return rows.map((row, index) => {
    const value = toTimestamp(row.fecha);
    return { ...(row as any), ts: index === 0 && cutoff && value < cutoff ? cutoff : value };
  });
}

type LaneChip = { x: number; lane: number; amount: number; people: string[]; count: number; ts: number };
type Overlay = { width: number; left: number; right: number; bottom: number; chips: LaneChip[]; ends: Array<{ y: number; kind: string }> };

const LANE_GAP = 62;
const END_LABELS_MIN_WIDTH = 560;

function eventsIn(points: HeroPoint[]) {
  if (points.length < 2) return [];
  const [from, to] = [points[0].ts, points.at(-1)!.ts];
  const byDay = new Map<string, { ts: number; amount: number; people: string[]; count: number }>();
  for (const movement of S.movimientos) {
    const ts = toTimestamp(movement.fecha);
    if (ts < from || ts > to) continue;
    const key = movement.fecha.slice(0, 10);
    const entry = byDay.get(key) ?? { ts, amount: 0, people: [], count: 0 };
    entry.amount += movement.tipo === 'retiro' ? -movement.monto : movement.monto;
    if (!entry.people.includes(movement.persona)) entry.people.push(movement.persona);
    entry.count += 1;
    byDay.set(key, entry);
  }
  return [...byDay.values()];
}

const sameOverlay = (a: Overlay | null, b: Overlay) => JSON.stringify(a) === JSON.stringify(b);

export function HeroChart({ range, onHover }: { range: string; onHover: (point: HeroPoint | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const points = useMemo(() => heroSeries(range), [range, S.historial, S.movimientos]);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  useEffect(() => {
    if (!canvas.current || !points.length) return;
    const ticks = computeCalendarTicks(points.map(point => point.ts));
    const accent = cssVar('--accent');
    const muted = cssVar('--muted');
    const events = eventsIn(points);
    const wide = () => (canvas.current?.parentElement?.clientWidth ?? 0) >= END_LABELS_MIN_WIDTH;

    const overlayPlugin = {
      id: 'heroOverlay',
      afterUpdate(chart: Chart) {
        const { chartArea, scales } = chart;
        if (!chartArea) return;
        const chips = laneLayout(events.map(event => ({ ...event, x: scales.x.getPixelForValue(event.ts) })), LANE_GAP) as LaneChip[];
        const last = points.at(-1)!;
        const next: Overlay = {
          width: chart.width,
          left: chartArea.left,
          right: chartArea.right,
          bottom: chartArea.bottom,
          chips,
          ends: [
            { y: scales.y.getPixelForValue(last.valor), kind: 'valor' },
            { y: scales.y.getPixelForValue((last.valor + last.aportado) / 2), kind: 'ganancia' },
            { y: scales.y.getPixelForValue(last.aportado), kind: 'aportado' },
          ],
        };
        setOverlay(current => sameOverlay(current, next) ? current : next);
      },
      afterDatasetsDraw(chart: Chart) {
        const active = chart.getActiveElements()[0];
        if (!active) return;
        const { ctx, chartArea } = chart;
        const x = active.element.x;
        ctx.save();
        ctx.strokeStyle = muted;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      },
      afterEvent(chart: Chart, args: any) {
        if (args.event.type === 'mouseout') {
          chart.setActiveElements([]);
          hoverRef.current(null);
        }
      },
    };

    const chart = new Chart(canvas.current, {
      type: 'line',
      data: {
        datasets: [
          {
            data: points.map(point => ({ x: point.ts, y: point.valor })),
            borderColor: accent,
            backgroundColor: (context: any) => gradient(context.chart, accent),
            fill: true,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: accent,
            pointHoverBorderColor: cssVar('--surface'),
            pointHoverBorderWidth: 3,
            tension: 0,
          },
          {
            data: points.map(point => ({ x: point.ts, y: point.aportado })),
            borderColor: muted,
            borderDash: [5, 5],
            borderWidth: 1.5,
            stepped: 'after',
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
          },
        ] as any,
      },
      plugins: [overlayPlugin],
      options: {
        animation: reduced ? false : { duration: 900, easing: 'easeOutQuart' },
        events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { left: 2, right: wide() ? 116 : 4, top: 8, bottom: events.length ? 64 : 4 } },
        interaction: { mode: 'index', intersect: false },
        onHover: (_event: any, elements: Array<{ index: number }>) => {
          hoverRef.current(elements.length ? points[elements[0].index] : null);
        },
        onResize: (chart: Chart, size: { width: number }) => {
          const right = size.width >= END_LABELS_MIN_WIDTH ? 116 : 4;
          const padding = (chart.options.layout as any).padding;
          if (padding.right !== right) {
            padding.right = right;
            chart.update('none');
          }
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            ...xAxis(ticks),
            ticks: { display: true, color: muted, font: { size: 11 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 18, callback: (value: any) => formatTimestamp(Number(value)) },
          },
          y: {
            position: 'left',
            grace: '8%',
            ticks: { color: muted, font: { size: 11 }, maxTicksLimit: 5, callback: (value: any) => compact(value) },
            grid: { color: cssVar('--line') },
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
  }, [points, range, theme, reduced]);

  if (!points.length) return <div className="empty"><div className="empty-title">Sin historial</div><p className="empty-text">El gráfico aparecerá después de la primera valuación.</p></div>;

  const first = points[0];
  const last = points.at(-1)!;
  const trend = last.valor > first.valor ? 'subió' : last.valor < first.valor ? 'bajó' : 'se mantuvo';
  const showEnds = overlay && overlay.width >= END_LABELS_MIN_WIDTH;
  const endText: Record<string, [string, string]> = {
    valor: [`Valor ${compact(last.valor)}`, 'end-valor'],
    ganancia: [`${last.ganancia >= 0 ? '+' : '−'}${compact(Math.abs(last.ganancia))} ganancia`, last.ganancia >= 0 ? 'end-pos' : 'end-neg'],
    aportado: [`Aportado ${compact(last.aportado)}`, 'end-muted'],
  };

  return (
    <>
      <div className="hero-canvas">
        <canvas ref={canvas} role="img" aria-label="Valor del fondo y total aportado" aria-describedby="chart-hero-summary" />
        {overlay && (
          <div className="hero-overlay" aria-hidden="true">
            {showEnds && overlay.ends.map(end => (
              <span key={end.kind} className={`end-label ${endText[end.kind][1]}`} style={{ left: overlay.right + 10, top: end.y }}>{endText[end.kind][0]}</span>
            ))}
            {overlay.chips.map(chip => (
              <span
                key={chip.ts}
                className={`lane-chip ${chip.amount >= 0 ? 'pos' : 'neg'}`}
                style={{ left: chip.x, top: overlay.bottom + 26 + chip.lane * 26 }}
                title={`${chip.people.join(', ')} · ${chip.amount >= 0 ? '+' : '−'}${fmt0(Math.abs(chip.amount))} · ${formatTimestamp(chip.ts)}`}
              >
                <span className="lane-avatars">{chip.people.slice(0, 3).map(name => <span key={name} style={{ background: participanteColor(name) }}>{name.charAt(0).toUpperCase()}</span>)}</span>
                {chip.amount >= 0 ? '+' : '−'}{compact(Math.abs(chip.amount))}
                {chip.count > 1 && <small>×{chip.count}</small>}
              </span>
            ))}
          </div>
        )}
      </div>
      {!showEnds && (
        <div className="hero-legend">
          <span><i className="dot-valor" />{endText.valor[0]}</span>
          <span className={endText.ganancia[1]}><i className="dot-ganancia" />{endText.ganancia[0]}</span>
          <span><i className="dash" />{endText.aportado[0]}</span>
        </div>
      )}
      <p className="sr-only" id="chart-hero-summary" aria-live="polite">
        Valor del fondo en {RANGE_LABELS[range]}: {trend} de {fmt(first.valor)} a {fmt(last.valor)}. Aportado neto: {fmt(last.aportado)}.
      </p>
    </>
  );
}

function personaTooltip({ chart, tooltip: model }: any) {
  let element = document.getElementById('persona-tooltip');
  if (!element) {
    element = document.createElement('div');
    element.id = 'persona-tooltip';
    document.body.appendChild(element);
  }
  if (model.opacity === 0) {
    element.style.opacity = '0';
    return;
  }
  element.replaceChildren();
  for (const point of model.dataPoints) {
    const line = document.createElement('div');
    const label = document.createElement('b');
    label.textContent = point.dataset.label;
    line.append(label, `: ${fmt(point.parsed.y)}`);
    element.appendChild(line);
  }
  const date = document.createElement('div');
  date.className = 'persona-tooltip-date';
  date.textContent = model.dataPoints.length ? formatTimestamp(model.dataPoints[0].parsed.x) : '';
  element.appendChild(date);
  const rect = chart.canvas.getBoundingClientRect();
  element.style.opacity = '1';
  element.style.left = `${rect.left + window.scrollX + model.caretX}px`;
  element.style.top = `${rect.top + window.scrollY + model.caretY}px`;
}

export function ParticipantChart({ name, range }: { name: string; range: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const rows = filteredWithFill(range, historialParticipante(name) as Row[]);

  useEffect(() => {
    if (!canvas.current || !rows.length) return;
    const cutoff = rangeCutoff(range)?.getTime();
    const timestamps = rows.map((row, index) => {
      const value = toTimestamp(row.fecha);
      return index === 0 && cutoff && value < cutoff ? cutoff : value;
    });
    const ticks = computeCalendarTicks(timestamps);
    const current = rows.map((row, index) => ({ x: timestamps[index], y: row.valor }));
    const invested = rows.map((row, index) => ({ x: timestamps[index], y: row.invertido }));
    const options = standardOptions(ticks) as any;
    options.plugins.legend = {
      display: true,
      position: 'bottom',
      labels: { color: cssVar('--muted'), font: { size: 13 }, padding: 14, usePointStyle: true },
    };
    options.plugins.tooltip = { enabled: false, external: personaTooltip };
    const chart = new Chart(canvas.current, {
      type: 'line',
      data: {
        datasets: [
          { ...dataset(current, participanteColor(name)), label: 'Valor actual', fill: false },
          { ...dataset(invested, cssVar('--muted')), label: 'Invertido', fill: false, borderDash: [5, 5] },
        ] as any,
      },
      options,
    });
    const stopOutsideDismiss = dismissTooltipOutside(chart, canvas.current);
    return () => {
      stopOutsideDismiss();
      chart.destroy();
      document.getElementById('persona-tooltip')?.remove();
    };
  }, [name, range, rows, theme]);

  if (!rows.length) return <div className="empty"><div className="empty-title">Sin historial</div></div>;
  const first = rows[0];
  const last = rows.at(-1)!;
  const trend = last.valor > first.valor ? 'subió' : last.valor < first.valor ? 'bajó' : 'se mantuvo';

  return (
    <>
      <canvas ref={canvas} role="img" aria-label={`Evolución de ${name}`} aria-describedby="chart-persona-summary" />
      <p className="sr-only" id="chart-persona-summary" aria-live="polite">
        La inversión de {name} en {RANGE_LABELS[range]} {trend} de {fmt(first.valor)} a {fmt(last.valor)}.
      </p>
    </>
  );
}
