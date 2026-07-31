const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Los nombres de participante se interpolan en innerHTML y en atributos (data-nombre):
// una comilla en el nombre rompía la fila y el botón de quitar.
export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ENTIDADES[c]);
}
