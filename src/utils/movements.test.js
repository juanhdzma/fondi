import { describe, expect, it } from 'vitest';
import { filterMovements, groupByMonth } from './movements.js';

const m = (persona, tipo, monto, fecha) => ({ persona, tipo, monto, fecha });
const movs = [
  m('Sofía', 'aporte', 1500, '2026-01-10T10:00'),
  m('Luis', 'retiro', 300, '2026-09-05T18:00'),
  m('Ana', 'aporte', 800, '2026-05-16T18:00'),
];
const now = new Date(2026, 8, 26);

describe('filterMovements', () => {
  it('sorts newest first', () => {
    expect(filterMovements(movs).map(x => x.persona)).toEqual(['Luis', 'Ana', 'Sofía']);
  });

  it('filters by person and type', () => {
    expect(filterMovements(movs, { person: 'Ana' })).toHaveLength(1);
    expect(filterMovements(movs, { type: 'retiro' }).map(x => x.persona)).toEqual(['Luis']);
  });

  it('searches names without accents and amounts without separators', () => {
    expect(filterMovements(movs, { query: 'sofia' })[0].persona).toBe('Sofía');
    expect(filterMovements(movs, { query: '1.500' })[0].persona).toBe('Sofía');
  });

  it('limits to the chosen period', () => {
    expect(filterMovements(movs, { period: '3m', now }).map(x => x.persona)).toEqual(['Luis']);
  });
});

describe('groupByMonth', () => {
  it('groups consecutive movements by month', () => {
    const groups = groupByMonth(filterMovements(movs));
    expect(groups.map(g => g.key)).toEqual(['2026-09', '2026-05', '2026-01']);
    expect(groups[0].items).toHaveLength(1);
  });
});
