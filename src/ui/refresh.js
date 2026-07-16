import { fetchAll } from '../api/sheets.js';
import { renderAdminParticipants } from '../admin.js';

export async function refreshData() {
  const btn = document.getElementById('refresh-btn');
  btn.style.transform = 'rotate(360deg)';
  btn.style.color = 'var(--green)';
  await fetchAll();
  if (document.getElementById('admin-panel').style.display !== 'none') {
    renderAdminParticipants();
  }
  setTimeout(() => {
    btn.style.transform = '';
    btn.style.color = '';
  }, 600);
}
