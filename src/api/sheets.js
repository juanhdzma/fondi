import { SHEET_ID, APPS_SCRIPT_URL, MOCK_MODE, MOCK_HISTORIAL, MOCK_MOVIMIENTOS, MOCK_PARTICIPANTES_LOG } from '../config.js';
import { S } from '../state.js';
import { parseCSV, parseCONumber } from '../utils/csv.js';
import { normDate } from '../utils/dates.js';
import { showBanner, hideBanner } from '../ui/banner.js';
import { renderAll } from '../render/index.js';

export async function fetchCSV(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Error ${r.status} leyendo ${sheetName}`);
  const rows = parseCSV(await r.text());
  return rows.slice(1); // omitir encabezado
}

export async function postScript(payload) {
  // Apps Script no envía headers CORS en ContentService; se usa text/plain para evitar preflight.
  // La escritura ocurre en el servidor; re-fetch posterior confirma el resultado.
  await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
  });
}

export async function fetchTRM() {
  const badge = document.getElementById('trm-badge');
  try {
    // TRM oficial Colombia — Superfinanciera vía datos.gov.co
    const r = await fetch('https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde+DESC');
    const d = await r.json();
    S.trm = parseFloat(d[0]?.valor) || 4000;
    badge.textContent = `TRM $${S.trm.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch {
    S.trm = 4000;
    badge.textContent = 'TRM ~$4.000';
  }
}

export async function fetchAll() {
  try {
    await fetchTRM();
    const histRows = MOCK_MODE ? MOCK_HISTORIAL : await fetchCSV('historial_fondo');
    const movRows  = MOCK_MODE ? MOCK_MOVIMIENTOS : await fetchCSV('movimientos');
    const partRows = MOCK_MODE ? MOCK_PARTICIPANTES_LOG : await fetchCSV('participantes_config');

    // El Sheet es un log append-only: el admin puede backdatear una valuación
    // (fecha anterior a la última fila), así que no queda garantizado el orden cronológico.
    const historialCrudo = histRows
      .filter(r => r[0])
      .map(r => ({
        fecha: normDate(r[0]),
        valor_total: parseCONumber(r[1]),
        precio_cuota: parseCONumber(r[2]),
        cuotas_circ:  parseCONumber(r[3]),
        trm:          parseCONumber(r[4]),
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Un registro por día: si hay varias valuaciones el mismo día, se queda la más reciente
    // (evita que el eje x del chart repita el mismo día con zigzag entre horas).
    const porDia = new Map();
    for (const h of historialCrudo) porDia.set(h.fecha.slice(0, 10), h);
    S.historial = [...porDia.values()];

    S.movimientos = movRows
      .filter(r => r[0])
      .map(r => ({
        fecha:           normDate(r[0]),
        persona:         r[1] || '',
        tipo:            (r[2] || '').toLowerCase(),
        monto:           parseCONumber(r[3]),
        precio_cuota_dia: parseCONumber(r[4]),
        cuotas:          parseCONumber(r[5]),
        monto_cop:       parseCONumber(r[6]),
        trm_dia:         parseCONumber(r[7]),
      }));

    S.participantesLog = partRows
      .filter(r => r[1])
      .map(r => ({
        fecha:  normDate(r[0]),
        nombre: r[1] || '',
        accion: (r[2] || '').toLowerCase(),
      }));

    hideBanner();
    renderAll();
  } catch (err) {
    showBanner(err.message);
    renderAll();
  }
}
