import { describe, expect, it } from 'vitest';
import { fmtMoneyInput, parseMoneyValue, resolveContributionExchange } from './money-input.js';

// El input real solo se usa por .value/.selectionStart/.setSelectionRange, así que alcanza
// con un doble sin DOM.
function fakeInput(value, caret = value.length) {
  return {
    value,
    selectionStart: caret,
    setSelectionRange(pos) { this.selectionStart = pos; },
  };
}

describe('fmtMoneyInput', () => {
  it('agrupa los miles con punto', () => {
    const el = fakeInput('1234567');
    fmtMoneyInput(el, 0);
    expect(el.value).toBe('1.234.567');
  });

  it('descarta lo que no sea número', () => {
    const el = fakeInput('12a3$4');
    fmtMoneyInput(el, 0);
    expect(el.value).toBe('1.234');
  });

  it('recorta los decimales al máximo permitido', () => {
    const el = fakeInput('1234,5678');
    fmtMoneyInput(el, 2);
    expect(el.value).toBe('1.234,56');
  });

  it('con decimals 0 no deja parte decimal', () => {
    const el = fakeInput('1234,99');
    fmtMoneyInput(el, 0);
    expect(el.value).toBe('1.234,');
  });

  it('colapsa una segunda coma', () => {
    const el = fakeInput('12,34,56');
    fmtMoneyInput(el, 2);
    expect(el.value).toBe('12,34');
  });

  it('deja el cursor sobre el mismo dígito al editar en la mitad', () => {
    // "1.234" con el cursor entre el 2 y el 3, se escribe un 9: "1.29|34" → "12.934"
    const el = fakeInput('1.2934', 4);
    fmtMoneyInput(el, 0);
    expect(el.value).toBe('12.934');
    // 3 dígitos antes del cursor ("129"), ahora con el separador corrido un lugar.
    expect(el.selectionStart).toBe(4);
    expect(el.value.slice(0, el.selectionStart)).toBe('12.9');
  });

  it('escribiendo al final el cursor queda al final', () => {
    const el = fakeInput('1234');
    fmtMoneyInput(el, 0);
    expect(el.value).toBe('1.234');
    expect(el.selectionStart).toBe(el.value.length);
  });

  it('el cursor al inicio no se mueve', () => {
    const el = fakeInput('1234', 0);
    fmtMoneyInput(el, 0);
    expect(el.selectionStart).toBe(0);
  });
});

describe('parseMoneyValue', () => {
  it('parses the controlled React input value', () => {
    expect(parseMoneyValue('1.234,56')).toBe(1234.56);
  });
});

describe('resolveContributionExchange', () => {
  it('deriva la TRM desde COP o el monto COP desde una TRM manual', () => {
    expect(resolveContributionExchange({ usd: 100, mode: 'cop', cop: 390000, trm: 0 }))
      .toEqual({ amountCOP: 390000, exchangeRate: 3900 });
    expect(resolveContributionExchange({ usd: 100, mode: 'trm', cop: 0, trm: 4100 }))
      .toEqual({ amountCOP: 410000, exchangeRate: 4100 });
  });
});
