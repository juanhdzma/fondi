import { API_BASE_URL } from './config.js';
import { S } from './state.js';
import { cuotasCirc, precioCuota, participantesActivos, calcParticipante, latest } from './computed.js';
import { calcularCuotas, excedeSaldo } from './domain/cuotas.js';
import { fetchAll, postMovimiento, postFondo, postParticipante, exportUrl, postImportXlsx } from './api/backend.js';
import { fmtMoneyInput, parseMoneyInput } from './utils/money-input.js';
import { todayLocal } from './utils/dates.js';
import { esc } from './utils/html.js';
import { fmt, fmtN } from './utils/format.js';
import { showToast } from './ui/toast.js';

let adminKey = '';

function setStatus(el, cls, msg) {
  el.className = 'form-status' + (cls ? ' ' + cls : '');
  el.textContent = msg;
}

function nowLocal() {
  const now  = new Date();
  const date = todayLocal(now);
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return { date, time, iso: `${date}T${time}` };
}

// El motivo real del rechazo importa: tras 10 intentos fallidos el backend responde 429 y
// hasta la clave correcta rebota por unos minutos. Mostrando siempre "Clave incorrecta" el
// admin reintentaba una clave que sí era la buena sin entender por qué no entraba.
async function unlockAdmin() {
  const input = document.getElementById('admin-key');
  const errEl = document.getElementById('key-err');
  let msg;

  try {
    const r = await fetch(`${API_BASE_URL}/api/auth/verify`, {
      method: 'POST',
      headers: { 'X-Admin-Key': input.value },
    });
    if (r.ok) {
      adminKey = input.value;
      errEl.textContent = '';
      document.getElementById('admin-lock').style.display = 'none';
      document.getElementById('admin-panel').style.display = 'block';
      initAdminForms();
      return;
    }
    const detail = await r.json().catch(() => ({}));
    msg = detail.detail || (r.status === 401 ? 'Clave incorrecta' : `Error ${r.status}`);
  } catch {
    msg = 'No se pudo conectar con el servidor';
  }

  input.classList.add('err');
  errEl.textContent = msg;
  setTimeout(() => input.classList.remove('err'), 1500);
}

