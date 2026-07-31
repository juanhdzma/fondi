// El precio de cuota que convierte un aporte/retiro en cuotas tiene que reflejar el valor
// REAL del fondo justo ANTES del movimiento — por eso se deriva de `valorFondo` (el valor
// después, que el admin confirma a mano) y no del último checkpoint guardado, que puede
// estar desactualizado. Con un precio viejo el que entra compra cuotas baratas y se lleva
// gratis la ganancia que era de los que ya estaban (dilución).
export function calcularCuotas({ tipo, monto, valorFondo, cuotasActuales }) {
  // El signo lo define `tipo`, no el monto: un retiro escrito como -600 tiene que dar lo
  // mismo que 600, no invertir el sentido de `valorAntes`.
  const abs = Math.abs(monto);
  const valorAntes = tipo === 'retiro' ? valorFondo + abs : valorFondo - abs;
  const precioAntes = cuotasActuales > 0 ? valorAntes / cuotasActuales : 1;
  const cuotas = tipo === 'retiro'
    ? -Math.abs(abs / precioAntes)
    : Math.abs(abs / precioAntes);
  const cuotasNuevas = cuotasActuales + cuotas;
  const precioDespues = cuotasNuevas > 0 ? valorFondo / cuotasNuevas : 1;

  return { precioAntes, cuotas, cuotasNuevas, precioDespues };
}
