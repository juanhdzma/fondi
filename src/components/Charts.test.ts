import { describe, expect, it } from 'vitest';
import { computeCalendarTicks, nextTooltipTap, splitAtZero } from './Charts';

describe('chart data helpers', () => {
  it('inserts an exact zero point for both crossing directions', () => {
    expect(splitAtZero([{ x: 0, y: -10 }, { x: 20, y: 10 }])).toEqual([
      { x: 0, y: -10 },
      { x: 10, y: 0, interpolated: true },
      { x: 20, y: 10 },
    ]);
    expect(splitAtZero([{ x: 0, y: 10 }, { x: 20, y: -10 }])[1]).toEqual({ x: 10, y: 0, interpolated: true });
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
