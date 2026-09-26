import { describe, expect, it } from 'vitest';
import { bucketStart, computeCalendarTicks, downsample, grainFor, nextTooltipTap, spreadLabels, valueAt } from './Charts';

describe('chart data helpers', () => {
  it('interpolates the line value between points and clamps at the ends', () => {
    const points = [{ ts: 0, valor: 100 }, { ts: 10, valor: 200 }];
    expect(valueAt(points, 5)).toBe(150);
    expect(valueAt(points, 10)).toBe(200);
    expect(valueAt(points, -3)).toBe(100);
    expect(valueAt(points, 50)).toBe(200);
    expect(valueAt([], 5)).toBe(0);
  });

  it('pushes overlapping end labels apart without reordering', () => {
    const spread = spreadLabels([{ y: 100, kind: 'a' }, { y: 105, kind: 'b' }, { y: 200, kind: 'c' }], 17);
    expect(spread.map(label => label.y)).toEqual([100, 117, 200]);
    expect(spread.map(label => label.kind)).toEqual(['a', 'b', 'c']);
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

  it('picks the grain from the visible span', () => {
    expect(grainFor(30)).toBe('day');
    expect(grainFor(100)).toBe('week');
    expect(grainFor(200)).toBe('month');
  });

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
