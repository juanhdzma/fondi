import { describe, expect, it } from 'vitest';
import { computeCalendarTicks, nextTooltipTap, spreadLabels, valueAt } from './Charts';

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
