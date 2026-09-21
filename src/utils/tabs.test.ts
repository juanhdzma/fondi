import { describe, expect, it } from 'vitest';
import { nextTabIndex } from './tabs';

describe('nextTabIndex', () => {
  it('supports arrows with wrapping and Home/End', () => {
    expect(nextTabIndex(2, 'ArrowRight', 3)).toBe(0);
    expect(nextTabIndex(0, 'ArrowLeft', 3)).toBe(2);
    expect(nextTabIndex(1, 'ArrowDown', 3)).toBe(2);
    expect(nextTabIndex(1, 'ArrowUp', 3)).toBe(0);
    expect(nextTabIndex(2, 'Home', 3)).toBe(0);
    expect(nextTabIndex(0, 'End', 3)).toBe(2);
    expect(nextTabIndex(1, 'Enter', 3)).toBeNull();
  });
});
