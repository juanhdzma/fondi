import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { S } from '../state.js';
import { calcParticipante, cuotasCirc, gananciaCop, historialGananciaFondo, historialParticipante, latest, participanteColor, participantesActivos, participantesTodos, participantesVisiblesActivos, rendimientoPct } from '../computed.js';
import { springTransition, staggered, surfaceMotion } from '../motion';
import { compact, COP, fmt0, fmtN, fmtN0, fmtPct, fmtQuota, signStr } from '../utils/format.js';
import { fmtDateShort } from '../utils/dates.js';
import { cssVar, useTheme } from '../theme';
import { heroChange, HeroChart, heroGain, heroSeries, RANGE_LABELS, RANGES, type HeroPoint } from './Charts';
import { CountUp } from './CountUp';
import { Delta, tone } from './Delta';
import { PageHeading } from './PageHeading';
import { Sparkline } from './Sparkline';
import { SetupSteps } from './States';

type Participant = ReturnType<typeof calcParticipante>;

const SHARE_TOLERANCE = 1e-6;
const RANGE_PHRASES: Record<string, string> = {
  '1W': 'En la última semana',
  '2W': 'En las últimas 2 semanas',
  '1M': 'En el último mes',
  '3M': 'En los últimos 3 meses',
  '6M': 'En los últimos 6 meses',
  '1A': 'En el último año',
  todo: 'Desde el inicio',
};

// Dónde cae el valor de hoy entre el mínimo y el máximo del período, en porcentaje del tramo.
export function rangeSpot(series: number[], today: number) {
  if (series.length < 2) return null;
  const min = Math.min(...series, today);
  const max = Math.max(...series, today);
  return { min, max, at: max > min ? (today - min) / (max - min) * 100 : 50 };
}

function SummarySkeleton() {
  const bar = (width: string | number, height: number, style = {}) => <span className="skeleton" style={{ width, height, ...style }} />;
  return (
    <div className="resumen-grid" aria-busy="true" aria-label="Cargando resumen">
      <div className="resumen-main">
        <div className="value-tiles">
          {[0, 1, 2].map(index => <div className="total-tile skeleton-card" key={index}>{bar('45%', 11)}{bar('70%', 26, { marginTop: 8 })}{bar('100%', 30, { marginTop: 14 })}</div>)}
        </div>
        <section className="chart-card summary-hero skeleton-card">
          {bar('55%', 18)}
          {bar('100%', 300, { marginTop: 18, borderRadius: 12 })}
          {bar('100%', 44, { marginTop: 12, borderRadius: 12 })}
        </section>
        <div className="totals-tiles">
          {[0, 1, 2, 3].map(index => <div className="total-tile skeleton-card" key={index}>{bar('50%', 11)}{bar('70%', 18, { marginTop: 6 })}{bar('100%', 30, { marginTop: 8 })}</div>)}
        </div>
      </div>
      <section className="participants-card skeleton-card">
        {bar('40%', 16)}
        {bar('100%', 12, { marginTop: 14 })}
        {[0, 1, 2].map(index => (
          <div className="skeleton-row" key={index}>
            {bar(36, 36, { borderRadius: 18, flexShrink: 0 })}
            <span style={{ flex: 1, display: 'grid', gap: 6 }}>{bar('45%', 12)}{bar('30%', 10)}</span>
            {bar(80, 16)}
          </div>
        ))}
      </section>
    </div>
  );
}

