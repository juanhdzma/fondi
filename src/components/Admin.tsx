import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { S } from '../state.js';
import { calcParticipante, cuotasCirc, latest, participanteColor, participanteOculto, participantesActivos, participantesVisiblesActivos, precioCuota } from '../computed.js';
import { calcularCuotas, excedeSaldo, participacion } from '../domain/cuotas.js';
import { exportUrl, postFondo, postImportXlsx, postMovimiento, postParticipante, verifyAdmin } from '../api/backend.js';
import { fmtMoneyInput, parseMoneyValue, resolveContributionExchange } from '../utils/money-input.js';
import { fmtDateShort, todayLocal } from '../utils/dates.js';
import { COP, fmt, fmtN, fmtPct, fmtQuota } from '../utils/format.js';
import { quickTransition, springTransition, staggered, surfaceMotion } from '../motion';
import { ParticipantPicker } from './ParticipantPicker';
import { PageHeading } from './PageHeading';

type Props = { onRefresh: () => Promise<void> };
type Tone = '' | 'ok' | 'err';
type Status = { message: string; tone: Tone };

function localNow() {
  const date = new Date();
  const day = todayLocal(date);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return { day, time, iso: `${day}T${time}` };
}

function MoneyInput({ id, value, onChange, decimals = 2, suffix, placeholder = '0,00', action, onAction }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  decimals?: number;
  suffix?: string;
  placeholder?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`money-wrap${suffix ? ' money-wrap-suffix' : ''}${action ? ' money-wrap-action' : ''}`}>
      <span className="currency-pfx">$</span>
      <input
        className="form-input"
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={event => {
          fmtMoneyInput(event.currentTarget, decimals);
          onChange(event.currentTarget.value);
        }}
      />
      {suffix && <span className="currency-sfx">{suffix}</span>}
      {action && <button className="money-action" type="button" onClick={onAction}>{action}</button>}
    </div>
  );
}

function ConfirmDialog({ open, onOpenChange, title, description, action, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} className="dialog-content" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={() => onOpenChange(false)} onClose={() => onOpenChange(false)}>
      <div className="dialog-layout">
        <div className="dialog-header">
          <h2 className="dialog-title" id={titleId}>{title}</h2>
          <p className="dialog-description" id={descriptionId}>{description}</p>
        </div>
        <div className="dialog-footer">
          <button className="btn btn-dim" type="button" onClick={() => onOpenChange(false)}>Cancelar</button>
          <button className="btn btn-danger" type="button" onClick={onConfirm}>{action}</button>
        </div>
      </div>
    </dialog>
  );
}

