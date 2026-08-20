# mcp-google-slides

Servidor **MCP remoto** (transporte **Streamable HTTP**) que permite a un cliente MCP
(Claude, ChatGPT u otro) **leer, crear y actualizar Google Slides** usando las APIs
oficiales de **Google Slides v1** y **Google Drive v3**, con **OAuth 2.0 por usuario** y
**refresh tokens cifrados**.

Está pensado para informes operativos de circuitos de camiones, cámaras LPR y plantas
(Ricardone, San Lorenzo, Avellaneda). Es un **paquete aislado** dentro del repo
(`mcp-google-slides/`): tiene su propio `package.json` y `node_modules`, **no** agrega
dependencias al dashboard principal ni participa de su build.

---

## Tabla de contenido

- [Arquitectura](#arquitectura)
- [Herramientas MCP](#herramientas-mcp)
- [Variables de entorno](#variables-de-entorno)
- [Puesta en marcha (local)](#puesta-en-marcha-local)
- [Configurar Google Cloud](#configurar-google-cloud)
- [Autorizar OAuth](#autorizar-oauth)
- [Conectar desde Claude](#conectar-desde-claude)
- [Conectar desde ChatGPT](#conectar-desde-chatgpt)
- [Despliegue (HTTPS / Docker)](#despliegue-https--docker)
- [Seguridad](#seguridad)
- [Pruebas](#pruebas)
- [Pasos manuales pendientes](#pasos-manuales-pendientes)

---

## Arquitectura

```
mcp-google-slides/
├─ src/
│  ├─ index.ts                 # entrypoint: levanta el servidor HTTP
│  ├─ config.ts                # carga + validación de env (Zod)
│  ├─ server/
│  │  ├─ httpServer.ts         # Express + Streamable HTTP + /health + OAuth + auth de cliente
│  │  └─ mcpServer.ts          # crea McpServer y registra tools
│  ├─ auth/
│  │  ├─ oauthClient.ts        # cliente OAuth2 de Google + URL de consentimiento
│  │  ├─ oauthRoutes.ts        # /oauth/start, /oauth/callback, /oauth/status
│  │  ├─ tokenStore.ts         # store cifrado (archivo) o Supabase
│  │  └─ crypto.ts             # AES-256-GCM seal/open
│  ├─ google/
│  │  ├─ googleClient.ts       # clientes autorizados Slides+Drive por usuario
│  │  ├─ slidesService.ts      # operaciones Slides + allowlist de batchUpdate
│  │  ├─ slidesTransform.ts    # respuestas de Google -> resúmenes estables
│  │  └─ driveService.ts       # búsqueda/paginación/duplicado/export
│  ├─ tools/
│  │  ├─ schemas.ts            # esquemas Zod de cada tool
│  │  └─ registerTools.ts      # registro de las 14 tools MCP
│  ├─ lib/                     # urls, placeholders, retry/timeout, errores, logging
│  └─ scripts/authorize.ts     # helper CLI para iniciar OAuth
├─ test/                       # pruebas con mocks (Vitest)
├─ supabase/migrations/        # tabla opcional de tokens
├─ Dockerfile / .dockerignore
├─ .env.example
└─ README.md
```

**Separación de responsabilidades clave:**

- **Autenticación del cliente MCP** (`Authorization: Bearer <MCP_AUTH_TOKEN>`) — protege el
  endpoint `/mcp`. Es **independiente** de…
- **Autorización OAuth de Google** — cada usuario/tenant concede acceso a su cuenta de
  Google vía navegador; se guarda un **refresh token cifrado**.

El servidor **no duplica reglas de negocio**: compone llamadas a las APIs de Google.

---

## Herramientas MCP

| # | Tool | Tipo | Descripción |
|---|------|------|-------------|
| 1 | `google_slides_get_presentation` | lectura | Título, dimensiones, slides, textos, notas, elementos y objectIds (acepta URL o ID). |
| 2 | `google_slides_create_presentation` | escritura | Crea una presentación; opcional carpeta de Drive. |
| 3 | `google_slides_duplicate_presentation` | escritura | Duplica una presentación (plantilla) con nombre/carpeta destino. |
| 4 | `google_slides_list_slides` | lectura | Orden, objectId, título y contenido resumido de cada slide. |
| 5 | `google_slides_add_slide` | escritura | Agrega slide con layout y posición. |
| 6 | `google_slides_replace_text` | escritura | Reemplaza placeholders `{{FECHA}}`, `{{PLANTA}}`, `{{TOTAL_CAMIONES}}` en toda la ppt o slides puntuales. |
| 7 | `google_slides_update_text_element` | escritura | Actualiza un cuadro de texto por objectId (preserva formato en lo posible). |
| 8 | `google_slides_insert_textbox` | escritura | Crea un cuadro de texto (posición, tamaño, contenido, formato básico). |
| 9 | `google_slides_insert_image` | escritura | Inserta o reemplaza una imagen por URL. |
| 10 | `google_slides_add_table` | escritura | Crea una tabla y carga valores. |
| 11 | `google_slides_delete_slide` | **destructiva** | Elimina una slide por objectId. **Requiere `confirm=true`.** |
| 12 | `google_slides_batch_update` | escritura/**destructiva** | `presentations.batchUpdate` validado contra allowlist. **`confirm=true`** si hay operaciones destructivas / reemplazo masivo. |
| 13 | `google_drive_search_presentations` | lectura | Busca por nombre/carpeta/fecha con **paginación** (`nextPageToken`). |
| 14 | `google_drive_export_presentation` | lectura | Exporta a **PDF** o **PPTX** (base64). |

Las unidades de posición/tamaño son **EMU** por defecto (1 pulgada = 914400 EMU) o **PT**
si se indica `unit: "PT"`.

---

## Variables de entorno

Copiá `.env.example` a `.env` y completá:

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `PORT` / `HOST` | no | Puerto/host del servidor (default `8790` / `127.0.0.1`). |
| `PUBLIC_BASE_URL` | sí (prod) | URL pública HTTPS del servidor; base del callback OAuth. |
| `MCP_AUTH_TOKEN` | sí (prod) | Bearer que el cliente MCP debe enviar. Vacío = sin auth (solo dev). |
| `GOOGLE_CLIENT_ID` | sí | Client ID OAuth de Google Cloud. |
| `GOOGLE_CLIENT_SECRET` | sí | Client Secret OAuth. |
| `GOOGLE_OAUTH_REDIRECT_URI` | no | Callback; se deriva de `PUBLIC_BASE_URL` si se omite. |
| `GOOGLE_SCOPES` | no | Scopes (mínimo privilegio). Ver abajo. |
| `TOKEN_STORE` | no | `file` (default) o `supabase`. |
| `TOKEN_ENCRYPTION_KEY` | sí | 32 bytes en hex(64)/base64 para AES-256-GCM. |
| `TOKEN_STORE_PATH` | no | Ruta del archivo cifrado (si `file`). |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_TOKENS_TABLE` | si `supabase` | Reutilizá el Supabase del dashboard. |
| `DEFAULT_USER_ID` | no | Tenant por defecto (default `default`). |
| `GOOGLE_HTTP_TIMEOUT_MS` / `GOOGLE_MAX_RETRIES` | no | Timeout y reintentos con backoff. |
| `LOG_LEVEL` | no | `debug`/`info`/`warn`/`error`. |

Generá la clave de cifrado:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Scopes (mínimo privilegio).** Default funcional para las 14 tools:

- `https://www.googleapis.com/auth/presentations` — leer/crear/editar Slides.
- `https://www.googleapis.com/auth/drive.file` — gestionar archivos creados/abiertos por la app.
- `https://www.googleapis.com/auth/drive.readonly` — buscar/duplicar/exportar presentaciones **existentes**.

Si **no** necesitás buscar/duplicar/exportar archivos ajenos, quitá `drive.readonly` y quedás
con el mínimo estricto (solo lo que crea la app).

---

## Puesta en marcha (local)

```bash
cd mcp-google-slides
npm install
cp .env.example .env    # y completá los valores
npm run dev             # levanta con recarga (tsx watch)
```

Comandos:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest (mocks, sin red real)
npm run build       # compila a dist/
npm start           # ejecuta dist/index.js (producción)
```

Endpoint de salud:

```bash
curl http://127.0.0.1:8790/health
```

---

## Configurar Google Cloud

1. Entrá a <https://console.cloud.google.com/> y **creá un proyecto** (o elegí uno).
2. **APIs y servicios → Biblioteca**: habilitá **Google Slides API** y **Google Drive API**.
3. **APIs y servicios → Pantalla de consentimiento OAuth**:
   - Tipo de usuario: **Externo** (o **Interno** si es Workspace).
   - Completá nombre de app, correo de soporte y logo si corresponde.
   - **Scopes**: agregá `.../auth/presentations`, `.../auth/drive.file` y (si lo usás)
     `.../auth/drive.readonly`.
   - **Usuarios de prueba**: agregá tu cuenta mientras la app esté en modo *Testing*.
4. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación web**.
   - **URIs de redireccionamiento autorizados**: agregá **exactamente**
     `https://TU-DOMINIO/oauth/callback` (y `http://127.0.0.1:8790/oauth/callback` para local).
   - Copiá **Client ID** y **Client Secret** al `.env`.

> En modo *Testing* el refresh token puede caducar a los 7 días. Para uso continuo,
> **publicá** la app (o usá Workspace interno).

---

## Autorizar OAuth

Con el servidor corriendo:

```bash
npm run oauth            # imprime la URL de /oauth/start
# o abrí directamente:
#   http://127.0.0.1:8790/oauth/start
```

Otorgá acceso en la pantalla de Google. Al volver verás “✅ Autorización completa” y el
**refresh token queda cifrado** para el usuario. Verificá:

```bash
curl http://127.0.0.1:8790/oauth/status
```

Para multi-tenant: `.../oauth/start?userId=planta-avellaneda` (y pasá `userId` en las tools).

---

## Conectar desde Claude

- **Claude.ai / Claude Desktop (conectores remotos):** Settings → Connectors → *Add custom
  connector* → URL `https://TU-DOMINIO/mcp`. Si configuraste `MCP_AUTH_TOKEN`, agregá el
  header `Authorization: Bearer <MCP_AUTH_TOKEN>`.
- **Claude Code (CLI):**

  ```bash
  claude mcp add --transport http google-slides https://TU-DOMINIO/mcp \
    --header "Authorization: Bearer <MCP_AUTH_TOKEN>"
  ```

  Para local sin HTTPS: `http://127.0.0.1:8790/mcp`.

## Conectar desde ChatGPT

- **ChatGPT (Developer mode / Connectors):** Settings → Connectors → *Create* → tipo **MCP /
  Streamable HTTP** → URL `https://TU-DOMINIO/mcp`, header
  `Authorization: Bearer <MCP_AUTH_TOKEN>`.
- Requiere que el servidor esté publicado con **HTTPS**.

> Ambos clientes hablan **Streamable HTTP** contra `/mcp`. La autorización de Google es
> independiente: se hace una vez por navegador vía `/oauth/start`.

---

## Despliegue (HTTPS / Docker)

Cualquier plataforma que dé **HTTPS** y un puerto: Google Cloud Run, Render, Fly.io,
Railway, o VPS con Nginx/Caddy como reverse proxy TLS.

```bash
docker build -t mcp-google-slides .
docker run --rm -p 8790:8790 --env-file .env \
  -e HOST=0.0.0.0 -e PUBLIC_BASE_URL=https://TU-DOMINIO \
  mcp-google-slides
```

Checklist de producción:

1. `PUBLIC_BASE_URL=https://TU-DOMINIO` y `GOOGLE_OAUTH_REDIRECT_URI` registrada **idéntica**
   en Google Cloud.
2. `MCP_AUTH_TOKEN` seteado (token largo y aleatorio).
3. `TOKEN_ENCRYPTION_KEY` persistente (si cambia, se invalidan los tokens guardados).
4. Para múltiples instancias, usar `TOKEN_STORE=supabase` (el store de archivo es por-instancia)
   y mover el `state` OAuth a un backend compartido.
5. Terminar TLS en la plataforma o en Nginx/Caddy delante del contenedor.

---

## Seguridad

- **Sin secretos en el código**: todo por env; `.env` está en `.gitignore`.
- **Refresh tokens cifrados** en reposo con AES-256-GCM (archivo o Supabase).
- **Logs redactados**: el logger oculta tokens/secrets automáticamente.
- **Validación estricta** de todos los parámetros con Zod.
- **Allowlist de `batchUpdate`**: se rechaza cualquier operación no permitida **antes** de
  llamar a Google (anti llamadas arbitrarias).
- **Confirmación** obligatoria (`confirm=true`) en borrados y reemplazos masivos.
- **Timeouts + reintentos con backoff** ante 429/5xx/errores de red.
- **Mínimo privilegio** en scopes de Google (configurable).
- **Auth de cliente MCP** separada de la autorización de Google.

---

## Pruebas

```bash
npm test
```

Cobertura (todo con **mocks**, sin red real):

- Extracción de ID desde múltiples formatos de URL (`test/urls.test.ts`).
- Validación de parámetros Zod (`test/schemas.test.ts`).
- Reemplazo de placeholders y `replaceAllText` (`test/placeholders.test.ts`).
- Transformación de respuestas de Google (`test/slidesTransform.test.ts`).
- Servicios Slides: allowlist de batch, updateText, addTable, deleteSlide (`test/slidesService.test.ts`).
- Servicios Drive: query, paginación, export, duplicado (`test/driveService.test.ts`).
- Cifrado seal/open y errores de clave (`test/crypto.test.ts`).
- Token store cifrado en disco (`test/tokenStore.test.ts`).
- Normalización de errores de permisos/credenciales (`test/errors.test.ts`).
- **Tools MCP end-to-end** vía cliente in-memory (`test/tools.integration.test.ts`).

---

## Pasos manuales pendientes

Estos requieren credenciales/servicios reales y **no** se pueden automatizar con mocks:

1. Crear el proyecto en Google Cloud, habilitar Slides+Drive API y crear el **OAuth Client**
   (ver arriba). Completar `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` en `.env`.
2. Generar `TOKEN_ENCRYPTION_KEY` y (si usás Supabase) aplicar la migración
   `supabase/migrations/0001_mcp_google_oauth_tokens.sql`.
3. Ejecutar el **flujo OAuth real** una vez (`/oauth/start`) para obtener el refresh token.
4. Probar contra una **presentación real** (get/list/replace/export).
5. Elegir el **servicio de despliegue** con HTTPS y registrar la redirect URI definitiva.
6. Conectar el servidor desde **Claude** y **ChatGPT** con la URL pública.
```
