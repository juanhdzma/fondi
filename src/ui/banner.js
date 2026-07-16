export function showBanner(msg) {
  const el = document.getElementById('err-banner');
  el.textContent = 'Error cargando datos: ' + msg;
  el.style.display = 'block';
}

export function hideBanner() {
  document.getElementById('err-banner').style.display = 'none';
}
