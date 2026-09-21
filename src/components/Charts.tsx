import { useEffect, useMemo, useRef } from 'react';
import { Chart } from 'chart.js/auto';
import { S } from '../state.js';
import { historialGananciaFondo, historialParaGrafica, historialParticipante, participanteColor } from '../computed.js';
import { fmt, fmtPct } from '../utils/format.js';
import { fmtDateShort, todayLocal } from '../utils/dates.js';

export const RANGE_LABELS: Record<string, string> = {
  '1W': '1 semana',
  '2W': '2 semanas',
  '1M': '1 mes',
  '3M': '3 meses',
  '6M': '6 meses',
  '1A': '1 año',
  todo: 'todo el periodo',
};

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

function withoutWithdrawalSnapshots<T extends Row>(source: T[]) {
  const withdrawals = new Set(S.movimientos.filter(movement => movement.tipo === 'retiro').map(movement => movement.fecha));
  return source.filter(row => !withdrawals.has(row.fecha));
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
  if (!chartArea) return `${color}22`;
  const fill = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  fill.addColorStop(0, `${color}44`);
  fill.addColorStop(1, `${color}00`);
  return fill;
}

const tooltip = {
  backgroundColor: '#FFFFFF',
  borderColor: '#E7E7EA',
  borderWidth: 1,
  bodyColor: '#0C0D0F',
  footerColor: '#9AA0A6',
  padding: 12,
  bodyFont: { size: 15, weight: '700' as const },
  footerFont: { size: 11, weight: '600' as const },
  footerMarginTop: 4,
};

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

export function splitAtZero(points: Point[]) {
  const result: Point[] = [];
  for (let index = 0; index < points.length; index += 1) {
    result.push(points[index]);
    const current = points[index];
    const next = points[index + 1];
    if (next && (current.y < 0) !== (next.y < 0)) {
      const ratio = current.y / (current.y - next.y);
      result.push({ x: current.x + (next.x - current.x) * ratio, y: 0, interpolated: true });
    }
  }
  return result;
}

const gainColor = (context: any) => {
  const end = context.p1.parsed.y;
  const value = end !== 0 ? end : context.p0.parsed.y;
  return value >= 0 ? '#17803D' : '#B4231F';
};

function gainDataset(rawPoints: Point[]) {
  const radius = pointRadius(rawPoints.length);
  return {
    data: splitAtZero(rawPoints),
    borderWidth: 3,
    fill: true,
    segment: {
      borderColor: gainColor,
      backgroundColor: (context: any) => `${gainColor(context)}22`,
    },
    pointRadius: (context: any) => context.raw?.interpolated ? 0 : radius,
    pointHoverRadius: (context: any) => context.raw?.interpolated ? 0 : radius + 2,
    pointBackgroundColor: (context: any) => (context.raw?.y ?? 0) >= 0 ? '#17803D' : '#B4231F',
    pointHoverBackgroundColor: (context: any) => (context.raw?.y ?? 0) >= 0 ? '#17803D' : '#B4231F',
    tension: 0,
  };
}

function standardOptions(ticks: number[]) {
  return {
    animation: false as const,
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { left: 4, right: 4, top: 4 } },
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltip,
        callbacks: {
          title: () => '',
          label: (context: any) => ` ${fmt(context.parsed.y)} USD`,
          footer: (items: any[]) => items.length ? formatTimestamp(items[0].parsed.x) : '',
        },
      },
    },
    scales: {
      x: xAxis(ticks),
      y: {
        position: 'right' as const,
        ticks: { color: '#6E6F76', font: { size: 13 }, callback: (value: any) => fmt(value) },
        grid: { color: '#E7E7EA' },
        border: { display: false },
      },
    },
  };
}

function quotaOptions(ticks: number[]) {
  return {
    ...standardOptions(ticks),
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: { color: '#6E6F76', font: { size: 14 }, padding: 14, usePointStyle: true },
      },
      tooltip: {
        ...tooltip,
        callbacks: {
          title: () => '',
          label: (context: any) => ` ${context.parsed.y >= 0 ? '+' : ''}${fmtPct(context.parsed.y)}% ${context.datasetIndex === 0 ? 'USD' : 'COP'}`,
          footer: (items: any[]) => items.length ? formatTimestamp(items[0].parsed.x) : '',
        },
      },
    },
    scales: {
      x: xAxis(ticks),
      y: {
        position: 'right' as const,
        ticks: { color: '#6E6F76', font: { size: 13 }, callback: (value: any) => `${Number(value) >= 0 ? '+' : ''}${fmtPct(Number(value))}%` },
        grid: { color: '#E7E7EA' },
        border: { display: false },
      },
    },
  };
}

