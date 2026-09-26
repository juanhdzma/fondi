// Los formatters se instancian una sola vez: varios de estos se llaman desde callbacks de
// ticks/tooltips de Chart.js, que corren por cada tick en cada frame de render.
const NF2 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NF0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const NF4 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export const fmt = usd => 'US$ ' + NF2.format(usd);
export const fmt0 = usd => 'US$ ' + NF0.format(usd);
export const fmtN = n => NF2.format(Number(n || 0));
export const fmtN0 = n => NF0.format(Number(n || 0));
export const fmtPct = n => NF2.format(n);
export const fmtQuota = n => NF4.format(n);
export const COP = n => '$ ' + NF0.format(n);
export const signStr = n => n >= 0 ? '+' : '−';
export const compact = n => Math.abs(n) >= 1e4 ? NF1.format(n / 1e3) + 'k' : NF0.format(n);
