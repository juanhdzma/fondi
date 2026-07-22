import { API_BASE_URL } from './config.js';
import { S } from './state.js';
import { cuotasCirc, precioCuota, participantesActivos } from './computed.js';
import { fetchAll, postMovimiento, postFondo, postParticipante, exportUrl, postImportXlsx } from './api/backend.js';
import { fmtMoneyInput, parseMoneyInput } from './utils/money-input.js';
import { showToast } from './ui/toast.js';

let adminKey = '';

function setStatus(el, cls, msg) {
  el.className = 'form-status' + (cls ? ' ' + cls : '');
  el.textContent = msg;
}

function nowLocal() {
  const now  = new Date();
  const date = now.toISOString().split('T')[0];
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return { date, time, iso: `${date}T${time}` };
}

async function unlockAdmin() {
  const val = document.getElementById('admin-key').value;
  const errEl = document.getElementById('key-err');
  try {
    const r = await fetch(`${API_BASE_URL}/api/auth/verify`, {
      method: 'POST',
      headers: { 'X-Admin-Key': val },
    });
    if (!r.ok) throw new Error();
    adminKey = val;
    document.getElementById('admin-lock').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    initAdminForms();
  } catch {
    document.getElementById('admin-key').classList.add('err');
    errEl.textContent = 'Clave incorrecta';
    setTimeout(() => {
      document.getElementById('admin-key').classList.remove('err');
    }, 1500);
  }
}

function setTipo(tipo) {
  document.getElementById('f-tipo').value = tipo;
  document.querySelector('.tipo-btn.aporte').classList.toggle('sel', tipo === 'aporte');
  document.querySelector('.tipo-btn.retiro').classList.toggle('sel', tipo === 'retiro');
  saveFormSnapshot();
}

// Safari a veces vacía los <input type="date">/<input type="time"> cuando su contenedor
// pasa por display:none (cambio de tab) o durante un reflow grande (renderAll() tras guardar).
// Por eso el form no confía solo en que el navegador retenga el valor: lo espejamos acá y
// lo reponemos después de esos dos momentos.
const FORM_FIELDS = [
  'f-persona', 'f-tipo', 'f-monto-cop', 'f-monto', 'f-valor-mov', 'f-fecha', 'f-hora',
  'f-valor', 'f-fecha-fondo', 'f-hora-fondo',
];
const formSnapshot = {};

function saveFormSnapshot() {
  for (const id of FORM_FIELDS) {
    const el = document.getElementById(id);
    if (el) formSnapshot[id] = el.value;
  }
}

export function restoreFormSnapshot() {
  for (const id of FORM_FIELDS) {
    const el = document.getElementById(id);
    if (el && formSnapshot[id] !== undefined && el.value !== formSnapshot[id]) el.value = formSnapshot[id];
  }
}

function initAdminForms() {
  const { date, time } = nowLocal();
  document.getElementById('f-fecha').value        = date;
  document.getElementById('f-hora').value         = time;
  document.getElementById('f-fecha-fondo').value  = date;
  document.getElementById('f-hora-fondo').value   = time;
  previewFondo();
  renderAdminParticipants();
  saveFormSnapshot();
}

export function renderAdminParticipants() {
  const nombres = participantesActivos();

  const sel = document.getElementById('f-persona');
  if (sel) {
    const current = sel.value;
    sel.innerHTML = nombres.map(n => `<option${n === current ? ' selected' : ''}>${n}</option>`).join('');
  }

  const list = document.getElementById('participants-manage-list');
  if (list) {
    list.innerHTML = nombres.length
      ? nombres.map(n => `
        <div class="participant-row">
          <span>${n}</span>
          <button type="button" class="btn-remove-participant" data-nombre="${n}" title="Quitar" aria-label="Quitar a ${n}">✕</button>
        </div>`).join('')
      : '<div class="form-hint">Sin participantes — agrega el primero abajo.</div>';
  }
}

