# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Fondi" — dashboard para gestionar un fondo de inversión familiar tipo fondo mutuo: varios participantes aportan/retiran USD en momentos distintos, y cada quien es dueño de una fracción del fondo medida en "cuotas" (como un fondo de inversión colectiva). Muestra valor del fondo, precio de cuota, participación individual y rendimiento en USD y COP.

Vanilla JS + Chart.js, sin framework — el DOM se manipula directo (`innerHTML`, `render*()` functions), no hay estado reactivo. Bundlea con Vite; `index.html` es solo markup, la lógica vive en `src/` como ES modules.

## Comandos

```bash
npm install
npm run dev       # http://localhost:8080
npm run build     # genera dist/ (lo que corre el Dockerfile)
npm run preview   # sirve dist/ para verificar antes de deployar

# Docker (build multi-stage: node build → nginx serve)
docker build -t fondi .
docker run -p 8080:80 fondi
```

No hay linter ni test runner configurado. El único "CI" es `.github/workflows/docker.yml`, que en cada push a `main` que toque `index.html`, `src/**`, `package.json` o `Dockerfile` construye y publica la imagen a `ghcr.io/<usuario>/fondi:latest`.

Para probar cambios sin arriesgar el Sheet real, poner `MOCK_MODE = true` en `src/config.js` — usa `MOCK_HISTORIAL`/`MOCK_MOVIMIENTOS` en vez de golpear Google Sheets.

## Estructura de `src/`

```
main.js          Entry point — arma los event listeners (no hay onclick inline en el HTML) y llama fetchAll()
config.js        Constantes de deployment: SHEET_ID, APPS_SCRIPT_URL, ADMIN_KEY, MOCK_MODE/MOCK_*
state.js         S (estado en memoria: trm, historial, movimientos, participantesLog, range) + charts (instancias de Chart.js)
computed.js      latest(), precioCuota(), cuotasCirc(), calcParticipante(), participantesActivos(), participantesTodos() — todo deriva de S
admin.js         Panel admin completo: unlock, tipo toggle, previewFondo, submitMov, submitFondo, agregar/quitar participante
api/sheets.js    fetchCSV/postScript/fetchTRM/fetchAll — todo el I/O contra Google
utils/           csv.js (parser CSV + números formato CO), dates.js, format.js, money-input.js
render/          resumen.js, movimientos.js, charts.js — un módulo por sección de UI; index.js expone renderAll()
ui/              tabs.js (setTab/setRange), banner.js (error banner), toast.js (popup de confirmación), refresh.js
```

`state.js` (`S` y `charts`) es la única fuente de verdad en memoria — si el browser no ha hecho `fetchAll()` reciente, todo lo que deriva de `computed.js` queda stale.

## Arquitectura

**No hay backend propio.** El "servidor" es un Google Sheet público (solo lectura) + un Google Apps Script desplegado como Web App (solo escritura). El browser lee y escribe directo contra Google, sin intermediarios:

- **Lectura**: `fetchCSV()` (`src/api/sheets.js`) pega contra el endpoint público `gviz/tq?tqx=out:csv` del Sheet (no requiere auth, el Sheet debe estar compartido como "Cualquiera con el enlace — Visualizador").
- **Escritura**: `postScript()` (`src/api/sheets.js`) hace `POST` al Apps Script con `mode: 'no-cors'` — no se puede leer la respuesta HTTP (limitación de CORS de Apps Script), así que la confirmación de que algo se guardó es implícita: se asume éxito y luego se hace un re-fetch (`fetchAll()`) para reflejar el estado real.
- El Apps Script (documentado completo en `README.md`, sección 2) es un `doPost` con tres acciones (`movimiento`, `actualizar_fondo`, `participante`) que solo hacen `appendRow` — **es un log append-only, no hay UPDATE/DELETE ni validación del lado servidor.**

### Modelo de datos (pestañas del Sheet)

