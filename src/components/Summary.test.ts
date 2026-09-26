import { describe, expect, it } from 'vitest';
import { waffleCells } from './Summary';

const count = (cells: Array<{ key: string }>, key: string) => cells.filter(cell => cell.key === key).length;

describe('waffleCells', () => {
  it('fills exactly 100 cells in proportion', () => {
    const cells = waffleCells([{ key: 'a', weight: 89.6 }, { key: 'b', weight: 10.4 }]);
    expect(cells).toHaveLength(100);
    expect(count(cells, 'a')).toBe(90);
    expect(count(cells, 'b')).toBe(10);
  });

  it('gives a tiny share at least one cell and still sums 100', () => {
    const cells = waffleCells([{ key: 'a', weight: 99.9 }, { key: 'b', weight: 0.1 }]);
    expect(cells).toHaveLength(100);
    expect(count(cells, 'b')).toBe(1);
  });

  it('returns nothing for an empty fund', () => {
    expect(waffleCells([{ key: 'a', weight: 0 }])).toEqual([]);
  });
});
