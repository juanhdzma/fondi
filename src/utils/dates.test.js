import { describe, expect, it } from 'vitest';
import { daysSince, freshness, greeting, shiftToCurrentWeek } from './dates.js';

describe('greeting', () => {
  it('depends on the local hour', () => {
    expect(greeting(new Date(2026, 8, 26, 8))).toBe('Buenos días · sábado, 26 de septiembre');
    expect(greeting(new Date(2026, 8, 26, 15))).toMatch(/^Buenas tardes/);
    expect(greeting(new Date(2026, 8, 26, 21))).toMatch(/^Buenas noches/);
  });
});

describe('freshness', () => {
  const now = new Date(2026, 8, 26, 10);

  it('counts calendar days, not 24h blocks', () => {
    expect(daysSince('2026-09-25T23:50', now)).toBe(1);
    expect(daysSince('2026-09-26T08:00', now)).toBe(0);
  });

  it('describes the last valuation', () => {
    expect(freshness('2026-09-24T18:40', now)).toBe('Actualizado hace 2 días · última valuación 24 sep, 18:40');
    expect(freshness('2026-09-26', now)).toBe('Actualizado hoy · última valuación 26 sep');
  });
});

describe('shiftToCurrentWeek', () => {
  const rows = [{ fecha: '2026-09-21', valor: 1 }, { fecha: '2026-09-28', valor: 2 }];

  it('moves every date by whole weeks so the last one lands in the current week', () => {
    expect(shiftToCurrentWeek(rows, '2026-09-28', new Date(2026, 9, 10, 10))).toEqual([
      { fecha: '2026-09-28', valor: 1 },
      { fecha: '2026-10-05', valor: 2 },
    ]);
  });

  it('never moves dates backwards', () => {
    expect(shiftToCurrentWeek(rows, '2026-09-28', new Date(2026, 8, 20, 10))).toEqual(rows);
  });
});
