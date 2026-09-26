import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { S } from '../state.js';
import { PARTICIPANT_COLORS } from '../config.js';
import { calcParticipante, cuotasCirc, gananciaCop, latest, participantesTodos, participantesVisiblesActivos, rendimientoPct } from '../computed.js';
import { quickTransition, springTransition, surfaceMotion } from '../motion';
import { COP, fmt0, fmtPct, signStr } from '../utils/format.js';
import { HeroChart, periodPct, RANGE_LABELS, RANGES, rangeHistory } from './Charts';

const metrics = [
  ['ganancia', 'Ganancia'],
  ['total', 'Valor total'],
];

function Change({ value, range }: { value: number | null; range: string }) {
  if (value === null) return null;
  const tone = value > 0 ? 'pos' : value < 0 ? 'neg' : 'muted';
  return (
    <div className={`stat-chg ${tone}`}>
      {signStr(value)}{fmtPct(Math.abs(value))}%
      <span className="stat-chg-period"> · cambio en {RANGE_LABELS[range]}</span>
    </div>
  );
}

function Delta({ value, lead = false }: { value: number; lead?: boolean }) {
  const tone = value > 0 ? 'pos' : value < 0 ? 'neg' : 'zero';
  return (
    <span className={`p-delta ${tone}${lead ? ' lead' : ''}`}>
      {value !== 0 && <svg viewBox="0 0 8 8" aria-hidden="true"><path d={value > 0 ? 'M4 1 7.5 7h-7z' : 'M4 7 .5 1h7z'} /></svg>}
      {fmtPct(Math.abs(value))}%
    </span>
  );
}

function LoadingParticipants() {
  return <>{Array.from({ length: 4 }, (_, index) => (
    <div className="p-row" key={index}>
      <span className="skeleton" style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0 }} />
      <span className="skeleton" style={{ width: 90, height: 13 }} />
      <span className="skeleton" style={{ width: 70, height: 18, marginLeft: 'auto' }} />
    </div>
  ))}</>;
}

