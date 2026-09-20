import { S } from '../state.js';
import { renderCharts } from '../render/index.js';
import { resetLineCharts, renderPersonaChart } from '../render/charts.js';
import { restoreFormSnapshot } from '../admin.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function animateUpdate(element, enabled, kind = 'chart') {
  if (!element || !enabled) return;
  element.getAnimations().forEach(animation => animation.cancel());
  const reduced = reduceMotion.matches;
  const fromTransform = kind === 'chart' ? 'scale(0.995)' : 'translateY(3px)';
  element.animate(
    reduced
      ? [{ opacity: 0.65 }, { opacity: 1 }]
      : [{ opacity: 0.35, transform: fromTransform }, { opacity: 1, transform: 'none' }],
    { duration: reduced ? 120 : 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
  );
}

export function setTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => {
    el.classList.remove('active');
    el.setAttribute('aria-selected', String(el.dataset.tab === tab));
    el.tabIndex = el.dataset.tab === tab ? 0 : -1;
  });
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  // Safari a veces vacía los inputs date/time del panel admin al volver a mostrarlo (display:none → block).
  if (tab === 'admin') restoreFormSnapshot();
}

export function setRange(r, animate = true) {
  if (S.range === r) return;
  const deltas = ['stat-fondo-chg', 'stat-cuota-chg'];
  const previous = deltas.map(id => document.getElementById(id)?.textContent);
  S.range = r;
  document.querySelectorAll('.range-btn:not(.persona-range-btn)').forEach(b => {
    const active = b.dataset.r === r;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
    if (active) b.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
  resetLineCharts();
  renderCharts();
  animateUpdate(document.getElementById('chart-hero'), animate);
  deltas.forEach((id, index) => {
    const element = document.getElementById(id);
    if (element?.textContent !== previous[index]) animateUpdate(element, animate, 'value');
  });
}

export function setPersonaRange(r, animate = true) {
  if (S.personaRange === r) return;
  S.personaRange = r;
  document.querySelectorAll('.persona-range-btn').forEach(b => {
    const active = b.dataset.r === r;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
    if (active) b.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
  const nombre = document.getElementById('filter-persona').value;
  if (nombre) {
    renderPersonaChart(nombre);
    animateUpdate(document.getElementById('chart-persona'), animate);
  }
}

export function setHeroMetric(metric, animate = true) {
  if (S.heroMetric === metric) return;
  S.heroMetric = metric;
  document.querySelectorAll('.hero-tab').forEach(b => {
    const active = b.dataset.metric === metric;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  renderCharts();
  animateUpdate(document.getElementById('chart-hero'), animate);
}
