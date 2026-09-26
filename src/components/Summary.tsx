import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { S } from '../state.js';
import { calcParticipante, cuotasCirc, gananciaCop, historialGananciaFondo, historialParticipante, latest, participanteColor, participantesTodos, participantesVisiblesActivos, rendimientoPct } from '../computed.js';
import { springTransition, staggered, surfaceMotion } from '../motion';
import { COP, fmt0, fmtN, fmtPct, signStr } from '../utils/format.js';
import { fmtDateShort } from '../utils/dates.js';
import { treemapLayout } from '../utils/treemap.js';
import { cssVar, useTheme } from '../theme';
import { HeroChart, heroSeries, periodPct, RANGE_LABELS, RANGES, type HeroPoint } from './Charts';
import { CountUp } from './CountUp';
import { Delta, tone } from './Delta';
import { PageHeading } from './PageHeading';
import { Sparkline } from './Sparkline';

type Participant = ReturnType<typeof calcParticipante>;

function TrmChip({ cached }: { cached: boolean }) {
  if (!S.trm) return null;
  return (
    <span className={`trm-chip${cached ? ' cached' : ''}`} title={cached ? 'TRM cacheada: no se pudo consultar la de hoy' : 'TRM de hoy, Superfinanciera'}>
      TRM {cached ? '~' : ''}${fmtN(S.trm)}
    </span>
  );
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

function LoadingParticipants() {
  return <>{Array.from({ length: 4 }, (_, index) => (
    <div className="p-card" key={index}>
      <span className="skeleton" style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0 }} />
      <span className="skeleton" style={{ width: 90, height: 13 }} />
      <span className="skeleton" style={{ width: 70, height: 18, marginLeft: 'auto' }} />
    </div>
  ))}</>;
}

