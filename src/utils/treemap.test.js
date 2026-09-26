import { describe, expect, it } from 'vitest';
import { treemapLayout } from './treemap.js';

const area = cell => cell.w * cell.h;

describe('treemapLayout', () => {
  it('gives each item an area proportional to its weight', () => {
    const cells = treemapLayout([{ weight: 50 }, { weight: 30 }, { weight: 20 }], 2);
    const total = cells.reduce((sum, cell) => sum + area(cell), 0);
    expect(total).toBeCloseTo(10000, 6);
    expect(area(cells[0]) / total).toBeCloseTo(0.5, 6);
    expect(area(cells[2]) / total).toBeCloseTo(0.2, 6);
  });

  it('splits along the longer side of the container', () => {
    const [wide] = treemapLayout([{ weight: 1 }, { weight: 1 }], 3);
    expect(wide.h).toBe(100);
    const [tall] = treemapLayout([{ weight: 1 }, { weight: 1 }], 0.3);
    expect(tall.w).toBe(100);
  });

  it('handles empty and single inputs', () => {
    expect(treemapLayout([])).toEqual([]);
    expect(treemapLayout([{ weight: 5 }])).toEqual([{ item: { weight: 5 }, x: 0, y: 0, w: 100, h: 100 }]);
  });
});