export function Summary({ loading, trmCached, onGoAdmin }: { loading: boolean; trmCached: boolean; onGoAdmin: () => void }) {
  const theme = useTheme();
  const [range, setRange] = useState('1M');
  const [hover, setHover] = useState<HeroPoint | null>(null);
  const [highlightedParticipant, setHighlightedParticipant] = useState('');
  const current = latest();

  const points = useMemo(() => heroSeries(range), [range, S.historial, S.movimientos]);
  const rangeReturns = useMemo(
    () => Object.fromEntries(RANGES.map(([value]) => {
      const series = heroSeries(value);
      return [value, heroChange(series[0], series.at(-1))];
    })),
    [S.historial, S.movimientos],
  );
  const history = useMemo(() => historialGananciaFondo(), [S.historial, S.movimientos]);

  const base = points[0];
  const shownPoint = hover ?? points.at(-1);
  const periodGain = Math.round(heroGain(base, shownPoint));
  const periodPct = heroChange(base, shownPoint);
  const gainTone = tone(periodGain);
  const gainVerb = hover ? { pos: 'iba ganando', neg: 'iba perdiendo' } : { pos: 'ganó', neg: 'perdió' };

  const totalShares = cuotasCirc();
  const participants = participantesTodos()
    .map(name => calcParticipante(name))
    .filter(participant => participant.cuotas > SHARE_TOLERANCE)
    .sort((a, b) => b.cuotas - a.cuotas);
  const activeNames = new Set(participantesVisiblesActivos());
  const share = (participant: Participant) => totalShares > 0 ? Math.max(0, participant.cuotas) / totalShares * 100 : 0;
  const visiblePercentage = participants.reduce((total, participant) => total + share(participant), 0);
  const hiddenPercentage = Math.max(0, 100 - visiblePercentage);

  const contributed = S.movimientos.reduce((total, movement) => total + (movement.tipo === 'retiro' ? -movement.monto : movement.monto), 0);
  const gain = current ? current.valor_total - contributed : 0;
  const { ganancia_pct: gainPercentage, ganancia_cop_pct: gainCopPercentage } = rendimientoPct(S.movimientos);
  const gainCop = current ? gananciaCop(S.movimientos, current.valor_total) : 0;

  const colors = useMemo(() => ({ pos: cssVar('--pos'), neg: cssVar('--neg'), muted: cssVar('--muted') }), [theme]);

  const slices = [
    ...participants.map(participant => ({ key: participant.nombre, weight: share(participant), color: participanteColor(participant.nombre) })),
    ...(hiddenPercentage > 0.5 ? [{ key: '', weight: hiddenPercentage, color: 'var(--surface-2)' }] : []),
  ];

  useEffect(() => {
    const clearHighlight = (event: PointerEvent) => {
      if (!(event.target as Element).closest('[data-participant-highlight]')) setHighlightedParticipant('');
    };
    document.addEventListener('pointerdown', clearHighlight);
    return () => document.removeEventListener('pointerdown', clearHighlight);
  }, []);

  const participantInteraction = (name: string) => ({
    'data-participant-highlight': true,
    onPointerEnter: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'mouse') setHighlightedParticipant(name);
    },
    onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'mouse') setHighlightedParticipant('');
    },
    onFocus: (event: React.FocusEvent<HTMLButtonElement>) => {
      if (event.currentTarget.matches(':focus-visible')) setHighlightedParticipant(name);
    },
    onBlur: () => setHighlightedParticipant(''),
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== 'mouse') setHighlightedParticipant(currentName => currentName === name ? '' : name);
    },
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      if (event.detail === 0) setHighlightedParticipant(currentName => currentName === name ? '' : name);
    },
  });
  const dim = (name: string) => highlightedParticipant && highlightedParticipant !== name ? ' dimmed' : '';

  const rangeEnd = points.at(-1);
  const pesos = (current?.valor_total ?? 0) * (S.trm || 1);
  const values = [
    { label: 'Valor en dólares', value: current ? <CountUp value={current.valor_total} format={fmt0} /> : '—', change: heroChange(base, rangeEnd), neutral: false, spot: rangeSpot(points.map(point => point.valor), current?.valor_total ?? 0), format: fmt0 },
    { label: 'Valor en pesos', value: current ? <CountUp value={pesos} format={value => COP(Math.round(value))} /> : '—', change: heroChange(base, rangeEnd, 'cop'), neutral: false, spot: rangeSpot(points.map(point => point.valor * point.trm), pesos), format: (value: number) => `$ ${compact(value)}` },
    { label: trmCached ? 'TRM guardada' : 'TRM de hoy', value: S.trm ? `$ ${fmtN(S.trm)}` : '—', change: base?.trm && S.trm && points.length > 1 ? (S.trm - base.trm) / base.trm * 100 : null, neutral: true, spot: S.trm ? rangeSpot(points.map(point => point.trm), S.trm) : null, format: (value: number) => `$ ${fmtN0(value)}` },
  ];

  const totals = [
    { label: 'Aportado', value: current ? fmt0(contributed) : '—', tone: '', pct: null, series: history.map(row => row.aportado), color: colors.muted },
    { label: 'Ganancia USD', value: current ? `${signStr(gain)}${fmt0(Math.abs(gain))}` : '—', tone: tone(gain), pct: gainPercentage, series: history.map(row => row.ganancia), color: gain >= 0 ? colors.pos : colors.neg },
    { label: 'Ganancia COP', value: current ? `${signStr(gainCop)}${COP(Math.round(Math.abs(gainCop)))}` : '—', tone: tone(gainCop), pct: gainCopPercentage, series: history.map(row => row.ganancia_cop), color: gainCop >= 0 ? colors.pos : colors.neg },
    { label: 'Valor de la cuota', value: current ? `US$ ${fmtQuota(current.precio_cuota)}` : '—', tone: '', pct: null, series: history.map(row => row.precio_cuota), color: colors.muted },
  ];

  if (loading) return <><PageHeading title="Resumen" /><SummarySkeleton /></>;

  if (!current) {
    return (
      <>
        <PageHeading title="Resumen" />
        <SetupSteps
          steps={[
            { label: 'Agregar participantes', done: participantesActivos().length > 0 },
            { label: 'Registrar los primeros aportes', done: S.movimientos.length > 0 },
            { label: 'Registrar el valor del fondo', done: false },
          ]}
          onAction={onGoAdmin}
        />
      </>
    );
  }

  return (
    <>
      <PageHeading title="Resumen" />

      <div className="resumen-grid">
        <div className="resumen-main">
          <section className="value-tiles" aria-label="Valor del fondo">
            {values.map((item, index) => (
              <motion.div key={item.label} className="total-tile" variants={surfaceMotion} initial="hidden" animate="visible" transition={staggered(index)}>
                <span className="total-label">{item.label}</span>
                <b className="total-value">{item.value}</b>
                <span className={`tile-change${item.neutral ? ' neutral' : ''}`}>{item.change !== null && <><Delta value={item.change} lead /> en {RANGE_LABELS[range]}</>}</span>
                {item.spot && (
                  <>
                    <div className={`range-track${item.neutral ? ' neutral' : ''}`} role="img" aria-label={`En ${RANGE_LABELS[range]}: mínimo ${item.format(item.spot.min)}, máximo ${item.format(item.spot.max)}`}><i style={{ left: `${item.spot.at}%` }} /></div>
                    <div className="range-ends" aria-hidden="true"><span><em>mín. </em>{item.format(item.spot.min)}</span><span><em>máx. </em>{item.format(item.spot.max)}</span></div>
                  </>
                )}
              </motion.div>
            ))}
          </section>

          <motion.section className="chart-card summary-hero" variants={surfaceMotion} initial="hidden" animate="visible" transition={staggered(1)}>
            {points.length > 0 && (
              <p className="hero-story">
                {hover ? `Al ${fmtDateShort(hover.fecha)}` : RANGE_PHRASES[range]} el fondo{' '}
                {gainTone === 'zero' ? 'no ganó ni perdió' : (
                  <>
                    <b className={gainTone}>{gainVerb[gainTone]} {fmt0(Math.abs(periodGain))}</b>
                    {periodPct !== null && <span className={gainTone}> ({signStr(periodPct)}{fmtPct(Math.abs(periodPct))}%)</span>}
                  </>
                )}
              </p>
            )}
            <div className="chart-wrap">
              <HeroChart range={range} onHover={setHover} />
            </div>
            <div className="range-pills" role="group" aria-label="Período del gráfico">
              {RANGES.map(([value, full, short]) => {
                const pct = rangeReturns[value];
                return (
                  <button key={value} type="button" className={`range-pill${range === value ? ' active' : ''}`} aria-pressed={range === value} aria-label={`${full}${pct === null ? '' : `, rendimiento ${signStr(pct)}${fmtPct(Math.abs(pct))}%`}`} onClick={() => setRange(value)}>
                    {range === value && <motion.span className="control-selection" layoutId="summary-range" transition={springTransition} />}
                    <span className="control-label">{short}</span>
                    {pct !== null && <small className={`control-label ${tone(pct)}`}>{signStr(pct)}{fmtPct(Math.abs(pct))}%</small>}
                  </button>
                );
              })}
            </div>
          </motion.section>

          <section className="totals-tiles" aria-label="Totales actuales">
            {totals.map((total, index) => (
              <motion.div key={total.label} className="total-tile" variants={surfaceMotion} initial="hidden" animate="visible" transition={staggered(index + 1)}>
                <span className="total-label">{total.label}</span>
                <b className={`total-value ${total.tone}`}>{total.value}{total.pct !== null && current && <small> ({signStr(total.pct)}{fmtPct(Math.abs(total.pct))}%)</small>}</b>
                <Sparkline values={total.series} color={total.color} />
              </motion.div>
            ))}
          </section>
        </div>

        <motion.section className="participants-card" aria-labelledby="participants-title" variants={surfaceMotion} initial="hidden" animate="visible" transition={staggered(2)}>
          <div className="section-head">
            <h2 id="participants-title">Participantes</h2>
          </div>
          {!participants.length ? (
            <div className="empty"><div className="empty-title">Sin participantes visibles</div><div className="empty-text">Puedes volver a mostrarlos desde el panel Admin.</div></div>
          ) : (
            <>
              <div className="share-bar" role="img" aria-label={`Distribución de la participación: ${participants.map(participant => `${participant.nombre} ${share(participant).toFixed(0)}%`).join(', ')}`}>
                {slices.map(slice => (
                  <span
                    key={slice.key || 'hidden'}
                    className={slice.key ? dim(slice.key).trim() : ''}
                    style={{ flexGrow: slice.weight, background: slice.color }}
                    data-participant-highlight={slice.key ? true : undefined}
                    onPointerEnter={event => { if (slice.key && event.pointerType === 'mouse') setHighlightedParticipant(slice.key); }}
                    onPointerLeave={event => { if (event.pointerType === 'mouse') setHighlightedParticipant(''); }}
                    onPointerUp={event => { if (slice.key && event.pointerType !== 'mouse') setHighlightedParticipant(currentName => currentName === slice.key ? '' : slice.key); }}
                  />
                ))}
              </div>
              <div className="p-rows">
                {participants.map((participant, index) => (
                  <motion.button
                    type="button"
                    key={participant.nombre}
                    className={`p-row${highlightedParticipant === participant.nombre ? ' highlighted' : ''}${dim(participant.nombre)}`}
                    variants={surfaceMotion}
                    initial="hidden"
                    animate="visible"
                    transition={staggered(index + 3)}
                    aria-label={`Resaltar a ${participant.nombre}, ${share(participant).toFixed(0)}% del fondo, ${fmt0(participant.valor_actual)}, rendimiento ${signStr(participant.ganancia_pct)}${fmtPct(Math.abs(participant.ganancia_pct))}% en USD y ${signStr(participant.ganancia_cop_pct)}${fmtPct(Math.abs(participant.ganancia_cop_pct))}% en COP`}
                    aria-pressed={highlightedParticipant === participant.nombre}
                    {...participantInteraction(participant.nombre)}
                  >
                    <span className="p-share" style={{ '--c': participanteColor(participant.nombre) } as React.CSSProperties}>{share(participant).toFixed(0)}%</span>
                    <span className="p-name">{participant.nombre}{!activeNames.has(participant.nombre) && <span className="p-hist">histórico</span>}</span>
                    <span className="p-spark"><Sparkline values={historialParticipante(participant.nombre).map(row => row.valor - row.invertido)} color={participant.ganancia_monto >= 0 ? colors.pos : colors.neg} /></span>
                    <span className="p-monto">{fmt0(participant.valor_actual)}</span>
                    <Delta value={participant.ganancia_pct} lead />
                    <span className="p-cop">{COP(Math.round(participant.valor_cop))}</span>
                    <Delta value={participant.ganancia_cop_pct} />
                  </motion.button>
                ))}
                {hiddenPercentage > 0.5 && (
                  <div className="p-row p-row-hidden"><span className="p-share">{hiddenPercentage.toFixed(0)}%</span><span className="p-name">Oculto</span></div>
                )}
              </div>
            </>
          )}
        </motion.section>
      </div>
    </>
  );
}
