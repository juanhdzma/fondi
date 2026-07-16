// Normaliza cualquier formato de fecha del Sheet → YYYY-MM-DD o YYYY-MM-DDTHH:MM
export function normDate(s) {
  if (!s) return '';
  s = String(s).trim();
  // ISO con T o espacio: "2026-06-14T17:56" / "2026-06-14 17:56:00"
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) {
    return s.slice(0, 10) + 'T' + s.slice(11, 16);  // → "2026-06-14T17:56"
  }
  // ISO solo fecha: "2026-06-14"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY o DD-MM-YYYY con hora opcional
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[\s,]+(\d{1,2}:\d{2}))?/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return m[4] ? `${iso}T${m[4].padStart(5,'0')}` : iso;
  }
  return s;
}

export function fmtDate(s) {
  if (!s) return '—';
  const norm = normDate(s);
  const [datePart, timePart] = norm.split('T');
  const d = new Date(datePart + 'T12:00:00');
  if (isNaN(d)) return s;
  const dateStr = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return timePart ? `${dateStr} ${timePart.slice(0, 5)}` : dateStr;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fmtDateShort(s) {
  if (!s) return '—';
  const iso = normDate(s).split('T')[0];
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d)) return '—';
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}
