// Slice-and-dice balanceado: parte la lista (ordenada de mayor a menor) donde el peso
// acumulado cruza la mitad y corta por el lado más largo. `aspect` es ancho/alto real del
// contenedor, para que "más largo" se mida en píxeles y no en porcentajes.
export function treemapLayout(items, aspect = 1, x = 0, y = 0, w = 100, h = 100) {
  if (!items.length) return [];
  if (items.length === 1) return [{ item: items[0], x, y, w, h }];
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let acc = 0;
  let split = 0;
  while (split < items.length - 1 && acc + items[split].weight <= total / 2) acc += items[split++].weight;
  if (split === 0) acc = items[split++].weight;
  const ratio = total > 0 ? acc / total : 0.5;
  const [first, rest] = [items.slice(0, split), items.slice(split)];
  return w * aspect >= h
    ? [...treemapLayout(first, aspect, x, y, w * ratio, h), ...treemapLayout(rest, aspect, x + w * ratio, y, w * (1 - ratio), h)]
    : [...treemapLayout(first, aspect, x, y, w, h * ratio), ...treemapLayout(rest, aspect, x, y + h * ratio, w, h * (1 - ratio))];
}
