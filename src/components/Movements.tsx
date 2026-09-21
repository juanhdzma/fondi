import { Fragment, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { S } from '../state.js';
import { calcParticipante, participanteColor, participantesTodos, porcentajeRetiro } from '../computed.js';
import { quickTransition, springTransition, surfaceMotion } from '../motion';
import { COP, fmt, fmtPct, signStr } from '../utils/format.js';
import { fmtDate, normDate } from '../utils/dates.js';
import { ParticipantChart, RANGES } from './Charts';

const monthFormatter = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });

function month(date: string) {
  const key = normDate(date).slice(0, 7);
  const label = monthFormatter.format(new Date(`${key}-01T12:00:00`));
  return [key, label.charAt(0).toUpperCase() + label.slice(1)];
}

function ParticipantSummary({ name }: { name: string }) {
  const participant = calcParticipante(name);
  const tone = participant.ganancia_pct > 0 ? 'pos' : participant.ganancia_pct < 0 ? 'neg' : 'zero';
  const color = participanteColor(name);
  return (
    <>
      <div className="p-head" style={{ marginBottom: 18 }}>
        <div className="p-avatar" style={{ background: color }}>{name.charAt(0).toUpperCase()}</div>
        <div className="p-name">{name}</div>
      </div>
      <div className="p-summary-grid">
        <div>
          <div className="summary-label">Valor actual</div>
          <div className="summary-value">{fmt(participant.valor_actual)}<span className="summary-unit">USD</span></div>
          {participant.has_cop && <div className="summary-sub">{COP(Math.round(participant.valor_cop))} COP</div>}
        </div>
        <div>
          <div className="summary-label">Ganancia</div>
          <div className="summary-value">{signStr(participant.ganancia_monto)}{fmt(Math.abs(participant.ganancia_monto))}<span className="summary-unit">USD</span></div>
          <div style={{ marginTop: 6 }}><span className={`gain-badge ${tone}`}>{signStr(participant.ganancia_pct)}{fmtPct(Math.abs(participant.ganancia_pct))}%</span></div>
        </div>
        <div>
          <div className="summary-label">Total aportado</div>
          <div className="summary-value">{fmt(participant.aportes_monto)}<span className="summary-unit">USD</span></div>
          {participant.has_cop && <div className="summary-sub">{COP(participant.cop_invertido)} COP · TRM prom {COP(participant.trm_avg_entrada)}</div>}
          {participant.retiros_monto > 0 && <div className="summary-sub">{fmt(participant.retiros_monto)} USD retirados</div>}
        </div>
      </div>
    </>
  );
}

export function Movements({ loading }: { loading: boolean }) {
  const names = participantesTodos();
  const [selected, setSelected] = useState('');
  const [range, setRange] = useState('todo');
  const visible = new Set(names);
  const movements = S.movimientos
    .filter(movement => visible.has(movement.persona) && (!selected || movement.persona === selected))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  let previousMonth = '';

  return (
    <>
      <div className="page-heading page-heading-actions">
        <div><h1>Movimientos</h1><p>Aportes y retiros del fondo.</p></div>
        <div className="table-filters">
          <label className="sr-only" htmlFor="filter-persona">Participante</label>
          <select className="select-styled" id="filter-persona" value={selected} onChange={event => setSelected(event.target.value)}>
            <option value="">Todos los participantes</option>
            {names.map(name => <option key={name}>{name}</option>)}
          </select>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selected && (
        <motion.div id="mov-persona-panel" variants={surfaceMotion} initial="hidden" animate="visible" exit="exit" transition={springTransition}>
          <div className="card" id="mov-persona-summary"><ParticipantSummary name={selected} /></div>
          <div className="chart-card">
            <div className="chart-header"><div className="chart-title">Evolución de tu inversión</div></div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={`${selected}-${range}`} className="chart-wrap" variants={surfaceMotion} initial="hidden" animate="visible" exit="exit" transition={quickTransition}>
                <ParticipantChart name={selected} range={range} />
              </motion.div>
            </AnimatePresence>
            <div className="range-btns" role="group" aria-label="Período de evolución">
              {RANGES.map(([value, full, short]) => (
                <button key={value} className={`range-btn persona-range-btn${range === value ? ' active' : ''}`} aria-pressed={range === value} onClick={() => setRange(value)}>
                  {range === value && <motion.span className="control-selection" layoutId="participant-range" transition={springTransition} />}
                  <span className="control-label rl-full">{full}</span><span className="control-label rl-short">{short}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
      <motion.ul key={`${selected}-${loading ? 'loading' : 'ready'}`} className="mov-list" variants={surfaceMotion} initial="hidden" animate="visible" exit="exit" transition={quickTransition}>
        {loading ? <li className="empty">Cargando...</li> : !movements.length ? (
          <li className="empty"><div className="empty-title">Sin movimientos</div><p className="empty-text">Los aportes y retiros aparecerán aquí.</p></li>
        ) : movements.map((movement, index) => {
          const [key, label] = month(movement.fecha);
          const heading = key !== previousMonth;
          previousMonth = key;
          return (
            <Fragment key={`${movement.fecha}-${movement.persona}-${movement.monto}-${index}`}>
              {heading && <li className="mov-month"><h2>{label}</h2></li>}
              <li className="mov-card">
                <div className="mov-who"><div className="mov-persona">{movement.persona}</div><div className="mov-fecha">{fmtDate(movement.fecha)}</div></div>
                <div className="mov-figures">
                  <div className="mov-monto"><span className={`badge badge-${movement.tipo}`}>{movement.tipo}</span>{fmt(movement.monto)} USD</div>
                  <div className="mov-meta">
                    {movement.tipo === 'retiro'
                      ? `Retiró ${fmtPct(porcentajeRetiro(movement))}% de su saldo`
                      : `${movement.monto_cop ? COP(movement.monto_cop) : '—'} COP · TRM ${movement.trm_dia ? COP(movement.trm_dia) : '—'}`}
                  </div>
                </div>
              </li>
            </Fragment>
          );
        })}
      </motion.ul>
      </AnimatePresence>
    </>
  );
}