export function Summary({ loading, trmCached }: { loading: boolean; trmCached: boolean }) {
  const theme = useTheme();
  const [range, setRange] = useState('3M');
  const [hover, setHover] = useState<HeroPoint | null>(null);
  const [highlightedParticipant, setHighlightedParticipant] = useState('');
  const [treemapRef, treemapSize] = useElementSize<HTMLDivElement>();
  const current = latest();

  const points = useMemo(() => heroSeries(range), [range, S.historial, S.movimientos]);
  const rangeReturns = useMemo(
    () => Object.fromEntries(RANGES.map(([value]) => [value, periodPct(heroSeries(value), 'precio_cuota')])),
    [S.historial, S.movimientos],
  );
  const history = useMemo(() => historialGananciaFondo(), [S.historial, S.movimientos]);

  const base = points[0];
  const shownUsd = hover ? hover.valor : current?.valor_total ?? 0;
  const shownTrm = hover ? hover.trm : S.trm || 1;
  const shownPrice = hover ? hover.precio_cuota : current?.precio_cuota ?? 0;
  const usdChange = base && base.precio_cuota > 0 ? (shownPrice / base.precio_cuota - 1) * 100 : null;
  const copChange = base && base.precio_cuota > 0 ? (shownPrice * shownTrm / (base.precio_cuota * base.trm) - 1) * 100 : null;
  const when = hover ? `${fmtDateShort(hover.fecha)} · desde el inicio del período` : `cambio en ${RANGE_LABELS[range]}`;

  const totalShares = cuotasCirc();
  const participants = participantesTodos()
    .map(name => calcParticipante(name))
    .sort((a, b) => b.cuotas - a.cuotas);
  const activeNames = new Set(participantesVisiblesActivos());
  const historicalCount = participants.filter(participant => !activeNames.has(participant.nombre)).length;
  const share = (participant: Participant) => totalShares > 0 ? Math.max(0, participant.cuotas) / totalShares * 100 : 0;
  const visiblePercentage = participants.reduce((total, participant) => total + share(participant), 0);
  const hiddenPercentage = Math.max(0, 100 - visiblePercentage);

  const contributed = S.movimientos.reduce((total, movement) => total + (movement.tipo === 'retiro' ? -movement.monto : movement.monto), 0);
  const gain = current ? current.valor_total - contributed : 0;
  const { ganancia_pct: gainPercentage, ganancia_cop_pct: gainCopPercentage } = rendimientoPct(S.movimientos);
  const gainCop = current ? gananciaCop(S.movimientos, current.valor_total) : 0;

  const colors = useMemo(() => ({ pos: cssVar('--pos'), neg: cssVar('--neg'), muted: cssVar('--muted') }), [theme]);

  type Cell = { item: { weight: number; participant: Participant | null }; x: number; y: number; w: number; h: number };
  const cells: Cell[] = treemapLayout(
    [
      ...participants.filter(participant => share(participant) > 0).map(participant => ({ weight: share(participant), participant })),
      ...(hiddenPercentage > 0.5 ? [{ weight: hiddenPercentage, participant: null }] : []),
    ],
    treemapSize.height ? treemapSize.width / treemapSize.height : 2,
  );

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

  const totals = [
    { label: 'Aportado', value: current ? fmt0(contributed) : '—', tone: '', pct: null, series: history.map(row => row.aportado), color: colors.muted },
    { label: 'Ganancia USD', value: current ? `${signStr(gain)}${fmt0(Math.abs(gain))}` : '—', tone: tone(gain), pct: gainPercentage, series: history.map(row => row.ganancia), color: gain >= 0 ? colors.pos : colors.neg },
    { label: 'Ganancia COP', value: current ? `${signStr(gainCop)}${COP(Math.round(Math.abs(gainCop)))}` : '—', tone: tone(gainCop), pct: gainCopPercentage, series: history.map(row => row.ganancia_cop), color: gainCop >= 0 ? colors.pos : colors.neg },
  ];

  return (
    <>
      <PageHeading title="Resumen" />

      <div className="resumen-grid">
        <div className="resumen-main">
          <motion.section className="chart-card summary-hero" variants={surfaceMotion} initial="hidden" animate="visible" transition={staggered(0)}>
            <div className="hero-line">
              <span className="hero-label">Valor del fondo</span>
              <span className="hero-figure">
                <b className="hero-value">{current ? hover ? fmt0(shownUsd) : <CountUp value={shownUsd} format={fmt0} /> : '—'}</b>
                <Delta value={usdChange} lead />
              </span>
              <span className="hero-sep" aria-hidden="true" />
              <span className="hero-figure">
                <b className="hero-value">{current ? hover ? COP(Math.round(shownUsd * shownTrm)) : <CountUp value={shownUsd * shownTrm} format={value => COP(Math.round(value))} /> : '—'}</b>
                <Delta value={copChange} lead />
                <TrmChip cached={trmCached} />
              </span>
              <span className="hero-when" aria-live="polite">{when}</span>
            </div>
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
            <span className="section-count">{loading ? '—' : `${activeNames.size} activos${historicalCount ? ` · ${historicalCount} históricos` : ''}`}</span>
          </div>
          {loading ? <div className="p-cards"><LoadingParticipants /></div> : !current ? (
            <div className="empty"><div className="empty-title">Fondo vacío</div><div className="empty-text">El admin puede registrar aportes y el primer valor del fondo en el panel Admin.</div></div>
          ) : !participants.length ? (
            <div className="empty"><div className="empty-title">Sin participantes visibles</div><div className="empty-text">Puedes volver a mostrarlos desde el panel Admin.</div></div>
          ) : (
            <>
              <div className="treemap" ref={treemapRef} role="group" aria-label="Distribución de la participación">
                {cells.map(({ item, x, y, w, h }) => {
                  const style = { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` };
                  if (!item.participant) return <span key="hidden" className="treemap-cell treemap-hidden" style={style}><b>Oculto · {item.weight.toFixed(0)}%</b></span>;
                  const participant = item.participant;
                  return (
                    <button
                      key={participant.nombre}
                      type="button"
                      className={`treemap-cell${dim(participant.nombre)}`}
                      style={{ ...style, background: participanteColor(participant.nombre) }}
                      aria-label={`${participant.nombre}, ${share(participant).toFixed(0)}% del fondo, ${fmt0(participant.valor_actual)}`}
                      aria-pressed={highlightedParticipant === participant.nombre}
                      {...participantInteraction(participant.nombre)}
                    >
                      <b>{participant.nombre} · {share(participant).toFixed(0)}%</b>
                      <span className="treemap-figures">
                        <span>{fmt0(participant.valor_actual)} <Delta value={participant.ganancia_pct} /></span>
                        <span>{COP(Math.round(participant.valor_cop))} <Delta value={participant.ganancia_cop_pct} /></span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="p-cards">
                {participants.map((participant, index) => (
                  <motion.button
                    type="button"
                    key={participant.nombre}
                    className={`p-card${highlightedParticipant === participant.nombre ? ' highlighted' : ''}${dim(participant.nombre)}`}
                    variants={surfaceMotion}
                    initial="hidden"
                    animate="visible"
                    transition={staggered(index + 3)}
                    aria-label={`Resaltar a ${participant.nombre}, ${share(participant).toFixed(0)}% del fondo, ${fmt0(participant.valor_actual)}, rendimiento ${signStr(participant.ganancia_pct)}${fmtPct(Math.abs(participant.ganancia_pct))}% en USD y ${signStr(participant.ganancia_cop_pct)}${fmtPct(Math.abs(participant.ganancia_cop_pct))}% en COP`}
                    aria-pressed={highlightedParticipant === participant.nombre}
                    {...participantInteraction(participant.nombre)}
                  >
                    <span className="p-card-top">
                      <span className="p-avatar" style={{ background: participanteColor(participant.nombre) }}>{participant.nombre.charAt(0).toUpperCase()}</span>
                      <span className="p-main">
                        <span className="p-name">{participant.nombre}{!activeNames.has(participant.nombre) && <span className="p-hist">histórico</span>}</span>
                        <span className="p-pct">{share(participant).toFixed(0)}% del fondo</span>
                      </span>
                      <span className="p-figures">
                        <span className="p-monto">{fmt0(participant.valor_actual)}</span>
                        <Delta value={participant.ganancia_pct} lead />
                        <span className="p-cop">{COP(Math.round(participant.valor_cop))}</span>
                        <Delta value={participant.ganancia_cop_pct} />
                      </span>
                    </span>
                    <Sparkline values={historialParticipante(participant.nombre).map(row => row.valor)} color={participant.ganancia_monto >= 0 ? colors.pos : colors.neg} />
                  </motion.button>
                ))}
              </div>
            </>
          )}
        </motion.section>
      </div>
    </>
  );
}
