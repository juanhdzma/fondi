import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart } from 'chart.js/auto';
import { historialGananciaFondo, historialParaGrafica, historialParticipante, participanteColor } from '../computed.js';
import { S } from '../state.js';
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

function crosshairHooks(color: string, onLeave: () => void) {
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

export type HeroPoint = { ts: number; fecha: string; valor: number; aportado: number; ganancia: number; precio_cuota: number; trm: number };

export type Grain = 'day' | 'week' | 'month';

export function grainFor(spanDays: number): Grain {
  return spanDays > 150 ? 'month' : spanDays > 45 ? 'week' : 'day';
}

export function bucketStart(ts: number, grain: Grain) {
  const date = new Date(ts);
  if (grain === 'month') return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  const back = grain === 'week' ? (date.getDay() + 6) % 7 : 0;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back).getTime();
}

// Resume la serie a un punto por semana o mes quedándose con el último snapshot real de cada
// período (no un promedio): se pierde detalle, pero cada punto seleccionable dice lo que el
// fondo valía ese día.
export function downsample<T extends { ts: number }>(points: T[], grain: Grain) {
  if (grain === 'day' || points.length < 3) return points;
  const kept = [points[0]];
  for (let index = 1; index < points.length; index++) {
    const next = points[index + 1];
    if (!next || bucketStart(next.ts, grain) !== bucketStart(points[index].ts, grain)) kept.push(points[index]);
  }
  return kept;
}

const spanGrain = (points: Array<{ ts: number }>) => grainFor(points.length ? (points.at(-1)!.ts - points[0].ts) / 86400000 : 0);

export function heroSeries(range: string): HeroPoint[] {
  const rows = filteredWithFill(range, historialParaGrafica(historialGananciaFondo() as any) as Row[]);
  const cutoff = rangeCutoff(range)?.getTime();
  const points = rows.map((row, index) => {
    const value = toTimestamp(row.fecha);
    return { ...(row as any), ts: index === 0 && cutoff && value < cutoff ? cutoff : value };
  });
  return downsample(points, spanGrain(points));
}

// La línea de aportado usa todas las valuaciones, incluida la del día de un retiro que
// historialParaGrafica() omite de la línea de valor: sin ella el escalón bajaba una semana tarde.
function contributedSeries(range: string, grain: Grain) {
  const rows = filteredWithFill(range, historialGananciaFondo() as any) as Row[];
  const cutoff = rangeCutoff(range)?.getTime();
  return downsample(rows.map((row, index) => {
    const value = toTimestamp(row.fecha);
    return { ts: index === 0 && cutoff && value < cutoff ? cutoff : value, aportado: Number(row.aportado) };
  }), grain);
}

const monthYearFormatter = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });

function periodLabel(ts: number, grain: Grain) {
  if (grain === 'month') return monthYearFormatter.format(new Date(ts));
  if (grain === 'week') return `semana del ${formatTimestamp(ts)}`;
  return formatTimestamp(ts);
}

type Marker = { x: number; y: number; amount: number; count: number; ts: number; label: string };
type Overlay = { width: number; left: number; right: number; bottom: number; markers: Marker[]; ends: Array<{ y: number; kind: string }> };

const END_LABELS_MIN_WIDTH = 560;

function eventsIn(points: HeroPoint[], grain: Grain) {
  if (points.length < 2) return [];
  const [from, to] = [points[0].ts, points.at(-1)!.ts];
  const byBucket = new Map<number, { ts: number; amount: number; count: number; label: string }>();
  for (const movement of S.movimientos) {
    const ts = toTimestamp(movement.fecha);
    if (ts < from || ts > to) continue;
    const bucket = bucketStart(ts, grain);
    const entry = byBucket.get(bucket) ?? { ts, amount: 0, count: 0, label: '' };
    entry.ts = Math.max(entry.ts, ts);
    entry.amount += movement.tipo === 'retiro' ? -movement.monto : movement.monto;
    entry.count += 1;
    entry.label = entry.count > 1 ? periodLabel(bucket, grain) : formatTimestamp(ts);
    byBucket.set(bucket, entry);
  }
  return [...byBucket.values()];
}

// Separa etiquetas verticales que quedarían encimadas: las ordena y empuja hacia abajo la
// que esté a menos de `gap` px de la anterior.
export function spreadLabels<T extends { y: number }>(labels: T[], gap: number) {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index].y - sorted[index - 1].y < gap) sorted[index] = { ...sorted[index], y: sorted[index - 1].y + gap };
  }
  return sorted;
}

// Valor de la línea en un instante dado, interpolando entre los dos puntos que lo rodean: el
// snapshot del día de un retiro se omite del gráfico, así que su marcador cae entre puntos.
export function valueAt(points: Array<{ ts: number; valor: number }>, ts: number) {
  if (!points.length) return 0;
  const after = points.findIndex(point => point.ts >= ts);
  if (after === -1) return points[points.length - 1].valor;
  if (after === 0) return points[0].valor;
  const [left, right] = [points[after - 1], points[after]];
  return left.valor + (right.valor - left.valor) * (ts - left.ts) / (right.ts - left.ts);
}