export function Admin({ onRefresh }: Props) {
  const initialNow = useMemo(localNow, []);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [keyInput, setKeyInput] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [authError, setAuthError] = useState('');
  const [busy, setBusy] = useState('');
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [task, setTask] = useState<'fund' | 'movement'>('fund');
  const [step, setStep] = useState(1);
  const [panel, setPanel] = useState('');
  const [type, setType] = useState<'aporte' | 'retiro'>('aporte');
  const [person, setPerson] = useState('');
  const [usd, setUsd] = useState('');
  const [cop, setCop] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [conversionMode, setConversionMode] = useState<'cop' | 'trm'>('cop');
  const [fundAfter, setFundAfter] = useState('');
  const [movementDateMode, setMovementDateMode] = useState<'now' | 'custom'>('now');
  const [movementDate, setMovementDate] = useState(initialNow.day);
  const [movementTime, setMovementTime] = useState(initialNow.time);
  const [fundValue, setFundValue] = useState('');
  const [fundDateMode, setFundDateMode] = useState<'now' | 'custom'>('now');
  const [fundDate, setFundDate] = useState(initialNow.day);
  const [fundTime, setFundTime] = useState(initialNow.time);
  const [newParticipant, setNewParticipant] = useState('');
  const [removeName, setRemoveName] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);

  const activeParticipants = participantesActivos();
  const operationParticipants = participantesVisiblesActivos();
  const selectedPerson = operationParticipants.includes(person) ? person : operationParticipants[0] || '';
  const participantBalance = selectedPerson ? calcParticipante(selectedPerson).valor_actual : 0;
  const amountUsd = parseMoneyValue(usd);
  const amountCop = parseMoneyValue(cop);
  const manualRate = parseMoneyValue(exchangeRate);
  const totalAfter = parseMoneyValue(fundAfter);
  const totalValue = parseMoneyValue(fundValue);
  const exchange = type === 'retiro'
    ? { amountCOP: 0, exchangeRate: 0 }
    : resolveContributionExchange({ usd: amountUsd, mode: conversionMode, cop: amountCop, trm: manualRate });
  const deviation = S.trm && exchange.exchangeRate ? Math.abs(exchange.exchangeRate - S.trm) / S.trm : 0;
  const sharePreview = amountUsd && totalAfter
    ? calcularCuotas({ tipo: type, monto: amountUsd, valorFondo: totalAfter, cuotasActuales: cuotasCirc() })
    : null;
  const currentQuota = precioCuota();
  const valuationQuota = totalValue && cuotasCirc() ? totalValue / cuotasCirc() : 0;
  const latestSnapshot = latest();
  const inconsistency = latestSnapshot ? Math.abs(cuotasCirc() - latestSnapshot.cuotas_circ) : 0;

  const status = (section: string, message: string, tone: Tone = '') => {
    setStatuses(current => ({ ...current, [section]: { message, tone } }));
  };

  useEffect(() => {
    setStatuses(current => current.movement?.tone === 'err' ? { ...current, movement: { message: '', tone: '' } } : current);
  }, [usd, cop, exchangeRate, fundAfter, type, person, conversionMode]);

  const run = async (name: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(name);
    try {
      await action();
    } finally {
      setBusy('');
    }
  };

  const unlock = async () => {
    if (!keyInput) {
      setAuthError('Ingresa la clave');
      return;
    }
    await run('auth', async () => {
      setAuthError('');
      try {
        await verifyAdmin(keyInput);
        setAdminKey(keyInput);
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : String(error));
      }
    });
  };

  const movementDateTime = () => {
    if (movementDateMode === 'now') return localNow().iso;
    return movementDate ? `${movementDate}T${movementTime || '00:00'}` : '';
  };

  const fundDateTime = () => {
    if (fundDateMode === 'now') return localNow().iso;
    return fundDate ? `${fundDate}T${fundTime || '00:00'}` : '';
  };

  const amountsError = () => {
    if (!amountUsd || amountUsd <= 0) return 'Ingresa el monto en USD';
    if (type === 'aporte' && !exchange.amountCOP) return conversionMode === 'trm' ? 'Ingresa la TRM aplicada' : 'Ingresa el monto en COP';
    if (!fundAfter || totalAfter < 0) return 'Ingresa el valor del fondo después';
    const shares = calcularCuotas({ tipo: type, monto: amountUsd, valorFondo: totalAfter, cuotasActuales: cuotasCirc() });
    const available = selectedPerson ? calcParticipante(selectedPerson).cuotas : 0;
    if (excedeSaldo({ cuotas: shares.cuotas, cuotasDisponibles: available })) return `${selectedPerson} solo tiene ${fmt(available * shares.precioAntes)} disponibles`;
    return '';
  };

  const goToStep = (next: number) => {
    if (next >= 2 && !selectedPerson) return status('movement', 'Elige un participante', 'err');
    if (next >= 3) {
      const error = amountsError();
      if (error) return status('movement', error, 'err');
    }
    status('movement', '');
    setStep(next);
  };

  const submitMovement = async () => {
    const date = movementDateTime();
    const error = amountsError();
    if (error) return status('movement', error, 'err');
    if (!date) return status('movement', 'Selecciona una fecha', 'err');
    const saved = `${type === 'aporte' ? 'Aporte' : 'Retiro'} de ${selectedPerson} por ${fmt(amountUsd)} guardado`;

    await run('movement', async () => {
      status('movement', 'Guardando...');
      try {
        await postMovimiento({
          fecha: date,
          persona: selectedPerson,
          tipo: type,
          monto_usd: amountUsd,
          monto_cop: exchange.amountCOP,
          trm_dia: exchange.exchangeRate,
          fondo: { valor_total_usd: totalAfter, trm: S.trm || 0 },
        }, adminKey);
        setUsd('');
        setCop('');
        setExchangeRate('');
        setFundAfter('');
        setStep(1);
        await onRefresh();
        status('movement', saved, 'ok');
      } catch (error) {
        status('movement', error instanceof Error ? error.message : String(error), 'err');
      }
    });
  };

  const submitFund = async () => {
    const date = fundDateTime();
    if (!totalValue || totalValue <= 0) return status('fund', 'Valor inválido', 'err');
    if (!date) return status('fund', 'Selecciona una fecha', 'err');
    if (!cuotasCirc() && latest()) return status('fund', 'No hay cuotas en circulación — registrá primero un aporte', 'err');
    await run('fund', async () => {
      status('fund', 'Guardando...');
      try {
        await postFondo({ fecha: date, valor_total_usd: totalValue, trm: S.trm || 0 }, adminKey);
        setFundValue('');
        await onRefresh();
        status('fund', `Valuación de ${fmt(totalValue)} guardada`, 'ok');
      } catch (error) {
        status('fund', error instanceof Error ? error.message : String(error), 'err');
      }
    });
  };

  const addParticipant = async () => {
    const name = newParticipant.trim();
    if (!name) return status('participants', 'Ingresa un nombre', 'err');
    if (activeParticipants.some(existing => existing.toLowerCase() === name.toLowerCase())) return status('participants', 'Ya existe ese participante', 'err');
    await run('participants', async () => {
      status('participants', 'Guardando...');
      try {
        await postParticipante({ fecha: localNow().iso, nombre: name, accion: 'agregar' }, adminKey);
        setNewParticipant('');
        await onRefresh();
        status('participants', `${name} agregado`, 'ok');
      } catch (error) {
        status('participants', error instanceof Error ? error.message : String(error), 'err');
      }
    });
  };

  const toggleVisibility = async (name: string) => {
    const action = participanteOculto(name) ? 'mostrar' : 'ocultar';
    await run('participants', async () => {
      try {
        await postParticipante({ fecha: localNow().iso, nombre: name, accion: action }, adminKey);
        await onRefresh();
        status('participants', `${name} ahora está ${action === 'ocultar' ? 'oculto' : 'visible'}`, 'ok');
      } catch (error) {
        status('participants', error instanceof Error ? error.message : String(error), 'err');
      }
    });
  };

  const removeParticipant = async () => {
    const name = removeName;
    setRemoveName('');
    await run('participants', async () => {
      status('participants', 'Guardando...');
      try {
        await postParticipante({ fecha: localNow().iso, nombre: name, accion: 'quitar' }, adminKey);
        await onRefresh();
        status('participants', `${name} quitado de la lista`, 'ok');
      } catch (error) {
        status('participants', error instanceof Error ? error.message : String(error), 'err');
      }
    });
  };

  const requestImport = () => {
    if (!importFile) {
      importInputRef.current?.click();
      return;
    }
    setConfirmImport(true);
  };

  const importData = async () => {
    const file = importFile;
    setConfirmImport(false);
    if (!file) return;
    await run('import', async () => {
      status('import', 'Importando...');
      try {
        await postImportXlsx(file, adminKey);
        setImportFile(null);
        await onRefresh();
        status('import', 'Datos restaurados', 'ok');
      } catch (error) {
        status('import', error instanceof Error ? error.message : String(error), 'err');
      }
    });
  };

  const pressEnter = (event: KeyboardEvent<HTMLInputElement>, action: () => void) => {
    if (event.key === 'Enter') action();
  };

  if (!adminKey) {
    return (
      <motion.div className="admin-lock" variants={surfaceMotion} initial="hidden" animate="visible" transition={springTransition}>
        <div className="admin-lock-kicker"><Icon name="lock" /> Administración</div>
        <h1 className="admin-title">Ingresa la clave.</h1>
        <div className={`admin-lock-field${authError ? ' err' : ''}`}>
          <input type="password" autoComplete="current-password" aria-label="Clave de acceso" placeholder="••••••••" value={keyInput} onChange={event => setKeyInput(event.target.value)} onKeyDown={event => pressEnter(event, () => void unlock())} />
          <button className="btn btn-green" disabled={busy === 'auth'} onClick={() => void unlock()}>{busy === 'auth' ? 'Verificando...' : 'Entrar'}</button>
        </div>
        <div className="err-msg" role="alert">{authError}</div>
        <p className="admin-lock-hint">Tras 10 intentos fallidos se bloquea 5 minutos.</p>
      </motion.div>
    );
  }

  const trmHint = type === 'retiro' ? '' : !amountUsd
    ? conversionMode === 'trm' ? 'Ingresá la tasa real de esta compra; puede diferir de la TRM de hoy.' : 'Ingresá lo pagado en COP y calculamos la TRM aplicada.'
    : !exchange.exchangeRate
      ? conversionMode === 'trm' ? 'Ingresá la TRM aplicada al aporte.' : 'Ingresá el monto pagado en COP.'
      : `${conversionMode === 'trm' ? `Equivale a ${COP(exchange.amountCOP)}` : `TRM aplicada: ${fmtN(exchange.exchangeRate)}`}${S.trm ? ` · Hoy: ${fmtN(S.trm)}` : ''}${deviation > 0.15 ? ` · Confirmá: ${Math.round(deviation * 100)}% ${exchange.exchangeRate > (S.trm || 0) ? 'por encima' : 'por debajo'}; se guardará esta tasa.` : ''}`;
  const movementHint = sharePreview
    ? `Nueva cuota → $${sharePreview.precioDespues.toFixed(2)} (${sharePreview.precioDespues >= currentQuota ? '+' : ''}${((sharePreview.precioDespues - currentQuota) / currentQuota * 100).toFixed(2)}%)`
    : '';
  const fundHint = !totalValue ? '' : !cuotasCirc()
    ? latest() ? 'No hay cuotas en circulación — registrá primero un aporte' : `Primer registro — cuota inicial = $${totalValue.toFixed(2)} USD`
    : `Nueva cuota → $${valuationQuota.toFixed(2)} (${valuationQuota >= currentQuota ? '+' : ''}${((valuationQuota - currentQuota) / currentQuota * 100).toFixed(2)}%)`;

  const personShares = selectedPerson ? calcParticipante(selectedPerson).cuotas : 0;
  const shareChange = sharePreview ? participacion({ cuotasPersona: personShares, cuotasTotal: cuotasCirc(), cuotasMovimiento: sharePreview.cuotas }) : null;
  const hiddenCount = activeParticipants.filter(name => participanteOculto(name)).length;
  const whenLabel = movementDateMode === 'now' ? 'Ahora' : movementDate ? `${fmtDateShort(movementDate)} ${movementDate.slice(0, 4)}, ${movementTime || '00:00'}` : '—';
  const steps = ['Quién', 'Montos', 'Confirmar'];

  return (
    <>
      <PageHeading title="Administración">
        <div className="admin-actions" role="group" aria-label="Tarea administrativa">
          <button type="button" className={`btn ${task === 'movement' ? 'btn-green' : 'btn-dim'}`} aria-pressed={task === 'movement'} onClick={() => setTask('movement')}><Icon name="plus" /> Movimiento</button>
          <button type="button" className={`btn ${task === 'fund' ? 'btn-green' : 'btn-dim'}`} aria-pressed={task === 'fund'} onClick={() => setTask('fund')}><Icon name="trend" /> Actualizar valor</button>
        </div>
      </PageHeading>
      <div className="admin-content">
        <AnimatePresence initial={false}>
          {latestSnapshot && inconsistency > 0.01 && (
            <motion.div key="consistency-warning" className="admin-check" role="alert" variants={surfaceMotion} initial="hidden" animate="visible" exit="exit" transition={quickTransition}><b>Datos inconsistentes.</b> Los movimientos suman {fmtN(cuotasCirc())} cuotas, pero la última valuación registra {fmtN(latestSnapshot.cuotas_circ)} (diferencia de {fmtN(inconsistency)}). Los porcentajes por participante no son confiables hasta que cuadren — revisá el histórico importado.</motion.div>
          )}
        </AnimatePresence>

        {task === 'movement' ? (
          <motion.section key="movement" className="card admin-card-primary" aria-labelledby="movement-title" variants={surfaceMotion} initial="hidden" animate="visible" transition={staggered(0)}>
            <h2 className="section-title" id="movement-title">Nuevo movimiento</h2>
            <ol className="stepper">
              {steps.map((label, index) => {
                const number = index + 1;
                return (
                  <li key={label} className={number < step ? 'done' : number === step ? 'current' : ''}>
                    <button type="button" disabled={number > step} aria-current={number === step ? 'step' : undefined} onClick={() => { status('movement', ''); setStep(number); }}>
                      <span className="step-dot">{number < step ? <Icon name="check" /> : number}</span>
                      {label}
                    </button>
                  </li>
                );
              })}
            </ol>

            {step === 1 && (
              <div className="movement-form-grid">
                <div className="form-group">
                  <div className="form-label" id="lbl-persona">Participante</div>
                  <ParticipantPicker names={operationParticipants} value={selectedPerson} onChange={setPerson} includeAll={false} labelledBy="lbl-persona" />
                  <div className="form-hint">{selectedPerson ? `Saldo actual: ${fmt(participantBalance)}` : 'No hay participantes visibles activos.'}</div>
                </div>
                <div className="form-group">
                  <div className="form-label" id="lbl-tipo">Tipo</div>
                  <div className="tipo-toggle" role="group" aria-labelledby="lbl-tipo">
                    {(['aporte', 'retiro'] as const).map(value => <button key={value} type="button" className={`tipo-btn ${value}${type === value ? ' sel' : ''}`} aria-pressed={type === value} onClick={() => setType(value)}>{type === value && <motion.span className="control-selection" layoutId="movement-type" transition={springTransition} />}<span className="control-label">{value === 'aporte' ? 'Aporte' : 'Retiro'}</span></button>)}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <>
                <p className="step-context">{selectedPerson} · {type === 'aporte' ? 'Aporte' : 'Retiro'}</p>
                <div className="movement-form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="f-monto">Monto (USD)</label>
                    <MoneyInput
                      id="f-monto"
                      value={usd}
                      onChange={setUsd}
                      action={type === 'retiro' && participantBalance > 0 ? 'Retirar todo' : undefined}
                      onAction={() => {
                        setUsd(String(participantBalance).replace('.', ','));
                        setFundAfter(String(Math.max(0, (latest()?.valor_total || 0) - participantBalance)).replace('.', ','));
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="f-valor-mov">Valor del fondo después (USD) <span className="required">*</span></label>
                    <MoneyInput id="f-valor-mov" value={fundAfter} onChange={setFundAfter} />
                    <div className="form-hint">{movementHint || (latest() ? `Antes del movimiento: ${fmt(latest()!.valor_total)}` : '')}</div>
                  </div>
                </div>
                {type === 'aporte' && (
                  <div className="form-group conversion-group">
                    <div className="conversion-controls">
                      <div>
                        <div className="form-label" id="lbl-conversion">Conversión del aporte</div>
                        <div className="segmented" role="group" aria-labelledby="lbl-conversion">
                          <button type="button" className={`segmented-btn${conversionMode === 'cop' ? ' sel' : ''}`} aria-pressed={conversionMode === 'cop'} onClick={() => setConversionMode('cop')}>{conversionMode === 'cop' && <motion.span className="control-selection" layoutId="conversion-mode" transition={springTransition} />}<span className="control-label">Monto COP</span></button>
                          <button type="button" className={`segmented-btn${conversionMode === 'trm' ? ' sel' : ''}`} aria-pressed={conversionMode === 'trm'} onClick={() => setConversionMode('trm')}>{conversionMode === 'trm' && <motion.span className="control-selection" layoutId="conversion-mode" transition={springTransition} />}<span className="control-label">TRM aplicada</span></button>
                        </div>
                      </div>
                      <div className="conversion-field">
                        <label className="sr-only" htmlFor={conversionMode === 'cop' ? 'f-monto-cop' : 'f-trm'}>{conversionMode === 'cop' ? 'Monto pagado en COP' : 'TRM aplicada al aporte'}</label>
                        {conversionMode === 'cop'
                          ? <MoneyInput id="f-monto-cop" value={cop} onChange={setCop} decimals={0} suffix="COP" placeholder="0" />
                          : <MoneyInput id="f-trm" value={exchangeRate} onChange={setExchangeRate} suffix="COP/USD" placeholder="4.000,00" />}
                      </div>
                    </div>
                    <div className={`form-hint${deviation > 0.15 ? ' notice' : ''}`} role="status" aria-live="polite">{trmHint}</div>
                  </div>
                )}
              </>
            )}

            {step === 3 && sharePreview && (
              <>
                <div className="receipt" role="group" aria-label="Resumen del movimiento">
                  <div className="receipt-row"><b>{type === 'aporte' ? 'APORTE' : 'RETIRO'}</b><span>{whenLabel}</span></div>
                  <hr />
                  <div className="receipt-row"><span>Participante</span><span>{selectedPerson}</span></div>
                  <div className="receipt-row"><span>Monto</span><span>{fmt(amountUsd)}</span></div>
                  {type === 'aporte' && <div className="receipt-row"><span>Pagado</span><span>{COP(exchange.amountCOP)}</span></div>}
                  {type === 'aporte' && <div className="receipt-row"><span>TRM aplicada</span><span>{fmtN(exchange.exchangeRate)}</span></div>}
                  <div className="receipt-row"><span>Fondo después</span><span>{fmt(totalAfter)}</span></div>
                  <hr />
                  <div className="receipt-row"><span>Precio de cuota</span><span>{fmtQuota(sharePreview.precioAntes)}</span></div>
                  <div className="receipt-row"><span>Cuotas</span><b>{sharePreview.cuotas >= 0 ? '+' : '−'}{fmtN(Math.abs(sharePreview.cuotas))}</b></div>
                  {shareChange && <div className="receipt-row"><span>Participación</span><b>{fmtPct(shareChange.antes)}% → {fmtPct(shareChange.despues)}%</b></div>}
                  <div className="receipt-row"><span>Nueva cuota</span><span>{fmtQuota(sharePreview.precioDespues)}</span></div>
                </div>
                <DateTimeField mode={movementDateMode} setMode={setMovementDateMode} date={movementDate} setDate={setMovementDate} time={movementTime} setTime={setMovementTime} />
              </>
            )}

            <div className="step-footer">
              <StatusText status={statuses.movement} />
              <div className="step-buttons">
                {step > 1 && <button className="btn btn-dim" type="button" onClick={() => { status('movement', ''); setStep(step - 1); }}>Atrás</button>}
                {step < 3
                  ? <button className="btn btn-green btn-block" type="button" disabled={!selectedPerson} onClick={() => goToStep(step + 1)}>Continuar</button>
                  : <button className="btn btn-green btn-block" type="button" disabled={busy === 'movement' || !selectedPerson} onClick={() => void submitMovement()}>{busy === 'movement' ? 'Guardando...' : 'Guardar movimiento'}</button>}
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.section key="fund" className="card admin-card-primary" aria-labelledby="fund-title" variants={surfaceMotion} initial="hidden" animate="visible" transition={staggered(0)}>
            <h2 className="section-title" id="fund-title">Actualizar valor del fondo</h2>
            <div className="form-group"><label className="form-label" htmlFor="f-valor">Valor total del portafolio (USD)</label><MoneyInput id="f-valor" value={fundValue} onChange={setFundValue} /><div className="form-hint">{fundHint || (latest() ? `Último valor: ${fmt(latest()!.valor_total)}` : '')}</div></div>
            <DateTimeField mode={fundDateMode} setMode={setFundDateMode} date={fundDate} setDate={setFundDate} time={fundTime} setTime={setFundTime} />
            <div className="step-footer">
              <StatusText status={statuses.fund} />
              <div className="step-buttons">
                <button className="btn btn-green btn-block" type="button" disabled={busy === 'fund'} onClick={() => void submitFund()}>{busy === 'fund' ? 'Guardando...' : 'Guardar valuación'}</button>
              </div>
            </div>
          </motion.section>
        )}

        <motion.section className="card admin-settings" aria-label="Otras tareas" variants={surfaceMotion} initial="hidden" animate="visible" transition={staggered(1)}>
          <button type="button" className="settings-row" aria-expanded={panel === 'participants'} aria-controls="settings-participants" onClick={() => setPanel(panel === 'participants' ? '' : 'participants')}>
            <Icon name="users" />
            <span className="settings-text"><b>Participantes</b><small>{activeParticipants.length} activos{hiddenCount ? ` · ${hiddenCount} ocultos` : ''}</small></span>
            <span className={`settings-chevron${panel === 'participants' ? ' open' : ''}`}><Icon name="chevron" /></span>
          </button>
          <AnimatePresence initial={false}>
            {panel === 'participants' && (
              <motion.div key="participants" id="settings-participants" className="settings-panel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={quickTransition}>
                {activeParticipants.length ? (
                  <table className="admin-table">
                    <thead><tr><th>Nombre</th><th>Estado</th><th>Visible</th><th><span className="sr-only">Quitar</span></th></tr></thead>
                    <tbody>
                      {activeParticipants.map(name => {
                        const hidden = participanteOculto(name);
                        return (
                          <tr key={name}>
                            <td><span className="name-cell"><span className="chip-dot" style={{ background: participanteColor(name) }} />{name}</span></td>
                            <td><span className={`status-pill${hidden ? '' : ' on'}`}>{hidden ? 'Oculto' : 'Activo'}</span></td>
                            <td><button type="button" role="switch" className="switch" aria-checked={!hidden} disabled={busy === 'participants'} aria-label={`Mostrar a ${name} en resumen y movimientos`} onClick={() => void toggleVisibility(name)}><span /></button></td>
                            <td className="cell-end"><button type="button" className="btn-remove-participant" disabled={busy === 'participants'} title="Quitar" aria-label={`Quitar a ${name}`} onClick={() => setRemoveName(name)}><CloseIcon /></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : <div className="form-hint">Sin participantes — agrega el primero abajo.</div>}
                <div className="form-group add-participant"><label className="form-label" htmlFor="f-nuevo-participante">Nuevo participante</label><div className="input-row"><input className="input-base input-flex" id="f-nuevo-participante" placeholder="Nombre" value={newParticipant} onChange={event => setNewParticipant(event.target.value)} onKeyDown={event => pressEnter(event, () => void addParticipant())} /><button className="btn btn-green" disabled={busy === 'participants'} onClick={() => void addParticipant()}>Agregar</button></div></div>
                <StatusText status={statuses.participants} />
              </motion.div>
            )}
          </AnimatePresence>
          <a className="settings-row" href={exportUrl()}>
            <Icon name="download" />
            <span className="settings-text"><b>Exportar respaldo</b><small>.xlsx con las 3 tablas · Safari puede pedir permiso</small></span>
            <span className="settings-chevron"><Icon name="chevron" /></span>
          </a>
          <button type="button" className="settings-row danger" disabled={busy === 'import'} onClick={requestImport}>
            <Icon name="upload" />
            <span className="settings-text"><b>{busy === 'import' ? 'Restaurando...' : 'Restaurar desde archivo'}</b><small>Reemplaza todos los datos; el backend crea un backup antes</small></span>
            <span className="settings-chevron"><Icon name="chevron" /></span>
          </button>
          <input ref={importInputRef} key={importFile?.name || 'empty'} hidden type="file" accept=".xlsx" onChange={event => { const file = event.target.files?.[0] || null; setImportFile(file); if (file) setConfirmImport(true); }} />
          <StatusText status={statuses.import} />
        </motion.section>
      </div>

      <ConfirmDialog open={Boolean(removeName)} onOpenChange={open => { if (!open) setRemoveName(''); }} title={`Quitar a ${removeName}`} description="La persona deja de estar disponible para nuevos movimientos, pero su historial y sus cuotas se mantienen." action="Quitar" onConfirm={() => void removeParticipant()} />
      <ConfirmDialog open={confirmImport} onOpenChange={setConfirmImport} title="Reemplazar todos los datos" description="La importación reemplaza las tres tablas completas por el contenido del archivo. El backend creará un backup antes de continuar." action="Importar archivo" onConfirm={() => void importData()} />
    </>
  );
}

const ICON_PATHS: Record<string, React.ReactNode> = {
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  upload: <path d="M12 20V9M7 14l5-5 5 5M5 4h14" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  check: <path d="m5 12 4.5 4.5L19 7" />,
};

function Icon({ name }: { name: string }) {
  return <svg className="ic" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON_PATHS[name]}</svg>;
}

function StatusText({ status }: { status?: Status }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {status?.message && (
        <motion.span key={`${status.tone}-${status.message}`} className={`form-status${status.tone ? ` ${status.tone}` : ''}`} variants={surfaceMotion} initial="hidden" animate="visible" exit="exit" transition={quickTransition}>
          {status.message}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function DateTimeField({ mode, setMode, date, setDate, time, setTime }: {
  mode: 'now' | 'custom';
  setMode: (mode: 'now' | 'custom') => void;
  date: string;
  setDate: (date: string) => void;
  time: string;
  setTime: (time: string) => void;
}) {
  return (
    <details className="date-options" onToggle={event => setMode(event.currentTarget.open ? 'custom' : 'now')}>
      <summary>{mode === 'custom' ? 'Fecha personalizada' : 'Cambiar fecha y hora'}</summary>
      <div className="datetime-row" role="group" aria-label="Fecha y hora personalizadas">
        <label className="datetime-field"><span>Fecha</span><input className="form-input" type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
        <label className="datetime-field"><span>Hora</span><input className="form-input" type="time" value={time} onChange={event => setTime(event.target.value)} /></label>
      </div>
    </details>
  );
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>;
}
