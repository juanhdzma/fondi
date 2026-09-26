import { describe, expect, it } from 'vitest';
import { laneLayout } from './lanes.js';

const ev = (x, amount, person = 'Ana') => ({ x, amount, people: [person], count: 1 });

describe('laneLayout', () => {
  it('keeps distant events on the first lane', () => {
    expect(laneLayout([ev(0, 1), ev(100, 2)], 50).map(e => e.lane)).toEqual([0, 0]);
  });

  it('moves a close event to the second lane', () => {
    expect(laneLayout([ev(0, 1), ev(20, 2)], 50).map(e => e.lane)).toEqual([0, 1]);
  });

  it('merges into the previous chip when every lane is taken', () => {
    const placed = laneLayout([ev(0, 100), ev(10, -30, 'Luis'), ev(20, 50, 'Sofía')], 50);
    expect(placed).toHaveLength(2);
    expect(placed[1]).toMatchObject({ amount: 20, count: 2, people: ['Luis', 'Sofía'] });
  });
});