function setTipo(tipo) {
  document.getElementById('f-tipo').value = tipo;
  document.querySelector('.tipo-btn.aporte').classList.toggle('sel', tipo === 'aporte');
  document.querySelector('.tipo-btn.retiro').classList.toggle('sel', tipo === 'retiro');
  saveFormSnapshot();
  previewMov();
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

// El front deriva las cuotas de la suma de movimientos, pero historial_fondo guarda su
// propia columna cuotas_circ. Un import con historial completo y movimientos incompletos
// hace divergir las dos fuentes y todos los porcentajes por participante quedan mal —
// sin este aviso la diferencia solo se nota meses después.
function renderConsistencyCheck() {
  const el = document.getElementById('admin-check');
  if (!el) return;

  const ultima = latest();
  const suma   = cuotasCirc();
  const diff   = ultima ? Math.abs(suma - ultima.cuotas_circ) : 0;

  if (!ultima || diff <= 0.01) { el.style.display = 'none'; el.innerHTML = ''; return; }

  el.style.display = 'block';
  el.innerHTML = `<b>Datos inconsistentes.</b> Los movimientos suman ${fmtN(suma)} cuotas,
    pero la última valuación registra ${fmtN(ultima.cuotas_circ)}
    (diferencia de ${fmtN(diff)}). Los porcentajes por participante no son confiables
    hasta que cuadren — revisá el histórico importado.`;
}

export function renderAdminParticipants() {
  renderConsistencyCheck();
  const nombres = participantesActivos();

  const sel = document.getElementById('f-persona');
  if (sel) {
    const current = sel.value;
    sel.innerHTML = nombres.map(n => `<option${n === current ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }

  const list = document.getElementById('participants-manage-list');
  if (list) {
    list.innerHTML = nombres.length
      ? nombres.map(n => `
        <div class="participant-row">
          <span>${esc(n)}</span>
          <button type="button" class="btn-remove-participant" data-nombre="${esc(n)}" title="Quitar" aria-label="Quitar a ${esc(n)}">✕</button>
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

// La TRM implícita (COP/USD) se guarda tal cual y no se puede corregir después: un cero de
// menos en el monto en COP entra sin fricción. Si se aleja mucho de la TRM del día, se avisa.
const TRM_DESVIO_MAX = 0.15;

function previewTrm() {
  const cop = parseMoneyInput(document.getElementById('f-monto-cop'));
  const usd = parseMoneyInput(document.getElementById('f-monto'));
  const el  = document.getElementById('hint-trm-mov');
  if (!el) return;

  el.className = 'form-hint';
  if (!cop || !usd) { el.textContent = ''; return; }

  const trm = cop / usd;
  const desvio = S.trm ? Math.abs(trm - S.trm) / S.trm : 0;
  el.textContent = `TRM: ${fmt(trm)}`;
  if (desvio > TRM_DESVIO_MAX) {
    el.className = 'form-hint warn';
    el.textContent += ` — revisá los montos, la TRM de hoy es ${fmt(S.trm)}`;
  }
}

// Misma cuenta que submitMov() para la nueva cuota, en vivo mientras el admin escribe.
function previewMov() {
  const monto_usd  = parseMoneyInput(document.getElementById('f-monto'));
  const valorFondo = parseMoneyInput(document.getElementById('f-valor-mov'));
  const tipo       = document.getElementById('f-tipo').value;
  const el         = document.getElementById('hint-valor-mov');
  if (!el) return;

  if (!monto_usd || !valorFondo) { el.textContent = ''; return; }

  const { precioDespues } = calcularCuotas({
    tipo, monto: monto_usd, valorFondo, cuotasActuales: cuotasCirc(),
  });

  const actual = precioCuota();
  const diff   = actual ? (precioDespues - actual) / actual * 100 : 0;
  const sign   = diff >= 0 ? '+' : '';

  el.textContent = `Nueva cuota → $${precioDespues.toFixed(2)} (${sign}${diff.toFixed(2)}%)`;
}

function previewFondo() {
  const val  = parseMoneyInput(document.getElementById('f-valor'));
  const circ = cuotasCirc();
  const el    = document.getElementById('hint-fondo');

  if (!val) { el.textContent = ''; return; }
  if (!circ) {
    el.textContent = latest()
      ? 'No hay cuotas en circulación — registrá primero un aporte'
      : `Primer registro — cuota inicial = $${val.toFixed(2)} USD`;
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

  const trm_dia = monto_cop / monto_usd;   // TRM calculada internamente
  const { precioAntes, cuotas, cuotasNuevas, precioDespues } = calcularCuotas({
    tipo, monto: monto_usd, valorFondo, cuotasActuales: cuotasCirc(),
  });

  // Sin esto un retiro por más de lo que la persona tiene se guarda igual y le deja cuotas
  // negativas: no hay UPDATE/DELETE para arreglarlo, solo exportar el xlsx y reimportarlo.
  const disponibles = calcParticipante(persona).cuotas;
  if (excedeSaldo({ cuotas, cuotasDisponibles: disponibles })) {
    setStatus(st, 'err', `${persona} solo tiene ${fmt(disponibles * precioAntes)} USD disponibles`);
    return;
  }

  btn.disabled = true;
  setStatus(st, '', 'Guardando...');
  try {
    // Movimiento y valuación van juntos en un solo request: el backend los inserta en la
    // misma transacción. Separados, si el segundo fallaba quedaba un movimiento que cambió
    // las cuotas con el precio de cuota viejo, sin forma de deshacerlo (log append-only).
    await postMovimiento({
      fecha, persona, tipo, monto_usd, precio_cuota_dia: precioAntes, cuotas, monto_cop, trm_dia,
      fondo: {
        fecha,
        valor_total_usd: valorFondo,
        precio_cuota_usd: precioDespues,
        cuotas_en_circulacion: cuotasNuevas,
        trm: S.trm || 0,
      },
    }, adminKey);
    setStatus(st, '', '');
    document.getElementById('f-monto-cop').value  = '';
    document.getElementById('f-monto').value      = '';
    document.getElementById('f-valor-mov').value  = '';
    previewTrm();
    previewMov();
    saveFormSnapshot();
    await fetchAll();
    restoreFormSnapshot();
    renderConsistencyCheck();
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

  // Sin cuotas hay dos casos distintos: fondo nuevo (arranca en $1 por cuota) o fondo del que
  // ya salieron todos. En el segundo, valuar contra cuotas=valor inventa cuotas que ningún
  // movimiento respalda y dispara el aviso de inconsistencia — no hay nada que valuar.
  let circ = cuotasCirc();
  if (!circ) {
    if (latest()) { setStatus(st, 'err', 'No hay cuotas en circulación — registrá primero un aporte'); return; }
    circ = val;
  }

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
    renderConsistencyCheck();
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

  document.getElementById('f-monto-cop').addEventListener('input', e => { fmtMoneyInput(e.target, 0); previewTrm(); });
  document.getElementById('f-monto').addEventListener('input', e => { fmtMoneyInput(e.target, 2); previewTrm(); previewMov(); });
  document.getElementById('f-valor-mov').addEventListener('input', e => { fmtMoneyInput(e.target, 2); previewMov(); });
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
