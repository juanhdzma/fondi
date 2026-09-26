import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { S, type Movement } from '../state.js';
import { calcParticipante, cuotasCirc, participanteColor, participantesTodos, participantesVisiblesActivos, porcentajeRetiro } from '../computed.js';
import { quickTransition, springTransition, staggered, surfaceMotion } from '../motion';
import { COP, fmt, fmtN0, fmtPct, signStr } from '../utils/format.js';
import { fmtDateShort, normDate } from '../utils/dates.js';
import { filterMovements, groupByMonth, PERIODS } from '../utils/movements.js';
import { ParticipantChart, RANGES } from './Charts';
import { Delta, tone } from './Delta';
import { PageHeading } from './PageHeading';

const monthFormatter = new Intl.DateTimeFormat('es-CO', { month: 'short' });

function monthParts(key: string) {
  const date = new Date(`${key}-01T12:00:00`);
  const month = monthFormatter.format(date).replace('.', '');
  return [month.charAt(0).toUpperCase() + month.slice(1), String(date.getFullYear())];
}

function PersonPanel({ name, range, setRange }: { name: string; range: string; setRange: (range: string) => void }) {
  const participant = calcParticipante(name);
  const total = cuotasCirc();
  const share = total > 0 ? Math.max(0, participant.cuotas) / total * 100 : 0;
  const first = S.movimientos.filter(movement => movement.persona === name).map(movement => movement.fecha).sort()[0];
  return (
    <motion.section id="mov-persona-panel" className="card person-panel" variants={surfaceMotion} initial="hidden" animate="visible" exit="exit" transition={springTransition}>
      <div className="person-head">
        <span className="p-avatar" style={{ background: participanteColor(name) }}>{name.charAt(0).toUpperCase()}</span>
        <div>
          <h2>{name}</h2>
          <span>{share.toFixed(0)}% del fondo{first ? ` · participa desde ${fmtDateShort(first)} ${normDate(first).slice(0, 4)}` : ''}</span>
        </div>
      </div>
      <div className="person-grid">
        <dl className="person-kv">
          <div>
            <dt>Valor actual</dt>
            <dd><b>{fmt(participant.valor_actual)}</b><small>{COP(Math.round(participant.valor_cop))}</small></dd>
          </div>
          <div>
            <dt>Ganancia</dt>
            <dd>
              <b className={tone(participant.ganancia_monto)}>{signStr(participant.ganancia_monto)}{fmt(Math.abs(participant.ganancia_monto))} <Delta value={participant.ganancia_pct} lead /></b>
              <small className={tone(participant.ganancia_cop)}>{signStr(participant.ganancia_cop)}{COP(Math.round(Math.abs(participant.ganancia_cop)))} <Delta value={participant.ganancia_cop_pct} /></small>
            </dd>
          </div>
          <div>
            <dt>Total aportado</dt>
            <dd>
              <b>{fmt(participant.aportes_monto)}</b>
              {participant.has_cop && <small>{COP(participant.cop_invertido)} · TRM prom {fmtN0(participant.trm_avg_entrada)}</small>}
              {participant.retiros_monto > 0 && <small>{fmt(participant.retiros_monto)} retirados</small>}
            </dd>
          </div>
        </dl>
        <div className="person-chart">
          <div className="chart-title">Evolución de tu inversión</div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${name}-${range}`} className="chart-wrap" variants={surfaceMotion} initial="hidden" animate="visible" exit="exit" transition={quickTransition}>
              <ParticipantChart name={name} range={range} />
            </motion.div>
          </AnimatePresence>
          <div className="range-btns" role="group" aria-label="Período de evolución">
            {RANGES.map(([value, full, short]) => (
              <button key={value} type="button" className={`range-btn${range === value ? ' active' : ''}`} aria-pressed={range === value} aria-label={full} onClick={() => setRange(value)}>
                {range === value && <motion.span className="control-selection" layoutId="participant-range" transition={springTransition} />}
                <span className="control-label">{short}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

export function Movements({ loading }: { loading: boolean }) {
  const names = participantesTodos();
  const activeNames = new Set(participantesVisiblesActivos());
  const [selected, setSelected] = useState('');
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('todo');
  const [range, setRange] = useState('todo');
  const selectedName = names.includes(selected) ? selected : '';
  const visible = new Set(names);
  const movements: Movement[] = filterMovements(S.movimientos.filter(movement => visible.has(movement.persona)), { person: selectedName, type, query, period });
  const filtered = Boolean(query || type !== 'all' || period !== 'todo');

  return (
    <>
      <PageHeading title="Movimientos" />

      <div className="person-chips" role="group" aria-label="Filtrar por participante">
        {['', ...names].map(name => (
          <button key={name || 'all'} type="button" className={`person-chip${selectedName === name ? ' active' : ''}${name && !activeNames.has(name) ? ' inactive' : ''}`} aria-pressed={selectedName === name} onClick={() => setSelected(name)}>
            {name ? <span className="chip-dot" style={{ background: participanteColor(name) }} /> : null}
            {name || 'Todos'}
            {name && !activeNames.has(name) && <small>inactivo</small>}
          </button>
        ))}
      </div>

      <div className="mov-filters">
        <label className="mov-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
          <span className="sr-only">Buscar movimientos</span>
          <input type="search" placeholder="Buscar por nombre o monto" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        <div className="segmented mov-type" role="group" aria-label="Tipo de movimiento">
          {[['all', 'Todos'], ['aporte', 'Aportes'], ['retiro', 'Retiros']].map(([value, label]) => (
            <button key={value} type="button" className={`segmented-btn${type === value ? ' sel' : ''}`} aria-pressed={type === value} onClick={() => setType(value)}>
              {type === value && <motion.span className="control-selection" layoutId="movement-type-filter" transition={springTransition} />}
              <span className="control-label">{label}</span>
            </button>
          ))}
        </div>
        <label className="mov-period">
          <span className="sr-only">Período</span>
          <select className="input-base" value={period} onChange={event => setPeriod(event.target.value)}>
            {PERIODS.map(([value, label]) => <option key={String(value)} value={String(value)}>{label}</option>)}
          </select>
        </label>
      </div>

      <AnimatePresence initial={false}>
        {selectedName && <PersonPanel key={selectedName} name={selectedName} range={range} setRange={setRange} />}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        <motion.section key={`${selectedName}-${type}-${period}-${loading ? 'loading' : 'ready'}`} className="card mov-timeline" aria-label="Movimientos" variants={surfaceMotion} initial="hidden" animate="visible" exit="exit" transition={quickTransition}>
          {loading ? <div className="empty">Cargando...</div> : !movements.length ? (
            <div className="empty"><div className="empty-title">Sin movimientos</div><p className="empty-text">{filtered ? 'Ningún movimiento coincide con los filtros.' : 'Los aportes y retiros aparecerán aquí.'}</p></div>
          ) : (groupByMonth(movements) as Array<{ key: string; items: Movement[] }>).map((group, groupIndex) => {
            const [month, year] = monthParts(group.key);
            return (
              <motion.div className="mov-month-group" key={group.key} variants={surfaceMotion} initial="hidden" animate="visible" transition={staggered(groupIndex)}>
                <div className="mov-month-label">
                  <b>{month}</b>
                  <span>{year}</span>
                  <small>{group.items.length} mov.</small>
                </div>
                <ol className="timeline">
                  {group.items.map((movement, index) => {
                    const signed = movement.tipo === 'aporte' ? movement.monto : -movement.monto;
                    const time = normDate(movement.fecha).split('T')[1];
                    return (
                      <li key={`${movement.fecha}-${movement.persona}-${index}`} className={`timeline-item ${movement.tipo}`}>
                        <div className="timeline-row">
                          <span className="timeline-who"><b>{movement.persona}</b> <span>· {fmtDateShort(movement.fecha)}{time ? `, ${time.slice(0, 5)}` : ''}</span></span>
                          <b className={`timeline-amount ${tone(signed)}`} aria-label={`${movement.tipo} de ${fmt(movement.monto)}`}>{signStr(signed)}{fmt(movement.monto)}</b>
                        </div>
                        <div className="timeline-meta">
                          {movement.tipo === 'retiro'
                            ? `Retiró ${fmtPct(porcentajeRetiro(movement))}% de su saldo`
                            : `${movement.monto_cop ? COP(movement.monto_cop) : '—'} · TRM ${movement.trm_dia ? fmtN0(movement.trm_dia) : '—'}`}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </motion.div>
            );
          })}
        </motion.section>
      </AnimatePresence>
    </>
  );
}
