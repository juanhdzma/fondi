import { useState } from 'react';
import { motion } from 'motion/react';
import { S } from '../state.js';
import { PARTICIPANT_COLORS } from '../config.js';
import { calcParticipante, cuotasCirc, latest, participantesActivos, participantesTodos } from '../computed.js';
import { COP, fmt, fmt0, fmtN, fmtPct, signStr } from '../utils/format.js';
import { HeroChart, periodPct, RANGE_LABELS, rangeHistory } from './Charts';

const ranges = [
  ['1W', '1 semana', '1S'],
  ['2W', '2 semanas', '2S'],
  ['1M', '1 mes', '1M'],
  ['3M', '3 meses', '3M'],
  ['6M', '6 meses', '6M'],
  ['1A', '1 año', '1A'],
  ['todo', 'Todo', 'Todo'],
];

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
      <span className="stat-chg-period"> · {RANGE_LABELS[range]}</span>
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
  const [range, setRange] = useState(S.range);
  const [metric, setMetric] = useState(S.heroMetric);
  const current = latest();

  const selectRange = (value: string) => {
    S.range = value;
    setRange(value);
  };
  const selectMetric = (value: string) => {
    S.heroMetric = value;
    setMetric(value);
  };

  const history = rangeHistory(range);
  const fundChange = periodPct(history, 'valor_total');
  const quotaChange = periodPct(history, 'precio_cuota');
  const totalShares = cuotasCirc();
  const participants = participantesTodos()
    .map(name => calcParticipante(name))
    .sort((a, b) => b.cuotas - a.cuotas);
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

      <div className="overview-grid">
        <div className="chart-card">
          <div className="hero-toggle" role="group" aria-label="Métrica del gráfico">
            {metrics.map(([value, label]) => (
              <button key={value} className={`hero-tab${metric === value ? ' active' : ''}`} aria-pressed={metric === value} onClick={() => selectMetric(value)}>
                {label}
              </button>
            ))}
          </div>
          <motion.div
            key={`${range}-${metric}`}
            className="chart-wrap"
            initial={{ opacity: 0.15, transform: 'translateY(8px) scale(0.97)' }}
            animate={{ opacity: 1, transform: 'translateY(0) scale(1)' }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <HeroChart range={range} metric={metric} />
          </motion.div>
          <div className="range-btns" role="group" aria-label="Período del gráfico">
            {ranges.map(([value, full, short]) => (
              <button key={value} className={`range-btn${range === value ? ' active' : ''}`} aria-pressed={range === value} onClick={() => selectRange(value)}>
                <span className="rl-full">{full}</span><span className="rl-short">{short}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="stat-rail">
          <div className="stat stat-primary">
            <div className="stat-label">Valor del fondo</div>
            <div className="stat-value">{current ? `${fmt0(current.valor_total)} USD` : '—'}</div>
            <Change value={fundChange} range={range} />
            <div className="stat-sub">
              <div className="stat-sub-item"><span>Aportado</span><b>{current ? `${fmt0(contributed)} USD` : '—'}</b></div>
              <div className="stat-sub-item">
                <span>Ganancia</span>
                <b className={gain > 0 ? 'pos' : gain < 0 ? 'neg' : ''}>
                  {current ? `${signStr(gain)}${fmt0(Math.abs(gain))} USD (${signStr(gainPercentage)}${fmtPct(Math.abs(gainPercentage))}%)` : '—'}
                </b>
              </div>
            </div>
          </div>
          <div className="stat stat-secondary">
            <div className="stat-label">Precio de cuota</div>
            <div className="stat-value">{current ? `${fmt(current.precio_cuota)} USD` : '—'}</div>
            <Change value={quotaChange} range={range} />
            <div className="stat-sub">
              <div className="stat-sub-item"><span>Cuotas totales</span><b>{current ? fmtN(totalShares) : '—'}</b></div>
              <div className="stat-sub-item"><span>Valor en COP</span><b>{current ? `${COP(Math.round(current.precio_cuota * (S.trm || 1)))} COP` : '—'}</b></div>
            </div>
          </div>
        </div>
      </div>

      <div className="section-label">Participantes <span className="section-count">{loading ? '—' : participantesActivos().length} activos</span></div>
      <div className="participants-grid">
        {loading ? <LoadingParticipants /> : !current ? (
          <div className="empty"><div className="empty-title">Fondo vacío</div><div className="empty-text">El admin puede registrar aportes y el primer valor del fondo en el panel Admin.</div></div>
        ) : participants.map((participant, index) => {
          const tone = PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
          const percentage = totalShares > 0 ? Math.max(0, participant.cuotas) / totalShares * 100 : 0;
          const gainTone = participant.ganancia_pct > 0 ? 'pos' : participant.ganancia_pct < 0 ? 'neg' : 'zero';
          return (
            <div className="p-row" key={participant.nombre}>
              <div className="p-avatar" style={{ background: tone }}>{participant.nombre.charAt(0).toUpperCase()}</div>
              <div className="p-main">
                <div className="p-name">{participant.nombre}</div>
                <div className="p-bar-row">
                  <div className="p-bar"><span style={{ width: `${percentage.toFixed(1)}%`, background: tone }} /></div>
                  <span className="p-pct">{percentage.toFixed(0)}%</span>
                </div>
              </div>
              <div className="p-figures">
                <div className="p-monto">{fmt0(participant.valor_actual)}</div>
                <div className={`p-chg ${gainTone}`}>{signStr(participant.ganancia_pct)}{fmtPct(Math.abs(participant.ganancia_pct))}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
