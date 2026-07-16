export function fmt(usd, dec = 2) {
  return '$' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(usd);
}

export function fmtN(n, d = 2) {
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n || 0));
}

export function fmtPct(n, d = 2) {
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}

export const COP = n => '$' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
export const signStr = n => n >= 0 ? '+' : '−';