export function HeroChart({ range, metric }: { range: string; metric: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const data = useMemo(() => rangeHistory(range), [range]);

  useEffect(() => {
    if (!canvas.current || !data.length) return;
    const cutoff = rangeCutoff(range)?.getTime();
    const timestamps = data.map((row, index) => {
      const value = toTimestamp(row.fecha);
      return index === 0 && cutoff && value < cutoff ? cutoff : value;
    });
    const ticks = computeCalendarTicks(timestamps);
    const totalPoints = data.map((row, index) => ({ x: timestamps[index], y: row.valor_total }));
    const gainRows = filteredWithFill(range, withoutWithdrawalSnapshots(historialGananciaFondo()) as Row[]);
    const gainPoints = gainRows.map((row, index) => ({ x: timestamps[index], y: row.ganancia }));
    const baseUsd = data[0]?.precio_cuota || 1;
    const baseCop = data[0] ? data[0].precio_cuota * (data[0].trm || S.trm || 1) : 1;
    const usdPoints = data.map((row, index) => ({ x: timestamps[index], y: (row.precio_cuota / baseUsd - 1) * 100 }));
    const copPoints = data.map((row, index) => ({ x: timestamps[index], y: (row.precio_cuota * (row.trm || S.trm || 1) / baseCop - 1) * 100 }));

    const config = metric === 'cuota'
      ? { datasets: [{ ...dataset(usdPoints, '#0C243B'), label: 'USD', fill: false }, { ...dataset(copPoints, '#4A6E93'), label: 'COP', fill: false }], options: quotaOptions(ticks) }
      : metric === 'ganancia'
        ? { datasets: [gainDataset(gainPoints)], options: standardOptions(ticks) }
        : { datasets: [dataset(totalPoints, '#0C243B')], options: standardOptions(ticks) };

    const chart = new Chart(canvas.current, { type: 'line', data: { datasets: config.datasets as any }, options: config.options as any });
    return () => chart.destroy();
  }, [data, metric, range]);

  if (!data.length) return <div className="empty"><div className="empty-title">Sin historial</div><p className="empty-text">El gráfico aparecerá después de la primera valuación.</p></div>;

  const labels: Record<string, [string, string, (row: Row) => number]> = {
    ganancia: ['Ganancia acumulada', 'USD', row => row.ganancia],
    total: ['Valor total', 'USD', row => row.valor_total],
    cuota: ['Precio de cuota', 'USD por cuota', row => row.precio_cuota],
  };
  const [label, unit] = labels[metric];
  const summaryRows = metric === 'ganancia'
    ? filteredWithFill(range, withoutWithdrawalSnapshots(historialGananciaFondo()) as Row[])
    : data;
  const start = labels[metric][2](summaryRows[0]);
  const end = labels[metric][2](summaryRows.at(-1)!);
  const trend = end > start ? 'subió' : end < start ? 'bajó' : 'se mantuvo';

  return (
    <>
      <canvas ref={canvas} role="img" aria-label={`Gráfico de ${label}`} aria-describedby="chart-hero-summary" />
      <p className="sr-only" id="chart-hero-summary" aria-live="polite">
        {label} en {RANGE_LABELS[range]}. {trend} de {fmt(start)} {unit} a {fmt(end)} {unit}.
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
    line.append(label, `: ${fmt(point.parsed.y)} USD`);
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
  const rows = useMemo(() => filteredWithFill(range, historialParticipante(name) as Row[]), [name, range]);

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
      labels: { color: '#6E6F76', font: { size: 14 }, padding: 14, usePointStyle: true },
    };
    options.plugins.tooltip = { enabled: false, external: personaTooltip };
    const chart = new Chart(canvas.current, {
      type: 'line',
      data: {
        datasets: [
          { ...dataset(current, participanteColor(name)), label: 'Valor actual', fill: false },
          { ...dataset(invested, '#8A8F98'), label: 'Invertido', fill: false, borderDash: [5, 5] },
        ] as any,
      },
      options,
    });
    return () => {
      chart.destroy();
      document.getElementById('persona-tooltip')?.remove();
    };
  }, [name, range, rows]);

  if (!rows.length) return <div className="empty"><div className="empty-title">Sin historial</div></div>;
  const first = rows[0];
  const last = rows.at(-1)!;
  const trend = last.valor > first.valor ? 'subió' : last.valor < first.valor ? 'bajó' : 'se mantuvo';

  return (
    <>
      <canvas ref={canvas} role="img" aria-label={`Evolución de ${name}`} aria-describedby="chart-persona-summary" />
      <p className="sr-only" id="chart-persona-summary" aria-live="polite">
        La inversión de {name} en {RANGE_LABELS[range]} {trend} de {fmt(first.valor)} USD a {fmt(last.valor)} USD.
      </p>
    </>
  );
}
