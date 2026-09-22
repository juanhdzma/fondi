import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { S } from '../state.js';
import { calcParticipante, cuotasCirc, latest, participanteOculto, participantesActivos, participantesVisiblesActivos, precioCuota } from '../computed.js';
import { calcularCuotas, excedeSaldo } from '../domain/cuotas.js';
import { exportUrl, postFondo, postImportXlsx, postMovimiento, postParticipante, verifyAdmin } from '../api/backend.js';
import { fmtMoneyInput, parseMoneyValue, resolveContributionExchange } from '../utils/money-input.js';
import { todayLocal } from '../utils/dates.js';
import { COP, fmt, fmtN } from '../utils/format.js';
import { quickTransition, springTransition, surfaceMotion } from '../motion';
import { ParticipantPicker } from './ParticipantPicker';

type Props = { onRefresh: () => Promise<void>; onToast: (message: string) => void };
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

export function Admin({ onRefresh, onToast }: Props) {
  const initialNow = useMemo(localNow, []);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [keyInput, setKeyInput] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [authError, setAuthError] = useState('');
  const [busy, setBusy] = useState('');
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [task, setTask] = useState<'fund' | 'movement'>('fund');
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

  const submitMovement = async () => {
    const date = movementDateTime();
    if (!amountUsd || amountUsd <= 0) return status('movement', 'Ingresa el monto en USD', 'err');
    if (type === 'aporte' && !exchange.amountCOP) return status('movement', conversionMode === 'trm' ? 'Ingresa la TRM aplicada' : 'Ingresa el monto en COP', 'err');
    if (!fundAfter || totalAfter < 0) return status('movement', 'Ingresa el valor del fondo después', 'err');
    if (!date) return status('movement', 'Selecciona una fecha', 'err');
    const shares = calcularCuotas({ tipo: type, monto: amountUsd, valorFondo: totalAfter, cuotasActuales: cuotasCirc() });
    const available = selectedPerson ? calcParticipante(selectedPerson).cuotas : 0;
    if (excedeSaldo({ cuotas: shares.cuotas, cuotasDisponibles: available })) {
      return status('movement', `${selectedPerson} solo tiene ${fmt(available * shares.precioAntes)} USD disponibles`, 'err');
    }

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
        status('movement', '');
        await onRefresh();
        onToast('Guardado');
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
        status('fund', '');
        await onRefresh();
        onToast('Actualizado');
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
        status('participants', '');
        await onRefresh();
        onToast('Agregado');
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
        onToast(action === 'ocultar' ? 'Ocultado' : 'Visible');
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
        status('participants', '');
        await onRefresh();
        onToast('Actualizado');
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
        status('import', '');
        await onRefresh();
        onToast('Importado');
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
        <h1 className="admin-title">Panel de administración</h1>
        <div className="admin-sub">Ingresa la clave para continuar</div>
        <div className="input-row input-row-stack">
          <input className={`input-base input-flex${authError ? ' err' : ''}`} type="password" autoComplete="current-password" aria-label="Clave de acceso" placeholder="Clave de acceso" value={keyInput} onChange={event => setKeyInput(event.target.value)} onKeyDown={event => pressEnter(event, () => void unlock())} />
          <button className="btn btn-green" disabled={busy === 'auth'} onClick={() => void unlock()}>{busy === 'auth' ? 'Verificando...' : 'Entrar'}</button>
        </div>
        <div className="err-msg" role="alert">{authError}</div>
      </motion.div>
    );
  }

  const trmHint = type === 'retiro' ? '' : !amountUsd
    ? conversionMode === 'trm' ? 'Ingresá la tasa real de esta compra; puede diferir de la TRM de hoy.' : 'Ingresá lo pagado en COP y calculamos la TRM aplicada.'
    : !exchange.exchangeRate
      ? conversionMode === 'trm' ? 'Ingresá la TRM aplicada al aporte.' : 'Ingresá el monto pagado en COP.'
      : `${conversionMode === 'trm' ? `Equivale a ${COP(exchange.amountCOP)} COP` : `TRM aplicada: ${fmt(exchange.exchangeRate)}`}${S.trm ? ` · Hoy: ${fmt(S.trm)}` : ''}${deviation > 0.15 ? ` · Confirmá: ${Math.round(deviation * 100)}% ${exchange.exchangeRate > (S.trm || 0) ? 'por encima' : 'por debajo'}; se guardará esta tasa.` : ''}`;
  const movementHint = sharePreview
    ? `Nueva cuota → $${sharePreview.precioDespues.toFixed(2)} (${sharePreview.precioDespues >= currentQuota ? '+' : ''}${((sharePreview.precioDespues - currentQuota) / currentQuota * 100).toFixed(2)}%)`
    : '';
  const fundHint = !totalValue ? '' : !cuotasCirc()
    ? latest() ? 'No hay cuotas en circulación — registrá primero un aporte' : `Primer registro — cuota inicial = $${totalValue.toFixed(2)} USD`
    : `Nueva cuota → $${valuationQuota.toFixed(2)} (${valuationQuota >= currentQuota ? '+' : ''}${((valuationQuota - currentQuota) / currentQuota * 100).toFixed(2)}%)`;

  return (
    <>
      <motion.div className="admin-header" variants={surfaceMotion} initial="hidden" animate="visible" transition={quickTransition}><h1 className="admin-header-title">Administración</h1></motion.div>
      <div className="admin-content">
        <AnimatePresence initial={false}>
          {latestSnapshot && inconsistency > 0.01 && (
            <motion.div key="consistency-warning" className="admin-check" role="alert" variants={surfaceMotion} initial="hidden" animate="visible" exit="exit" transition={quickTransition}><b>Datos inconsistentes.</b> Los movimientos suman {fmtN(cuotasCirc())} cuotas, pero la última valuación registra {fmtN(latestSnapshot.cuotas_circ)} (diferencia de {fmtN(inconsistency)}). Los porcentajes por participante no son confiables hasta que cuadren — revisá el histórico importado.</motion.div>
          )}
        </AnimatePresence>

        <div className="admin-task-selector" role="group" aria-label="Tarea administrativa">
          <button type="button" className={task === 'fund' ? 'active' : ''} aria-pressed={task === 'fund'} onClick={() => setTask('fund')}>
            <span>Actualizar fondo</span><small>Registrar valuación</small>
          </button>
          <button type="button" className={task === 'movement' ? 'active' : ''} aria-pressed={task === 'movement'} onClick={() => setTask('movement')}>
            <span>Nuevo movimiento</span><small>Aporte o retiro</small>
          </button>
        </div>

        <motion.div className="card admin-card-primary" hidden={task !== 'movement'} variants={surfaceMotion} initial="hidden" animate="visible" transition={{ ...springTransition, delay: 0.04 }}>
          <h2 className="section-title">Nuevo movimiento</h2>
          <div className="movement-form-grid">
            <div className="form-group">
              <div className="form-label" id="lbl-persona">Participante</div>
              <ParticipantPicker names={operationParticipants} value={selectedPerson} onChange={setPerson} includeAll={false} labelledBy="lbl-persona" />
              <div className="form-hint">{selectedPerson ? `Saldo actual: ${fmt(participantBalance)} USD` : 'No hay participantes visibles activos.'}</div>
            </div>
            <div className="form-group">
              <div className="form-label" id="lbl-tipo">Tipo</div>
              <div className="tipo-toggle" role="group" aria-labelledby="lbl-tipo">
                {(['aporte', 'retiro'] as const).map(value => <button key={value} type="button" className={`tipo-btn ${value}${type === value ? ' sel' : ''}`} aria-pressed={type === value} onClick={() => setType(value)}>{type === value && <motion.span className="control-selection" layoutId="movement-type" transition={springTransition} />}<span className="control-label">{value === 'aporte' ? 'Aporte' : 'Retiro'}</span></button>)}
              </div>
            </div>
          </div>
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
              <div className="form-hint">{movementHint}</div>
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
          <div className="form-actions-row">
            <DateTimeField mode={movementDateMode} setMode={setMovementDateMode} date={movementDate} setDate={setMovementDate} time={movementTime} setTime={setMovementTime} />
            <div className="form-footer primary-form-footer"><StatusText status={statuses.movement} /><button className="btn btn-green" disabled={busy === 'movement' || !selectedPerson} onClick={() => void submitMovement()}>{busy === 'movement' ? 'Guardando...' : 'Guardar movimiento'}</button></div>
          </div>
        </motion.div>

        <motion.div className="card admin-card-primary" hidden={task !== 'fund'} variants={surfaceMotion} initial="hidden" animate="visible" transition={{ ...springTransition, delay: 0.04 }}>
          <h2 className="section-title">Actualizar fondo</h2>
          <div className="form-group"><label className="form-label" htmlFor="f-valor">Valor total del portafolio (USD)</label><MoneyInput id="f-valor" value={fundValue} onChange={setFundValue} /><div className="form-hint">{fundHint}</div></div>
          <div className="form-actions-row">
            <DateTimeField mode={fundDateMode} setMode={setFundDateMode} date={fundDate} setDate={setFundDate} time={fundTime} setTime={setFundTime} />
            <div className="form-footer primary-form-footer"><StatusText status={statuses.fund} /><button className="btn btn-green" disabled={busy === 'fund'} onClick={() => void submitFund()}>{busy === 'fund' ? 'Guardando...' : 'Guardar valuación'}</button></div>
          </div>
        </motion.div>

        <motion.section className="card admin-secondary" aria-label="Otras tareas" variants={surfaceMotion} initial="hidden" animate="visible" transition={{ ...springTransition, delay: 0.08 }}>
          <details className="admin-section">
            <summary><span>Participantes</span><small>Agregar, ocultar o quitar</small></summary>
            <div className="admin-section-body">
              <div className="participants-manage-list">
                {activeParticipants.length ? activeParticipants.map(name => {
                  const hidden = participanteOculto(name);
                  return (
                    <motion.div className="participant-row" key={name} layout variants={surfaceMotion} initial="hidden" animate="visible" exit="exit" transition={springTransition}>
                      <span>{name}</span>
                      <span className="participant-actions">
                        <button type="button" className="btn-toggle-participant" disabled={busy === 'participants'} title={`${hidden ? 'Mostrar' : 'Ocultar'} en resumen y movimientos`} aria-label={`${hidden ? 'Mostrar' : 'Ocultar'} a ${name} en resumen y movimientos`} onClick={() => void toggleVisibility(name)}><EyeIcon hidden={hidden} /></button>
                        <button type="button" className="btn-remove-participant" disabled={busy === 'participants'} title="Quitar" aria-label={`Quitar a ${name}`} onClick={() => setRemoveName(name)}><CloseIcon /></button>
                      </span>
                    </motion.div>
                  );
                }) : <div className="form-hint">Sin participantes — agrega el primero abajo.</div>}
              </div>
              <div className="form-group"><label className="form-label" htmlFor="f-nuevo-participante">Nuevo participante</label><div className="input-row"><input className="input-base input-flex" id="f-nuevo-participante" placeholder="Nombre" value={newParticipant} onChange={event => setNewParticipant(event.target.value)} onKeyDown={event => pressEnter(event, () => void addParticipant())} /><button className="btn btn-green" disabled={busy === 'participants'} onClick={() => void addParticipant()}>Agregar</button></div></div>
              <div className="form-footer"><StatusText status={statuses.participants} /></div>
            </div>
          </details>

          <details className="admin-section">
            <summary><span>Respaldo y restauración</span><small>Exportar o reemplazar datos</small></summary>
            <div className="admin-section-body">
              <a className="btn btn-dim btn-link" href={exportUrl()}>Descargar respaldo</a>
              <p className="form-hint download-note">Safari puede pedir permiso la primera vez.</p>
              <input ref={importInputRef} key={importFile?.name || 'empty'} hidden type="file" accept=".xlsx" onChange={event => { const file = event.target.files?.[0] || null; setImportFile(file); if (file) setConfirmImport(true); }} />
              <div className="form-footer restore-action"><button className="btn btn-danger" disabled={busy === 'import'} onClick={requestImport}>{busy === 'import' ? 'Restaurando...' : 'Elegir archivo y restaurar'}</button><StatusText status={statuses.import} /></div>
              <p className="form-hint import-warning">Reemplaza todos los datos actuales; el backend crea un backup antes.</p>
            </div>
          </details>
        </motion.section>
      </div>

      <ConfirmDialog open={Boolean(removeName)} onOpenChange={open => { if (!open) setRemoveName(''); }} title={`Quitar a ${removeName}`} description="La persona deja de estar disponible para nuevos movimientos, pero su historial y sus cuotas se mantienen." action="Quitar" onConfirm={() => void removeParticipant()} />
      <ConfirmDialog open={confirmImport} onOpenChange={setConfirmImport} title="Reemplazar todos los datos" description="La importación reemplaza las tres tablas completas por el contenido del archivo. El backend creará un backup antes de continuar." action="Importar archivo" onConfirm={() => void importData()} />
    </>
  );
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

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden
    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 3 18 18" /><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a18.1 18.1 0 0 1-3 3.7M6.2 6.2C3.5 8.1 2 12 2 12s3.5 6 10 6c1.4 0 2.6-.3 3.7-.8" /><circle cx="12" cy="12" r="2.5" /></svg>
    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>;
}