export function Summary({ loading }: { loading: boolean }) {
  const [range, setRange] = useState('1M');
  const [metric, setMetric] = useState('ganancia');
  const [highlightedParticipant, setHighlightedParticipant] = useState('');
  const current = latest();

  const history = rangeHistory(range);
  const fundChange = periodPct(history, 'valor_total');
  const fundCopChange = periodPct(history.map(row => ({ ...row, valor_cop: row.valor_total * (row.trm || S.trm || 1) })), 'valor_cop');
  const totalShares = cuotasCirc();
  const participants = participantesTodos()
    .map(name => calcParticipante(name))
    .sort((a, b) => b.cuotas - a.cuotas);
  const activeParticipants = participantesVisiblesActivos();
  const activeNames = new Set(activeParticipants);
  const historicalCount = participants.filter(participant => !activeNames.has(participant.nombre)).length;
  const visiblePercentage = totalShares > 0
    ? participants.reduce((total, participant) => total + Math.max(0, participant.cuotas), 0) / totalShares * 100
    : 0;
  const hiddenPercentage = Math.max(0, 100 - visiblePercentage);
  const highlighted = participants.find(participant => participant.nombre === highlightedParticipant);
  const contributed = S.movimientos.reduce((total, movement) => total + (movement.tipo === 'retiro' ? -movement.monto : movement.monto), 0);
  const gain = current ? current.valor_total - contributed : 0;
  const { ganancia_pct: gainPercentage, ganancia_cop_pct: gainCopPercentage } = rendimientoPct(S.movimientos);
  const gainCop = current ? gananciaCop(S.movimientos, current.valor_total) : 0;
  const signedCop = (value: number) => `${signStr(value)}${COP(Math.round(Math.abs(value)))} COP`;
  const gainTone = (value: number) => value > 0 ? 'pos' : value < 0 ? 'neg' : '';

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

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Resumen</h1>
          <p>Rendimiento y participación del fondo.</p>
        </div>
      </div>

      <section className="chart-card summary-hero">
        <div className="summary-hero-toolbar">
          <div className="summary-period-metrics">
            <div className="period-metric">
              <div className="stat-label">Valor del fondo</div>
              <div className="stat-value">{current ? `${fmt0(current.valor_total)} USD` : '—'}</div>
              <Change value={fundChange} range={range} />
            </div>
            <div className="period-metric">
              <div className="stat-label">Valor en COP</div>
              <div className="stat-value">{current ? `${COP(Math.round(current.valor_total * (S.trm || 1)))} COP` : '—'}</div>
              <Change value={fundCopChange} range={range} />
            </div>
          </div>
          <div className="hero-toggle" role="group" aria-label="Métrica del gráfico">
            {metrics.map(([value, label]) => (
              <button key={value} className={`hero-tab${metric === value ? ' active' : ''}`} aria-pressed={metric === value} onClick={() => setMetric(value)}>
                {metric === value && <motion.span className="control-selection" layoutId="summary-metric" transition={springTransition} />}
                <span className="control-label">{label}</span>
              </button>
            ))}
          </div>
        </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${range}-${metric}`} className="chart-wrap" variants={surfaceMotion} initial="hidden" animate="visible" exit="exit" transition={quickTransition}>
              <HeroChart range={range} metric={metric} />
            </motion.div>
          </AnimatePresence>
          <div className="range-btns" role="group" aria-label="Período del gráfico">
            {RANGES.map(([value, full, short]) => (
              <button key={value} className={`range-btn${range === value ? ' active' : ''}`} aria-pressed={range === value} onClick={() => setRange(value)}>
                {range === value && <motion.span className="control-selection" layoutId="summary-range" transition={springTransition} />}
                <span className="control-label rl-full">{full}</span><span className="control-label rl-short">{short}</span>
              </button>
            ))}
          </div>
      </section>

      <section className="current-totals" aria-label="Totales actuales">
        <h2>Totales actuales</h2>
        <div className="current-totals-grid">
          <div><span>Aportado</span><b>{current ? `${fmt0(contributed)} USD` : '—'}</b></div>
          <div><span>Ganancia USD</span><b className={gainTone(gain)}>{current ? `${signStr(gain)}${fmt0(Math.abs(gain))} USD (${signStr(gainPercentage)}${fmtPct(Math.abs(gainPercentage))}%)` : '—'}</b></div>
          <div><span>Ganancia COP</span><b className={gainTone(gainCop)}>{current ? `${signedCop(gainCop)} (${signStr(gainCopPercentage)}${fmtPct(Math.abs(gainCopPercentage))}%)` : '—'}</b></div>
        </div>
      </section>

      <div className="section-label">Participantes <span className="section-count">{loading ? '—' : `${activeParticipants.length} activos${historicalCount ? ` · ${historicalCount} históricos` : ''}`}</span></div>
      <div className="participants-panel">
        {loading ? <div className="participants-grid"><LoadingParticipants /></div> : !current ? (
          <div className="empty"><div className="empty-title">Fondo vacío</div><div className="empty-text">El admin puede registrar aportes y el primer valor del fondo en el panel Admin.</div></div>
        ) : !participants.length ? (
          <div className="empty"><div className="empty-title">Sin participantes visibles</div><div className="empty-text">Puedes volver a mostrarlos desde el panel Admin.</div></div>
        ) : (
          <>
            <div className="ownership-summary">
              <div>
                <strong>{highlighted ? highlighted.nombre : 'Participación del fondo'}</strong>
                <span>{highlighted ? `${fmt0(highlighted.valor_actual)} USD · ${(Math.max(0, highlighted.cuotas) / totalShares * 100).toFixed(0)}%` : `${participants.length} visibles · ${visiblePercentage.toFixed(0)}% representado`}</span>
              </div>
              {hiddenPercentage > 0.5 && <b>{hiddenPercentage.toFixed(0)}% oculto</b>}
            </div>
            <div className="ownership-bar" role="group" aria-label="Distribución de la participación">
              {participants.map((participant, index) => {
                const percentage = totalShares > 0 ? Math.max(0, participant.cuotas) / totalShares * 100 : 0;
                return percentage > 0 && (
                  <button
                    key={participant.nombre}
                    type="button"
                    className={highlightedParticipant && highlightedParticipant !== participant.nombre ? 'dimmed' : ''}
                    style={{ width: `${percentage}%`, background: PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length] }}
                    aria-label={`${participant.nombre}, ${percentage.toFixed(0)}% del fondo`}
                    aria-pressed={highlightedParticipant === participant.nombre}
                    {...participantInteraction(participant.nombre)}
                  ><span>{participant.nombre}</span><b>{percentage.toFixed(0)}%</b></button>
                );
              })}
              {hiddenPercentage > 0.5 && <span className="ownership-hidden" style={{ width: `${hiddenPercentage}%` }}><span>Oculto</span><b>{hiddenPercentage.toFixed(0)}%</b></span>}
            </div>
            <div className="participants-grid">
            {participants.map((participant, index) => {
          const tone = PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
          const percentage = totalShares > 0 ? Math.max(0, participant.cuotas) / totalShares * 100 : 0;
          return (
            <motion.button
              type="button"
              className={`p-row${highlightedParticipant === participant.nombre ? ' highlighted' : ''}${highlightedParticipant && highlightedParticipant !== participant.nombre ? ' dimmed' : ''}`}
              key={participant.nombre}
              variants={surfaceMotion}
              initial="hidden"
              animate="visible"
              transition={{ ...springTransition, delay: Math.min(index, 5) * 0.04 }}
              layout
              aria-label={`Resaltar a ${participant.nombre}, ${percentage.toFixed(0)}% del fondo, ${fmt0(participant.valor_actual)} USD, rendimiento ${signStr(participant.ganancia_pct)}${fmtPct(Math.abs(participant.ganancia_pct))}% en USD y ${signStr(participant.ganancia_cop_pct)}${fmtPct(Math.abs(participant.ganancia_cop_pct))}% en COP`}
              aria-pressed={highlightedParticipant === participant.nombre}
              {...participantInteraction(participant.nombre)}
            >
              <div className="p-avatar" style={{ background: tone }}>{participant.nombre.charAt(0).toUpperCase()}</div>
              <div className="p-main">
                <div className="p-name">{participant.nombre}</div>
                <div className="p-share">
                  <span className="p-meter" aria-hidden="true">
                    <motion.span style={{ background: tone, originX: 0 }} initial={{ scaleX: 0 }} animate={{ scaleX: percentage / 100 }} transition={{ ...springTransition, delay: 0.1 + Math.min(index, 5) * 0.05 }} />
                  </span>
                  <span className="p-pct">{percentage.toFixed(0)}% del fondo{!activeNames.has(participant.nombre) ? ' · histórico' : ''}</span>
                </div>
              </div>
              <div className="p-figures">
                <div className="p-monto">{fmt0(participant.valor_actual)}<span className="p-unit">USD</span></div>
                <Delta value={participant.ganancia_pct} lead />
                <div className="p-cop">{COP(Math.round(participant.valor_cop))}<span className="p-unit">COP</span></div>
                <Delta value={participant.ganancia_cop_pct} />
              </div>
            </motion.button>
          );
            })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
