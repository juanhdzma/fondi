import { describe, expect, it } from 'vitest';
import { COP, compact, fmt, fmt0 } from './format.js';

describe('money formatting', () => {
  it('prefixes USD amounts with US$', () => {
    expect(fmt0(22484.52)).toBe('US$ 22.485');
    expect(fmt(1234.5)).toBe('US$ 1.234,50');
  });

  it('prefixes COP amounts with $', () => {
    expect(COP(48230000)).toBe('$ 48.230.000');
  });

  it('abbreviates large axis values', () => {
    expect(compact(12450)).toBe('12,5k');
    expect(compact(950)).toBe('950');
  });
});
