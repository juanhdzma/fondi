# Ahorro Familiar

Dashboard web para gestionar un fondo de inversión familiar. Muestra valor del fondo, precio de cuota, participación individual y rendimiento en USD y COP.

---

## Requisitos previos

- Google Account
- Cuenta GitHub con acceso a GitHub Container Registry
- Servidor con Docker + Portainer (o cualquier host con Docker)

---

## 1. Google Sheet

### Crear el Sheet

1. Crear un nuevo Google Sheet en [sheets.google.com](https://sheets.google.com)
2. Copiar el **Sheet ID** de la URL:
   ```
   https://docs.google.com/spreadsheets/d/**SHEET_ID**/edit
   ```

### Crear las tres pestañas con exactamente estos nombres

| Pestaña | Columnas (en orden) |
|---|---|
| `historial_fondo` | `fecha` · `valor_total_usd` · `precio_cuota_usd` · `cuotas_en_circulacion` · `trm` |
| `movimientos` | `fecha` · `persona` · `tipo` · `monto_usd` · `precio_cuota_dia` · `cuotas` · `monto_cop` · `trm_dia` |
| `participantes` | `nombre` · `cuotas_totales` |

> La primera fila de cada pestaña debe ser el encabezado. Los datos empiezan en la fila 2.

### Hacer el Sheet público (solo lectura)

1. Botón **Compartir** → **Cambiar a cualquier persona con el enlace**
2. Permiso: **Visualizador**

---

## 2. Google Apps Script (escritura)

El panel admin escribe datos al Sheet via un Apps Script desplegado como Web App.

### Crear el script

1. En el Sheet: **Extensiones → Apps Script**
2. Reemplazar todo el contenido con:

```javascript
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (data.action === 'movimiento') {
    ss.getSheetByName('movimientos').appendRow([
      data.fecha,
      data.persona,
      data.tipo,
      data.monto_usd,
      data.precio_cuota_dia,
      data.cuotas,
      data.monto_cop,
      data.trm_dia
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.action === 'actualizar_fondo') {
    ss.getSheetByName('historial_fondo').appendRow([
      data.fecha,
      data.valor_total_usd,
      data.precio_cuota_usd,
      data.cuotas_en_circulacion,
      data.trm
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ error: 'Acción desconocida' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Guardar** el proyecto (Ctrl+S)
4. **Desplegar → Nueva implementación**
   - Tipo: **Web App**
   - Ejecutar como: **Yo** (tu cuenta Google)
   - Quién tiene acceso: **Cualquier persona**
5. Autorizar los permisos cuando se soliciten
6. Copiar la URL generada (formato `https://script.google.com/macros/s/.../exec`)

> ⚠️ Cada vez que modifiques el script debes crear una **nueva implementación**. Editar sin redesplegar no afecta la URL de producción.

---

## 3. Configurar la app

Abrir `index.html` y editar las constantes al inicio del `<script>`:

```javascript
const SHEET_ID       = 'TU_SHEET_ID_AQUI';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/.../exec';
const ADMIN_KEY      = 'TU_CLAVE_SECRETA';
const PARTICIPANTS   = ['Nombre1', 'Nombre2', 'Nombre3', 'Nombre4'];
```

| Variable | Descripción |
|---|---|
| `SHEET_ID` | ID del Google Sheet (de la URL) |
| `APPS_SCRIPT_URL` | URL de la Web App del Apps Script |
| `ADMIN_KEY` | Clave para acceder al panel admin |
| `PARTICIPANTS` | Nombres exactos de los participantes del fondo |
| `MOCK_MODE` | `true` para datos de prueba, `false` para usar el Sheet real |

---

## 4. Correr localmente

```bash
python3 -m http.server 8080
# Abrir http://localhost:8080
```

---

## 5. Docker

### Build manual

```bash
docker build -t fondo-familiar .
docker run -p 8080:80 fondo-familiar
```

### GitHub Container Registry (GHCR)

El repositorio incluye un workflow en `.github/workflows/docker.yml` que construye y publica la imagen automáticamente en cada push a `main`.

#### Setup inicial

```bash
# 1. Crear el repo en GitHub
gh repo create <usuario>/fondo-familiar --private --source=. --push

# 2. Si el remote quedó en SSH y no tenés key configurada:
git remote set-url origin https://github.com/<usuario>/fondo-familiar.git
git push -u origin main
```

El workflow se dispara solo. En ~2 minutos la imagen queda en:
```
ghcr.io/<usuario>/fondo-familiar:latest
```

#### Autenticación para pull desde el servidor

```bash
# En el servidor donde corre Docker:
echo <GITHUB_PAT> | docker login ghcr.io -u <usuario> --password-stdin
```

El PAT necesita el scope `read:packages`. Crearlo en:  
GitHub → Settings → Developer settings → Personal access tokens

---

## 6. Deploy con Docker Compose (Portainer)

```yaml
services:
  fondo-familiar:
    image: ghcr.io/<usuario>/fondo-familiar:latest
    container_name: fondo-familiar
    restart: unless-stopped
    networks:
      - proxy

networks:
  proxy:
    external: true
```

> La red `proxy` debe existir (Traefik u otro reverse proxy). El contenedor sirve en el puerto **80**.

---

## 7. Flujo para actualizar la app

```bash
# Editar index.html
git add index.html
git commit -m "feat: descripción del cambio"
git push
# El workflow de GitHub Actions rebuilda la imagen automáticamente
# Luego en Portainer: pull + recreate del contenedor
```

---

## Notas

- **TRM**: se obtiene automáticamente de [datos.gov.co](https://www.datos.gov.co/resource/32sa-8pi3.json) (Superfinanciera Colombia, TRM oficial).
- **Escritura al Sheet**: usa `mode: 'no-cors'` por limitaciones de CORS en Apps Script. La escritura ocurre igualmente; el re-fetch del CSV confirma los datos.
- **Clave admin**: se valida solo en el frontend. Adecuado para uso familiar privado.
- **Formato de fechas**: el Sheet exporta fechas en formato colombiano (`14/06/2026 17:56:00`). La app normaliza automáticamente a ISO.