| Pestaña | Columnas | Quién la llena |
|---|---|---|
| `historial_fondo` | `fecha, valor_total_usd, precio_cuota_usd, cuotas_en_circulacion, trm` | Snapshots — un valor total del fondo confirmado por el admin en cada punto del tiempo. Puede tener varias filas el mismo día (valuaciones intradía); el frontend las dedupea (ver abajo) |
| `movimientos` | `fecha, persona, tipo, monto_usd, precio_cuota_dia, cuotas, monto_cop, trm_dia` | Un aporte/retiro individual por fila |
| `participantes_config` | `fecha, nombre, accion` | Log append-only de `agregar`/`quitar` — panel Admin → "Gestionar participantes". `participantesActivos()` (`src/computed.js`) toma la última acción por nombre |
| `participantes` | `nombre, cuotas_totales` | **Fórmula**, no dato: `=SUMIF(movimientos!B:B,"<nombre>",movimientos!F:F)` — se recalcula sola. No la lee el frontend (solo referencia visual dentro del Sheet) |

### Participantes dinámicos

`PARTICIPANTS` ya no existe como constante estática en `config.js`. La lista sale de `participantesLog` (`src/state.js`), poblada desde la pestaña `participantes_config`:

- `participantesActivos()` — última acción `agregar`/`quitar` por nombre gana. Se usa para el `<select>` de "Registrar movimiento" (solo se puede aportar/retirar a alguien activo).
- `participantesTodos()` — activos ∪ cualquier `persona` que aparezca en `movimientos`, aunque haya sido quitado después. Se usa en `resumen.js`/`charts.js` para que alguien con cuotas reales nunca desaparezca de su tarjeta o del donut solo por salir de la lista activa.

"Quitar" un participante nunca borra su historial ni sus cuotas — solo lo saca de la lista de selección para movimientos nuevos.

### El modelo de "cuotas" — la parte no obvia

El fondo funciona como un fondo mutuo: cada aporte/retiro se convierte a "cuotas" al precio de cuota vigente en ese momento, y `precio_cuota = valor_total_fondo / cuotas_en_circulacion`. Esto significa que **el precio de cuota usado para convertir un aporte en cuotas debe reflejar el valor REAL del fondo justo antes de ese aporte** — si se usa un precio de cuota desactualizado (de un checkpoint viejo, sin capturar ganancias/pérdidas posteriores), el nuevo aportante compra cuotas "baratas" y se lleva gratis parte de la ganancia que le correspondía a los aportantes anteriores (dilución).

`submitMov()` (`src/admin.js`) resuelve esto derivando el precio de cuota "justo antes" a partir del `valor del fondo después` (que el admin escribe a mano y se asume correcto) y el monto del movimiento — **no** lee el precio de cuota del último checkpoint guardado (eso fue un bug real, corregido; ver commit history). La fórmula:

```js
valorAntes = tipo === 'retiro' ? valorFondo + monto_usd : valorFondo - monto_usd;
pc         = cuotasActuales > 0 ? valorAntes / cuotasActuales : 1;
```

Si tocás esta función, no vuelvas a usar `precioCuota()` (el checkpoint cacheado) para calcular las cuotas de un movimiento nuevo — es exactamente la regresión que ya se corrigió.

`submitFondo()` (`src/admin.js`) es distinto: registra una "valuación" (cambio de valor sin aporte/retiro, ej. cierre de semana) — ahí sí es correcto usar `cuotasCirc()` porque las cuotas circulantes no cambian, solo el precio.

### El eje x de las gráficas — proporcional al tiempo, no por índice

`src/render/charts.js` grafica con `type: 'linear'` en el eje x usando timestamps reales (`{x: ms, y: valor}` por punto), no un eje `category` con un array de labels — así un hueco de 6 días ocupa 6x más ancho que uno de 1 día. Si volvés a un eje por índice/label, se pierde esa proporcionalidad (fue exactamente el bug reportado y corregido).

