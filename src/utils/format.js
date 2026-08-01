// Los formatters se instancian una sola vez: varios de estos se llaman desde callbacks de
// ticks/tooltips de Chart.js, que corren por cada tick en cada frame de render.
const NF2 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

export const fmt = usd => '$' + NF2.format(usd);
export const fmtN = n => NF2.format(Number(n || 0));
export const fmtPct = n => NF2.format(n);
export const COP = n => '$' + NF0.format(n);
export const signStr = n => n >= 0 ? '+' : '−';
