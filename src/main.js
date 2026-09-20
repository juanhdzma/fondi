import './style.css';
import { fetchAll } from './api/backend.js';
import { renderMovimientos } from './render/index.js';
import { setTab, setRange, setHeroMetric, setPersonaRange } from './ui/tabs.js';
import { bindAdminEvents } from './admin.js';

const navButtons = [...document.querySelectorAll('.nav-btn')];

navButtons.forEach((btn, index) => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
  btn.addEventListener('keydown', event => {
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    const target = event.key === 'Home' ? navButtons[0]
      : event.key === 'End' ? navButtons.at(-1)
        : direction ? navButtons[(index + direction + navButtons.length) % navButtons.length] : null;
    if (!target) return;
    event.preventDefault();
    target.focus();
    setTab(target.dataset.tab);
  });
});

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

document.getElementById('filter-persona').addEventListener('change', renderMovimientos);

bindAdminEvents();

fetchAll();
