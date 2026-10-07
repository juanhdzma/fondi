import { describe, expect, it } from 'vitest';
import { alignedRanges, bucketStart, currentPeriodPoint, fitBarThickness, periodToDateLabel, computeCalendarTicks, downsample, heroGain, nextTooltipTap, periodGainPct, periodSummary } from './Charts';

describe('chart data helpers', () => {
  it('measures the period gain without counting contributions or withdrawals', () => {
    const point = (ganancia: number, valor: number) => ({ ts: 0, fecha: '', valor, aportado: valor - ganancia, ganancia, ganancia_cop: 0, trm: 1 });
    expect(heroGain(point(300, 29000), point(1300, 23000))).toBe(1000);
    expect(heroGain(point(300, 29000), point(-200, 35000))).toBe(-500);
    expect(heroGain(undefined, point(300, 29000))).toBe(0);
  });

  it('keeps the visible range boundaries as ticks', () => {
    const timestamps = [Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 20)];
    const ticks = computeCalendarTicks(timestamps);
    expect(ticks[0]).toBe(timestamps[0]);
    expect(ticks.at(-1)).toBe(timestamps[1]);
  });

  it('dismisses a tapped tooltip when the same point is tapped again', () => {
    const point = { datasetIndex: 1, index: 4 };
    expect(nextTooltipTap('', point)).toBe('1:4');
    expect(nextTooltipTap('1:4', point)).toBe('');
    expect(nextTooltipTap('1:4')).toBe('');
  });
});

describe('grouping and downsampling', () => {
  const day = (date: string) => new Date(`${date}T12:00:00`).getTime();

  it('starts weeks on Monday and months on the 1st', () => {
    expect(new Date(bucketStart(day('2026-09-26'), 'week')).getDate()).toBe(21);
    expect(new Date(bucketStart(day('2026-09-26'), 'month')).getDate()).toBe(1);
  });

  it('leaves series under the budget untouched', () => {
    const points = [1, 2, 3, 4].map(ts => ({ ts, valor: ts }));
    expect(downsample(points, point => point.valor, 10)).toBe(points);
  });

  it('keeps real points, the endpoints and a sharp valley when over budget', () => {
    const points = Array.from({ length: 100 }, (_, index) => ({ ts: index, valor: index === 57 ? -500 : 100 }));
    const kept = downsample(points, point => point.valor, 10);
    expect(kept).toHaveLength(10);
    expect(kept[0]).toBe(points[0]);
    expect(kept.at(-1)).toBe(points[99]);
    expect(kept.every(point => points.includes(point))).toBe(true);
    expect(kept.some(point => point.valor === -500)).toBe(true);
  });
});

describe('periodGainPct', () => {
  it('equals gain over contributed when the period starts empty', () => {
    expect(periodGainPct(0, 1542.85, 26476.77)).toBeCloseTo(1542.85 / 24933.92 * 100);
  });

  it('ignores contributions made during the period', () => {
    expect(periodGainPct(100, 150, 2050)).toBeCloseTo(2.5);
  });

  it('returns null without capital', () => {
    expect(periodGainPct(0, 0, 0)).toBeNull();
  });
});

describe('periodSummary', () => {
  const row = (fecha: string, valor: number, invertido: number, aportado_cop = invertido * 4000, trm = 4000) => ({ fecha, valor, invertido, aportado_cop, trm });

  it('keeps the last snapshot per month and nets out contributions', () => {
    const rows = [
      row('2026-05-20', 0, 0),
      row('2026-06-01', 1000, 1000),
      row('2026-06-30', 1100, 1000),
      row('2026-07-10', 2100, 2000),
      row('2026-07-31', 2050, 2000),
    ];
    const points = periodSummary(rows, 'month');
    expect(points.map(point => point.fecha)).toEqual(['2026-06-30', '2026-07-31']);
    expect(points[0].periodo).toBeCloseTo(100);
    expect(points[1].periodo).toBeCloseTo(-50);
    expect(points[1].periodo_pct).toBeCloseTo(-50 / 2100 * 100);
    expect(points[1].periodo_cop).toBeCloseTo(-50 * 4000);
  });

  it('reflects exchange-rate moves in the COP gain only', () => {
    const points = periodSummary([row('2026-01-15', 1000, 1000, 4_000_000, 4000), row('2026-02-15', 1000, 1000, 4_000_000, 4400)], 'month');
    expect(points[1].periodo).toBe(0);
    expect(points[1].periodo_cop).toBeCloseTo(400_000);
  });

  it('limits weeks to the last 12 and groups years', () => {
    const weekly = Array.from({ length: 20 }, (_, index) => row(new Date(2026, 0, 5 + index * 7, 12).toISOString().slice(0, 10), 100 + index, 100));
    expect(periodSummary(weekly, 'week')).toHaveLength(12);
    expect(periodSummary(weekly, 'year')).toHaveLength(1);
  });
});

