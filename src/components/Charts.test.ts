import { describe, expect, it } from 'vitest';
import { computeCalendarTicks, nextTooltipTap, spreadLabels } from './Charts';

describe('chart data helpers', () => {
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
