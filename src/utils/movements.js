import { normDate, todayLocal } from './dates.js';

const plain = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const PERIODS = [
  ['todo', 'Todo el historial', null],
  ['30d', 'Últimos 30 días', 30],
  ['3m', 'Últimos 3 meses', 91],
  ['6m', 'Últimos 6 meses', 182],
  ['1a', 'Último año', 365],
];

// Filtra y ordena de más reciente a más antiguo. La búsqueda compara sin tildes contra el
// nombre y, si trae dígitos, contra el monto sin separadores ("1500" encuentra US$ 1.500).
export function filterMovements(movs, { person = '', type = 'all', query = '', period = 'todo', now = new Date() } = {}) {
  const days = PERIODS.find(([key]) => key === period)?.[2] ?? null;
  const since = days === null ? '' : todayLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
  const text = plain(query.trim());
  const digits = query.replace(/\D/g, '');
  return movs
    .filter(m => !person || m.persona === person)
    .filter(m => type === 'all' || m.tipo === type)
    .filter(m => !since || normDate(m.fecha).slice(0, 10) >= since)
    .filter(m => !text || plain(m.persona).includes(text) || (digits && String(Math.round(m.monto)).includes(digits)))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function groupByMonth(movs) {
  const groups = [];
  for (const m of movs) {
    const key = normDate(m.fecha).slice(0, 7);
    let group = groups.at(-1);
    if (!group || group.key !== key) groups.push(group = { key, items: [] });
    group.items.push(m);
  }
  return groups;
}
