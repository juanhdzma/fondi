import { renderResumen } from './resumen.js';
import { renderMovimientos } from './movimientos.js';
import { renderCharts } from './charts.js';

export { renderResumen, renderMovimientos, renderCharts };

export function renderAll() {
  renderResumen();
  renderMovimientos();
  renderCharts();
}
