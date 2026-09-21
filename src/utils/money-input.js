export function fmtMoneyInput(el, decimals) {
  // La posición del cursor se cuenta en caracteres "reales" (dígitos y la coma decimal), no
  // en índice: los separadores de miles se agregan y se quitan al escribir y corren el índice
  // con ellos. Mandándolo siempre al final no se podía corregir un dígito en la mitad del monto.
  const reales = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/[^\d,]/g, '').length;

  let raw = el.value.replace(/[^\d,]/g, '');
  const parts = raw.split(',');
  if (parts.length > 2) raw = parts[0] + ',' + parts.slice(1).join('');
  const intStr = (raw.split(',')[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decStr = raw.includes(',') ? ',' + (raw.split(',')[1] || '').slice(0, decimals) : '';
  el.value = intStr + decStr;

  let pos = 0;
  for (let vistos = 0; pos < el.value.length && vistos < reales; pos++) {
    if (el.value[pos] !== '.') vistos++;
  }
  el.setSelectionRange(pos, pos);
}

export function parseMoneyInput(el) {
  return parseMoneyValue(el.value);
}

export function parseMoneyValue(value) {
  const raw = value.replace(/\./g, '').replace(',', '.');
  return parseFloat(raw) || 0;
}

export function resolveContributionExchange({ usd, mode, cop, trm }) {
  if (!Number.isFinite(usd) || usd <= 0) return { amountCOP: 0, exchangeRate: 0 };

  if (mode === 'trm') {
    if (!Number.isFinite(trm) || trm <= 0) return { amountCOP: 0, exchangeRate: 0 };
    return { amountCOP: usd * trm, exchangeRate: trm };
  }

  if (!Number.isFinite(cop) || cop <= 0) return { amountCOP: 0, exchangeRate: 0 };
  return { amountCOP: cop, exchangeRate: cop / usd };
}
