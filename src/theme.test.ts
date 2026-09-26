import { describe, expect, it } from 'vitest';
import { withAlpha } from './theme';

describe('withAlpha', () => {
  it('converts hex tokens to rgba for canvas gradients', () => {
    expect(withAlpha('#8fd0e0', 0.3)).toBe('rgba(143, 208, 224, 0.3)');
  });

  it('leaves non-hex colors untouched', () => {
    expect(withAlpha('rgba(1, 2, 3, 0.5)', 0.1)).toBe('rgba(1, 2, 3, 0.5)');
  });
});
