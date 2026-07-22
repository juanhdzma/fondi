import { API_BASE_URL, MOCK_MODE, MOCK_HISTORIAL, MOCK_MOVIMIENTOS, MOCK_PARTICIPANTES_LOG } from '../config.js';
import { S } from '../state.js';
import { showBanner, hideBanner } from '../ui/banner.js';
import { renderAll } from '../render/index.js';

async function postJSON(path, body, adminKey) {
  const r = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = await r.json().catch(() => ({}));
    throw new Error(detail.detail || `Error ${r.status}`);
  }
  return r.json();
}

export function postMovimiento(payload, adminKey) {
  return postJSON('/api/movimiento', payload, adminKey);
}

export function postFondo(payload, adminKey) {
  return postJSON('/api/fondo', payload, adminKey);
}

export function postParticipante(payload, adminKey) {
  return postJSON('/api/participante', payload, adminKey);
}

export function exportUrl() {
  return `${API_BASE_URL}/api/export`;
}

export async function postImportXlsx(file, adminKey) {
  const formData = new FormData();
  formData.append('file', file);
  const r = await fetch(`${API_BASE_URL}/api/import`, {
    method: 'POST',
    headers: { 'X-Admin-Key': adminKey },
    body: formData,
  });
  if (!r.ok) {
    const detail = await r.json().catch(() => ({}));
    throw new Error(detail.detail || `Error ${r.status}`);
  }
  return r.json();
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
    let historial, movimientos, participantesLog;
    if (MOCK_MODE) {
      historial = MOCK_HISTORIAL;
      movimientos = MOCK_MOVIMIENTOS;
      participantesLog = MOCK_PARTICIPANTES_LOG;
    } else {
      const r = await fetch(`${API_BASE_URL}/api/all`);
      if (!r.ok) throw new Error(`Error ${r.status} leyendo el backend`);
      const data = await r.json();
      historial = data.historial;
      movimientos = data.movimientos;
      participantesLog = data.participantes_config;
    }

    // El backend es un log append-only: el admin puede backdatear una valuación
    // (fecha anterior a la última fila), así que no queda garantizado el orden cronológico.
    const historialOrdenado = [...historial].sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Un registro por día: si hay varias valuaciones el mismo día, se queda la más reciente
    // (evita que el eje x del chart repita el mismo día con zigzag entre horas).
    const porDia = new Map();
    for (const h of historialOrdenado) porDia.set(h.fecha.slice(0, 10), h);
    S.historial = [...porDia.values()];

    S.movimientos = movimientos;
    S.participantesLog = participantesLog;

    hideBanner();
    renderAll();
  } catch (err) {
    showBanner(err.message);
    renderAll();
  }
}
