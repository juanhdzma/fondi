export function Sparkline({ values, color, className = 'sparkline' }: { values: number[]; color: string; className?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const path = values
    .map((value, index) => `${index ? 'L' : 'M'}${(index / (values.length - 1) * 100).toFixed(2)} ${(30 - (value - min) / span * 27).toFixed(2)}`)
    .join('');
  return (
    <svg className={className} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
