// Reparte fichas de eventos en carriles para que no se pisen. Una ficha va al primer carril
// donde queda a `gap` px de la anterior; si no cabe en ninguno, se suma a la última ficha
// colocada (el chip muestra el total y cuántos movimientos agrupa).
export function laneLayout(events, gap, lanes = 2) {
  const placed = [];
  const lastX = Array(lanes).fill(-Infinity);
  for (const event of [...events].sort((a, b) => a.x - b.x)) {
    const lane = lastX.findIndex(x => event.x - x >= gap);
    if (lane === -1 && placed.length) {
      const target = placed[placed.length - 1];
      target.amount += event.amount;
      target.people = [...new Set([...target.people, ...event.people])];
      target.count += event.count;
      continue;
    }
    const chosen = lane === -1 ? 0 : lane;
    lastX[chosen] = event.x;
    placed.push({ ...event, lane: chosen });
  }
  return placed;
}
