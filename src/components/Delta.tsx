import { fmtPct } from '../utils/format.js';

export const tone = (value: number) => value > 0 ? 'pos' : value < 0 ? 'neg' : 'zero';

export function Delta({ value, lead = false }: { value: number | null; lead?: boolean }) {
  if (value === null || !Number.isFinite(value)) return null;
  return (
    <span className={`p-delta ${tone(value)}${lead ? ' lead' : ''}`}>
      {value !== 0 && <svg viewBox="0 0 8 8" aria-hidden="true"><path d={value > 0 ? 'M4 1 7.5 7h-7z' : 'M4 7 .5 1h7z'} /></svg>}
      {fmtPct(Math.abs(value))}%
    </span>
  );
}
