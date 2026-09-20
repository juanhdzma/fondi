import { describe, expect, it } from 'vitest';
import { fmt0 } from './format.js';

describe('fmt0', () => {
  it('rounds USD values for compact display', () => {
    expect(fmt0(22484.52)).toBe('$22.485');
  });
});
