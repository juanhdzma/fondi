import { describe, expect, it } from 'vitest';
import { donutArcs } from './Summary';

describe('donutArcs', () => {
  it('splits the circumference proportionally and keeps tiny shares visible', () => {
    const arcs = donutArcs([{ weight: 99.9 }, { weight: 0.1 }]);
    const circumference = 2 * Math.PI * 15.915;
    expect(arcs[0].offset).toBeCloseTo(0.4);
    expect(arcs[0].length).toBeCloseTo(0.999 * circumference - 0.8);
    expect(arcs[1].length).toBe(0.6);
  });

  it('draws a single slice as a full ring with no gap', () => {
    const [arc] = donutArcs([{ weight: 100 }]);
    expect(arc.offset).toBe(0);
    expect(arc.length).toBeCloseTo(2 * Math.PI * 15.915);
  });

  it('returns nothing for an empty fund', () => {
    expect(donutArcs([{ weight: 0 }])).toEqual([]);
  });
});
