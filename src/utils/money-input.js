export function fmtMoneyInput(el, decimals) {
  let raw = el.value.replace(/[^\d,]/g, '');
  const parts = raw.split(',');
  if (parts.length > 2) raw = parts[0] + ',' + parts.slice(1).join('');
  const intStr = (raw.split(',')[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decStr = raw.includes(',') ? ',' + (raw.split(',')[1] || '').slice(0, decimals) : '';
  el.value = intStr + decStr;
  // Cursor siempre al final
  const len = el.value.length;
  el.setSelectionRange(len, len);
}

export function parseMoneyInput(el) {
  const raw = el.value.replace(/\./g, '').replace(',', '.');
  return parseFloat(raw) || 0;
}
