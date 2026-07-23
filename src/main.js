import './style.css';
import { fetchAll } from './api/backend.js';
import { renderMovimientos } from './render/index.js';
import { setTab, setRange, setHeroMetric, setPersonaRange } from './ui/tabs.js';
import { refreshData } from './ui/refresh.js';
import { bindAdminEvents } from './admin.js';

// Refuerzo para pinch-zoom: Safari dispara sus propios eventos 'gesture*' para el gesto de
// pellizco por fuera del control de touch-action, y algunos Android antiguos no respetan
// touch-action en absoluto — se bloquea también a mano vía multi-touch en touchmove.
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

document.querySelectorAll('.nav-btn').forEach(btn =>
  btn.addEventListener('click', () => setTab(btn.dataset.tab)));

document.querySelectorAll('.range-btn:not(.persona-range-btn)').forEach(btn =>
  btn.addEventListener('click', () => setRange(btn.dataset.r)));

document.querySelectorAll('.persona-range-btn').forEach(btn =>
  btn.addEventListener('click', () => setPersonaRange(btn.dataset.r)));

document.querySelectorAll('.hero-tab').forEach(btn =>
  btn.addEventListener('click', () => setHeroMetric(btn.dataset.metric)));

// El rango activo por default (Todo) puede quedar fuera de vista en la fila scrolleable.
// Se espera a que cargue la tipografía: si se mide con la fuente de respaldo, el ancho
// de los botones cambia al llegar Inter y el scroll queda desalineado.
(document.fonts?.ready || Promise.resolve()).then(() => {
  document.querySelectorAll('.range-btn.active').forEach(btn =>
    btn.scrollIntoView({ inline: 'nearest', block: 'nearest' }));
});

document.getElementById('refresh-btn').addEventListener('click', refreshData);
document.getElementById('filter-persona').addEventListener('change', renderMovimientos);

bindAdminEvents();

fetchAll();
