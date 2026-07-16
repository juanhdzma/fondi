export const SHEET_ID = '1rrXkw6N9oSepkaHE08sZHnJ1p3a1EdUmZd-RuhLVqQs';
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw7UlnG1Y7VpsjbltUQSXCCDoSq1ylFrbgqsW_4cw1O1iVH9dgko29heOTeIi05Ng/exec';
export const ADMIN_KEY = '110411';

// ── Rampa tonal (un solo acento, distintas intensidades) — avatares y barra de participación ──
export const PARTICIPANT_COLORS = ['#3B4C74', '#55658C', '#7080A6', '#8C9BC0', '#A8B4D6'];

// ── Mock data — cambiar a false cuando el Sheet y el Apps Script estén listos ─
export const MOCK_MODE = false;

export const MOCK_HISTORIAL = [
  // fecha        valor_total   precio_cuota  cuotas_circ    trm
  ['2026-01-10', '400.000000', '1.000000',  '400.000000', '3300'],
  ['2026-01-31', '402.000000', '1.005000',  '400.000000', '3315'],
  ['2026-02-20', '457.820000', '1.020000',  '449.019608', '3350'],
  ['2026-02-28', '454.610000', '1.012000',  '449.019608', '3360'],
  ['2026-03-31', '471.470000', '1.050000',  '449.019608', '3400'],
  ['2026-04-30', '452.700000', '1.075000',  '421.112631', '3420'],
  ['2026-05-31', '471.647000', '1.120000',  '421.112631', '3450'],
  ['2026-06-10', '483.860000', '1.149000',  '421.112631', '3475'],
];

export const MOCK_MOVIMIENTOS = [
  //  fecha        persona        tipo      usd     precio     cuotas        cop      trm
  ['2026-01-10', 'Patico',      'aporte', '100', '1.000000',  '100.000000', '330000', '3300'],
  ['2026-01-10', 'Mariana',     'aporte', '100', '1.000000',  '100.000000', '330000', '3300'],
  ['2026-01-10', 'Juancho',     'aporte', '80',  '1.000000',  '80.000000',  '264000', '3300'],
  ['2026-01-10', 'Juan Carlos', 'aporte', '120', '1.000000',  '120.000000', '396000', '3300'],
  ['2026-02-20', 'Patico',      'aporte', '50',  '1.020000',  '49.019608',  '167500', '3350'],
  ['2026-04-30', 'Mariana',     'retiro', '30',  '1.075000',  '-27.906977', '102000', '3400'],
];

export const MOCK_PARTICIPANTES_LOG = [
  //  fecha         nombre          accion
  ['2026-01-10', 'Patico',      'agregar'],
  ['2026-01-10', 'Mariana',     'agregar'],
  ['2026-01-10', 'Juancho',     'agregar'],
  ['2026-01-10', 'Juan Carlos', 'agregar'],
];
