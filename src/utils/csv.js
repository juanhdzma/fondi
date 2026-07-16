export function parseCSV(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const row = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        row.push(cur); cur = '';
      } else {
        cur += c;
      }
    }
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

// Parsea números en formato CO (1.300,00 → 1300 / 11,23 → 11.23 / 1.300 → 1300)
export function parseCONumber(s) {
  let str = String(s ?? '').trim();
  if (!str) return 0;
  if (str.includes(',') && str.includes('.')) {
    // Ambos: punto=miles, coma=decimal → "1.300,00"
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    // Solo coma: decimal → "11,23"
    str = str.replace(',', '.');
  } else if (str.includes('.')) {
    // Solo punto: miles si la parte final tiene 3 dígitos → "1.300"
    const last = str.split('.').pop();
    if (last.length === 3) str = str.replace(/\./g, '');
    // si no (ej "11.23"), lo deja como decimal ISO
  }
  return parseFloat(str) || 0;
}