describe('alignedRanges', () => {
  const zeroAt = ({ min, max }: { min: number; max: number }) => -min / (max - min);

  it('puts zero at the same height on both axes and fits every value', () => {
    const [usd, cop] = alignedRanges([[100, -50, 20], [400_000, -100_000, 900_000]]);
    expect(zeroAt(usd)).toBeCloseTo(zeroAt(cop));
    expect(usd.min).toBeLessThanOrEqual(-50);
    expect(usd.max).toBeGreaterThanOrEqual(100);
    expect(cop.min).toBeLessThanOrEqual(-100_000);
    expect(cop.max).toBeGreaterThanOrEqual(900_000);
  });

  it('starts at zero when nothing is negative', () => {
    expect(alignedRanges([[0, 10], [0, 40_000]]).map(range => range.min)).toEqual([-0, -0]);
  });
});

describe('period contribution and current period', () => {
  const row = (fecha: string, valor: number, invertido: number) => ({ fecha, valor, invertido, aportado_cop: invertido * 4000, trm: 4000 });
  const rows = [row('2026-07-10', 1000, 1000), row('2026-08-05', 1500, 1500), row('2026-08-20', 1520, 1500), row('2026-09-10', 1100, 1000)];

  it('reports the net contribution of each period and flags the first one', () => {
    const points = periodSummary(rows, 'month');
    expect(points.map(point => point.aporte)).toEqual([1000, 500, -500]);
    expect(points.map(point => point.first)).toEqual([true, false, false]);
  });

  it('keeps the first flag on the real first period even when it is sliced out', () => {
    const weekly = Array.from({ length: 20 }, (_, index) => row(new Date(2026, 0, 5 + index * 7, 12).toISOString().slice(0, 10), 100, 100));
    expect(periodSummary(weekly, 'week').some(point => point.first)).toBe(false);
  });

  it('returns the current calendar period only when it already has a valuation', () => {
    const points = periodSummary(rows, 'month');
    expect(currentPeriodPoint(points, 'month', '2026-09-28')?.fecha).toBe('2026-09-10');
    expect(currentPeriodPoint(points, 'month', '2026-10-01')).toBeNull();
    expect(currentPeriodPoint(periodSummary(rows, 'year'), 'year', '2026-12-31')?.fecha).toBe('2026-09-10');
  });

  it('labels the current period up to its last valuation', () => {
    expect(periodToDateLabel(periodSummary(rows, 'month').at(-1)!, 'month')).toBe('Septiembre al 10');
    expect(periodToDateLabel(periodSummary(rows, 'year').at(-1)!, 'year')).toBe('2026 a la fecha');
    expect(periodToDateLabel(periodSummary(rows, 'week').at(-1)!, 'week')).toMatch(/^Esta semana \(desde el 7 /);
  });

  it('shrinks bars to fit narrow charts and caps them on wide ones', () => {
    expect(fitBarThickness(1000, 4, 2, 34)).toBe(34);
    expect(fitBarThickness(320, 12, 2, 34)).toBe(9);
    expect(fitBarThickness(100, 50, 2, 34)).toBe(4);
  });
});

describe('periods without a valuation', () => {
  const row = (fecha: string, valor: number, invertido: number) => ({ fecha, valor, invertido, aportado_cop: invertido * 4000, trm: 4000 });

  it('leaves a gap and assigns the skipped gain to the next recorded period', () => {
    const points = periodSummary([row('2026-06-10', 1000, 1000), row('2026-06-30', 1050, 1000), row('2026-08-20', 1200, 1000)], 'month');
    expect(points.map(point => point.gap)).toEqual([false, true, false]);
    expect(new Date(points[1].ts).getMonth()).toBe(6);
    expect(points[2].span).toBe(2);
    expect(points[2].periodo).toBeCloseTo(150);
    expect(points[0].span).toBe(1);
  });

  it('counts the last 12 calendar weeks, not the last 12 recorded ones', () => {
    const weeks = Array.from({ length: 20 }, (_, index) => new Date(2026, 0, 5 + index * 7, 12).toISOString().slice(0, 10));
    const recorded = weeks.filter((_, index) => index % 2 === 0).map((fecha, index) => row(fecha, 100 + index, 100));
    const points = periodSummary(recorded, 'week');
    expect(points).toHaveLength(12);
    expect(points.filter(point => point.gap)).toHaveLength(6);
  });
});