- **Ticks alineados a calendario**: `computeCalendarTicks()` decide la granularidad según el span visible (mes si es >150 días, semana si es >20, cada 4 días si es >8, si no todos los días) y devuelve timestamps exactos (inicio de mes/semana), no índices de datos — se inyectan pisando el array de ticks vía `afterBuildTicks`, independiente de si existe un dato real justo ahí.
- **Gotcha de Chart.js**: el eje `linear` por default usa `bounds: 'ticks'`, que expande `min`/`max` a sus propios ticks "redondos" autogenerados — `afterBuildTicks` los pisa pero no corrige ese `min` ya inflado, y queda un hueco fantasma antes del primer punto real. Por eso `xAxis()` fija `min`/`max` explícitos al primer/último timestamp real (más `bounds: 'data'` como refuerzo). Si se quita ese `min`/`max` explícito, vuelve el hueco.
- **Clamp del punto de backward-fill**: `filteredHistorialWithFill()` puede anteponer la última valuación *antes* del rango seleccionado (para que la línea no arranque en cero); su fecha real puede ser muy anterior al rango visible, así que en `renderCharts()` se clampea su `x` al borde del rango (no a su fecha real) — si no, la mayor parte del ancho del chart quedaría desperdiciada en un tramo plano fuera del rango.
- **Líneas rectas, sin curvas**: `tension: 0` en `makeDataset()` — con tension>0 y espaciado proporcional (gaps muy desiguales entre puntos), el suavizado bezier de Chart.js generaba distorsiones visibles cerca de los bordes. El radio de los puntos (`pointRadiusFor()`) baja según la cantidad de puntos para que no se amontonen en rangos largos.

### El form de Admin es "state-backed" — no confía en que el navegador retenga los valores

En iOS Safari, los `<input type="date">`/`<input type="time">` del panel Admin a veces se vacían solos: al cambiar de tab (`.tab-content` usa `display:none`/`block`, y el input pierde su valor al re-mostrarse) o durante el reflow grande que dispara `renderAll()` después de guardar. Es un bug de WebKit, no reproducible en Chromium — no lo arregles cambiando el mecanismo de tabs sin probarlo primero en un iPhone real.

El workaround vive en `src/admin.js`: `FORM_FIELDS` lista los IDs de todos los campos del form; `saveFormSnapshot()` los copia a un objeto en memoria en cada `input`/`change` (delegado en `#admin-panel`, ver `bindAdminEvents()`); `restoreFormSnapshot()` (exportada) los reaplica. Se llama después de `fetchAll()` en `submitMov()`/`submitFondo()`/`agregarParticipante()`/`quitarParticipante()`, y en `setTab()` (`src/ui/tabs.js`) al entrar al tab `admin`. **Si agregás un campo nuevo al form de Admin, sumalo a `FORM_FIELDS`** o quedará fuera de este mecanismo.

### Otras particularidades

- **Cero emojis en la UI**: ni en toasts, status messages, banners, ni iconos decorativos (`src/ui/toast.js`, `src/admin.js`, `src/ui/banner.js`). Pedido explícito — el color/clase CSS (`.ok`/`.err`) ya comunica el estado.
- **Auth del panel admin es cosmética**: `ADMIN_KEY` (`src/config.js`) se valida solo en el frontend, y queda embebida en el bundle público. Aceptado para uso familiar privado (ver `README.md`), no es un control de seguridad real.
- **Parser de números formato colombiano**: `parseCONumber()` (`src/utils/csv.js`) distingue `1.300,00` (miles+decimal) de `11,23` (solo decimal) de `1.300` (solo miles) — heurística basada en cantidad de dígitos después del último punto. Fechas se normalizan de formato colombiano a ISO en `normDate()` (`src/utils/dates.js`).
- **TRM** se trae en vivo de la Superfinanciera vía `datos.gov.co` (`fetchTRM()`, `src/api/sheets.js`), con fallback a 4000 si falla el fetch.
- **`S.historial` es un registro por día, no una fila cruda por movimiento del Sheet**: `fetchAll()` (`src/api/sheets.js`) dedupea `historial_fondo` quedándose con la valuación más reciente de cada día (`fecha.slice(0, 10)` como key). Si el admin registra varias valuaciones el mismo día, solo sobrevive la última — evita que el chart (`filteredHistorialWithFill()`, `src/render/charts.js`) haga zigzag intradía o repita el mismo día en el eje x. Si necesitás el detalle intradía crudo, hay que leer `histRows` antes del dedupe, no `S.historial`.
- **Sin inline handlers**: el HTML no tiene `onclick`/`oninput`; todos los listeners se registran en `main.js`/`admin.js` vía `addEventListener`, apoyados en atributos `data-*` (`data-tab`, `data-r`, `data-tipo`).