const sameOverlay = (a: Overlay | null, b: Overlay) => JSON.stringify(a) === JSON.stringify(b);

export function HeroChart({ range, onHover }: { range: string; onHover: (point: HeroPoint | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [activeMarker, setActiveMarker] = useState<number | null>(null);
  const points = useMemo(() => heroSeries(range), [range, S.historial, S.movimientos]);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  useEffect(() => {
    if (!canvas.current || !points.length) return;
    const ticks = computeCalendarTicks(points.map(point => point.ts));
    const accent = cssVar('--accent');
    const muted = cssVar('--muted');
    const grain = spanGrain(points);
    const events = eventsIn(points, grain);
    const contributed = contributedSeries(range, grain);
    const values = [...points.map(point => point.valor), ...contributed.map(point => point.aportado)];
    const [low, high] = [Math.min(...values), Math.max(...values)];
    const pad = (high - low) * 0.08;
    const wide = () => (canvas.current?.parentElement?.clientWidth ?? 0) >= END_LABELS_MIN_WIDTH;

    const overlayPlugin = {
      id: 'heroOverlay',
      afterUpdate(chart: Chart) {
        const { chartArea, scales } = chart;
        if (!chartArea) return;
        const markers = events.map(event => ({
          x: scales.x.getPixelForValue(event.ts),
          y: scales.y.getPixelForValue(valueAt(points, event.ts)),
          amount: event.amount,
          count: event.count,
          ts: event.ts,
          label: event.label,
        }));
        const last = points.at(-1)!;
        const next: Overlay = {
          width: chart.width,
          left: chartArea.left,
          right: chartArea.right,
          bottom: chartArea.bottom,
          markers,
          ends: spreadLabels([
            { y: scales.y.getPixelForValue(last.valor), kind: 'valor' },
            { y: scales.y.getPixelForValue((last.valor + last.aportado) / 2), kind: 'ganancia' },
            { y: scales.y.getPixelForValue(last.aportado), kind: 'aportado' },
          ], 17),
        };
        setOverlay(current => sameOverlay(current, next) ? current : next);
      },
      ...crosshairHooks(muted, () => hoverRef.current(null)),
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
            data: contributed.map(point => ({ x: point.ts, y: point.aportado })),
            borderColor: muted,
            borderDash: [5, 5],
            borderWidth: 1.5,
            stepped: 'before',
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
        layout: { padding: { left: 2, right: wide() ? 116 : 4, top: 8, bottom: 4 } },
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
            suggestedMin: low >= 0 ? Math.max(0, low - pad) : low - pad,
            suggestedMax: high + pad,
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
  const tipMarker = overlay?.markers.find(marker => marker.ts === activeMarker);
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
            {overlay.markers.map(marker => (
              <span
                key={marker.ts}
                className={`event-mark ${marker.amount >= 0 ? 'pos' : 'neg'}`}
                style={{ left: marker.x, top: marker.y }}
                onPointerEnter={() => setActiveMarker(marker.ts)}
                onPointerLeave={() => setActiveMarker(null)}
                onClick={() => setActiveMarker(current => current === marker.ts ? null : marker.ts)}
              />
            ))}
            {tipMarker && (
              <span className="event-tip" style={{ left: tipMarker.x, top: tipMarker.y }}>
                <small className={tipMarker.amount >= 0 ? 'pos' : 'neg'}>{tipMarker.count > 1 ? `${tipMarker.count} movimientos · neto` : tipMarker.amount >= 0 ? 'Aporte' : 'Retiro'}</small>
                <b>{tipMarker.amount >= 0 ? '+' : '−'}{fmt0(Math.abs(tipMarker.amount))}</b>
                <span>{tipMarker.label}</span>
              </span>
            )}
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

export type ParticipantPoint = { fecha: string; valor: number; invertido: number; trm: number };

export function ParticipantChart({ name, range, onHover }: { name: string; range: string; onHover: (point: ParticipantPoint | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
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
      labels: { color: cssVar('--muted'), font: { size: 12 }, padding: 14, usePointStyle: true, pointStyle: 'line' },
    };
    options.plugins.tooltip = { enabled: false };
    options.events = ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'];
    options.onHover = (_event: any, elements: Array<{ index: number }>) => {
      hoverRef.current(elements.length ? rows[elements[0].index] as ParticipantPoint : null);
    };
    const muted = cssVar('--muted');
    const chart = new Chart(canvas.current, {
      type: 'line',
      data: {
        datasets: [
          { ...dataset(current, participanteColor(name)), label: 'Valor actual', fill: false, borderWidth: 2.5, pointRadius: 0 },
          { ...dataset(invested, cssVar('--muted')), label: 'Invertido', fill: false, borderDash: [5, 5], borderWidth: 1.5, stepped: 'before', pointRadius: 0, pointHoverRadius: 0 },
        ] as any,
      },
      plugins: [{ id: 'participantCrosshair', ...crosshairHooks(muted, () => hoverRef.current(null)) }],
      options,
    });
    const stopOutsideDismiss = dismissTooltipOutside(chart, canvas.current);
    return () => {
      stopOutsideDismiss();
      chart.destroy();
      hoverRef.current(null);
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
