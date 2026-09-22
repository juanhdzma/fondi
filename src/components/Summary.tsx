import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { S } from '../state.js';
import { PARTICIPANT_COLORS } from '../config.js';
import { calcParticipante, cuotasCirc, latest, participantesTodos, participantesVisiblesActivos } from '../computed.js';
import { quickTransition, springTransition, surfaceMotion } from '../motion';
import { COP, fmt, fmt0, fmtN, fmtPct, signStr } from '../utils/format.js';
import { HeroChart, periodPct, RANGE_LABELS, RANGES, rangeHistory } from './Charts';

const metrics = [
  ['ganancia', 'Ganancia'],
  ['total', 'Valor total'],
  ['cuota', 'Precio cuota'],
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
  const quotaChange = periodPct(history, 'precio_cuota');
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
  const gainPercentage = contributed > 0 ? gain / contributed * 100 : 0;

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
              <div className="stat-label">Precio de cuota</div>
              <div className="stat-value">{current ? `${fmt(current.precio_cuota)} USD` : '—'}</div>
              <Change value={quotaChange} range={range} />
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
          <div><span>Ganancia</span><b className={gain > 0 ? 'pos' : gain < 0 ? 'neg' : ''}>{current ? `${signStr(gain)}${fmt0(Math.abs(gain))} USD (${signStr(gainPercentage)}${fmtPct(Math.abs(gainPercentage))}%)` : '—'}</b></div>
          <div><span>Cuotas totales</span><b>{current ? fmtN(totalShares) : '—'}</b></div>
          <div><span>Cuota en COP</span><b>{current ? `${COP(Math.round(current.precio_cuota * (S.trm || 1)))} COP` : '—'}</b></div>
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
                    onPointerEnter={() => setHighlightedParticipant(participant.nombre)}
                    onPointerLeave={() => setHighlightedParticipant('')}
                    onFocus={() => setHighlightedParticipant(participant.nombre)}
                    onBlur={() => setHighlightedParticipant('')}
                    onClick={() => setHighlightedParticipant(participant.nombre)}
                  ><span>{participant.nombre}</span><b>{percentage.toFixed(0)}%</b></button>
                );
              })}
              {hiddenPercentage > 0.5 && <span className="ownership-hidden" style={{ width: `${hiddenPercentage}%` }}><span>Oculto</span><b>{hiddenPercentage.toFixed(0)}%</b></span>}
            </div>
            <div className="participants-grid">
            {participants.map((participant, index) => {
          const tone = PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
          const percentage = totalShares > 0 ? Math.max(0, participant.cuotas) / totalShares * 100 : 0;
          const gainTone = participant.ganancia_pct > 0 ? 'pos' : participant.ganancia_pct < 0 ? 'neg' : 'zero';
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
              aria-label={`Resaltar a ${participant.nombre}, ${percentage.toFixed(0)}% del fondo`}
              aria-pressed={highlightedParticipant === participant.nombre}
              onPointerEnter={() => setHighlightedParticipant(participant.nombre)}
              onPointerLeave={() => setHighlightedParticipant('')}
              onFocus={() => setHighlightedParticipant(participant.nombre)}
              onBlur={() => setHighlightedParticipant('')}
              onClick={() => setHighlightedParticipant(participant.nombre)}
            >
              <div className="p-avatar" style={{ background: tone }}>{participant.nombre.charAt(0).toUpperCase()}</div>
              <div className="p-main">
                <div className="p-name">{participant.nombre}</div>
                <div className="p-pct">{percentage.toFixed(0)}% del fondo{!activeNames.has(participant.nombre) ? ' · histórico' : ''}</div>
              </div>
              <div className="p-figures">
                <div className="p-monto">{fmt0(participant.valor_actual)}</div>
                <div className={`p-chg ${gainTone}`}>{signStr(participant.ganancia_pct)}{fmtPct(Math.abs(participant.ganancia_pct))}%</div>
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