async function agregarParticipante() {
  const input  = document.getElementById('f-nuevo-participante');
  const nombre = input.value.trim();
  const st     = document.getElementById('st-participantes');

  if (!nombre) { setStatus(st, 'err', 'Ingresa un nombre'); return; }
  if (participantesActivos().some(n => n.toLowerCase() === nombre.toLowerCase())) {
    setStatus(st, 'err', 'Ya existe ese participante'); return;
  }

  setStatus(st, '', 'Guardando...');
  try {
    await postParticipante({ fecha: nowLocal().iso, nombre, accion: 'agregar' }, adminKey);
    input.value = '';
    setStatus(st, '', '');
    saveFormSnapshot();
    await fetchAll();
    renderAdminParticipants();
    restoreFormSnapshot();
    showToast('Agregado');
  } catch (err) {
    setStatus(st, 'err', err.message);
  }
}

async function quitarParticipante(nombre) {
  const st = document.getElementById('st-participantes');
  if (!confirm(`¿Quitar a ${nombre} de la lista? Su historial de movimientos se mantiene.`)) return;

  setStatus(st, '', 'Guardando...');
  try {
    await postParticipante({ fecha: nowLocal().iso, nombre, accion: 'quitar' }, adminKey);
    setStatus(st, '', '');
    await fetchAll();
    renderAdminParticipants();
    restoreFormSnapshot();
    showToast('Actualizado');
  } catch (err) {
    setStatus(st, 'err', err.message);
  }
}

function previewFondo() {
  const val  = parseMoneyInput(document.getElementById('f-valor'));
  const circ = cuotasCirc();
  const el    = document.getElementById('hint-fondo');

  if (!val) { el.textContent = ''; return; }
  if (!circ) {
    el.textContent = `Primer registro — cuota inicial = $${val.toFixed(2)} USD`;
    return;
  }

  const nuevo  = val / circ;
  const actual = precioCuota();
  const diff   = actual ? (nuevo - actual) / actual * 100 : 0;
  const sign   = diff >= 0 ? '+' : '';

  el.textContent = `Nueva cuota → $${nuevo.toFixed(2)} (${sign}${diff.toFixed(2)}%)`;
}

async function submitMov() {
  const persona    = document.getElementById('f-persona').value;
  const tipo       = document.getElementById('f-tipo').value;
  const monto_cop  = parseMoneyInput(document.getElementById('f-monto-cop'));
  const monto_usd  = parseMoneyInput(document.getElementById('f-monto'));
  const valorFondo = parseMoneyInput(document.getElementById('f-valor-mov'));
  const fecha      = document.getElementById('f-fecha').value + 'T' + (document.getElementById('f-hora').value || '00:00');
  const st         = document.getElementById('st-mov');
  const btn        = document.getElementById('btn-mov');

  if (!monto_cop || monto_cop <= 0)  { setStatus(st, 'err', 'Ingresa el monto en COP'); return; }
  if (!monto_usd || monto_usd <= 0)  { setStatus(st, 'err', 'Ingresa el monto en USD'); return; }
  if (!valorFondo || valorFondo <= 0) { setStatus(st, 'err', 'Ingresa el valor del fondo después'); return; }
  if (!fecha)                         { setStatus(st, 'err', 'Fecha requerida'); return; }

  const trm_dia        = monto_cop / monto_usd;   // TRM calculada internamente
  const cuotasActuales = cuotasCirc();
  // Precio de cuota justo antes de este movimiento, derivado del valor real (valorFondo)
  // que el admin acaba de confirmar — no del último checkpoint guardado, que puede estar
  // desactualizado si el fondo ganó/perdió valor desde esa última valuación.
  const valorAntes     = tipo === 'retiro' ? valorFondo + monto_usd : valorFondo - monto_usd;
  const pc             = cuotasActuales > 0 ? valorAntes / cuotasActuales : 1;
  const cuotas         = tipo === 'retiro' ? -Math.abs(monto_usd / pc) : Math.abs(monto_usd / pc);
  const cuotasNuevas   = cuotasActuales + cuotas;
  const pcNuevo        = cuotasNuevas > 0 ? valorFondo / cuotasNuevas : 1;

  btn.disabled = true;
  setStatus(st, '', 'Guardando...');
  try {
    await postMovimiento({ fecha, persona, tipo, monto_usd, precio_cuota_dia: pc, cuotas, monto_cop, trm_dia }, adminKey);
    await postFondo({ fecha, valor_total_usd: valorFondo, precio_cuota_usd: pcNuevo, cuotas_en_circulacion: cuotasNuevas, trm: S.trm || 0 }, adminKey);
    setStatus(st, '', '');
    document.getElementById('f-monto-cop').value  = '';
    document.getElementById('f-monto').value      = '';
    document.getElementById('f-valor-mov').value  = '';
    saveFormSnapshot();
    await fetchAll();
    restoreFormSnapshot();
    showToast('Guardado');
  } catch (err) {
    setStatus(st, 'err', err.message);
  } finally {
    btn.disabled = false;
  }
}

