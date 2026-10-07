import { describe, expect, it } from 'vitest';
import { rangeSpot } from './Summary';

describe('rangeSpot', () => {
  it('places today between the period low and high', () => {
    expect(rangeSpot([100, 300, 200], 250)).toEqual({ min: 100, max: 300, at: 75 });
  });

  it('widens the range when today is outside the recorded points', () => {
    expect(rangeSpot([100, 200], 400)).toEqual({ min: 100, max: 400, at: 100 });
  });

  it('centers a flat period and skips a single point', () => {
    expect(rangeSpot([100, 100], 100)?.at).toBe(50);
    expect(rangeSpot([100], 100)).toBeNull();
  });
});
