import { S } from '../state.js';
import { renderResumen, renderCharts } from '../render/index.js';
import { resetLineCharts } from '../render/charts.js';
import { restoreFormSnapshot } from '../admin.js';

export function setTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  // Safari a veces vacía los inputs date/time del panel admin al volver a mostrarlo (display:none → block).
  if (tab === 'admin') restoreFormSnapshot();
}

export function setRange(r) {
  S.range = r;
  document.querySelectorAll('.range-btn').forEach(b => {
    const active = b.dataset.r === r;
    b.classList.toggle('active', active);
    if (active) b.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
  resetLineCharts();
  renderResumen();
  renderCharts();
}

export function setHeroMetric(metric) {
  S.heroMetric = metric;
  document.querySelectorAll('.hero-tab').forEach(b => b.classList.toggle('active', b.dataset.metric === metric));
  renderCharts();
}