async function importXlsx() {
  const input = document.getElementById('f-import-xlsx');
  const st    = document.getElementById('st-import');
  const file  = input.files[0];

  if (!file) { setStatus(st, 'err', 'Elige un archivo'); return; }
  if (!confirm('Esto reemplaza TODOS los datos actuales por los del archivo. ¿Continuar?')) return;

  setStatus(st, '', 'Importando...');
  try {
    await postImportXlsx(file, adminKey);
    input.value = '';
    setStatus(st, '', '');
    await fetchAll();
    renderAdminParticipants();
    restoreFormSnapshot();
    showToast('Importado');
  } catch (err) {
    setStatus(st, 'err', err.message);
  }
}

async function submitFondo() {
  const val   = parseMoneyInput(document.getElementById('f-valor'));
  const fecha = document.getElementById('f-fecha-fondo').value + 'T' + (document.getElementById('f-hora-fondo').value || '00:00');
  const st = document.getElementById('st-fondo');
  const btn = document.getElementById('btn-fondo');

  if (!val || val <= 0) { setStatus(st, 'err', 'Valor inválido'); return; }
  if (!fecha) { setStatus(st, 'err', 'Fecha requerida'); return; }

  let circ = cuotasCirc();
  if (!circ) circ = val; // primer registro: $1 por cuota → cuotas = valor total

  const pc = val / circ;

  btn.disabled = true;
  setStatus(st, '', 'Guardando...');
  try {
    await postFondo({ fecha, valor_total_usd: val, precio_cuota_usd: pc, cuotas_en_circulacion: circ, trm: S.trm || 0 }, adminKey);
    setStatus(st, '', '');
    document.getElementById('f-valor').value = '';
    saveFormSnapshot();
    await fetchAll();
    restoreFormSnapshot();
    showToast('Actualizado');
  } catch (err) {
    setStatus(st, 'err', err.message);
  } finally {
    btn.disabled = false;
  }
}

export function bindAdminEvents() {
  const adminKeyInput = document.getElementById('admin-key');
  adminKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') unlockAdmin(); });
  document.getElementById('unlock-btn').addEventListener('click', unlockAdmin);

  document.getElementById('btn-export-xlsx').href = exportUrl();
  document.getElementById('btn-import-xlsx').addEventListener('click', importXlsx);

  // Snapshot continuo del form — ver comentario junto a FORM_FIELDS.
  document.getElementById('admin-panel').addEventListener('input', saveFormSnapshot);
  document.getElementById('admin-panel').addEventListener('change', saveFormSnapshot);

  document.querySelectorAll('.tipo-btn').forEach(btn =>
    btn.addEventListener('click', () => setTipo(btn.dataset.tipo)));

  document.getElementById('f-monto-cop').addEventListener('input', e => fmtMoneyInput(e.target, 0));
  document.getElementById('f-monto').addEventListener('input', e => fmtMoneyInput(e.target, 2));
  document.getElementById('f-valor-mov').addEventListener('input', e => fmtMoneyInput(e.target, 2));
  document.getElementById('f-valor').addEventListener('input', e => { fmtMoneyInput(e.target, 2); previewFondo(); });
  document.getElementById('f-fecha-fondo').addEventListener('input', previewFondo);

  document.getElementById('btn-mov').addEventListener('click', submitMov);
  document.getElementById('btn-fondo').addEventListener('click', submitFondo);

  document.getElementById('btn-add-participante').addEventListener('click', agregarParticipante);
  document.getElementById('f-nuevo-participante').addEventListener('keydown', e => {
    if (e.key === 'Enter') agregarParticipante();
  });
  document.getElementById('participants-manage-list').addEventListener('click', e => {
    const btn = e.target.closest('.btn-remove-participant');
    if (btn) quitarParticipante(btn.dataset.nombre);
  });
}
