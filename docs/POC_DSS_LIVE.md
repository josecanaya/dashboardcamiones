# POC — Video en vivo desde DSS Professional V8.7 (sección "en vivo")

Objetivo final: en la sección en vivo del dashboard, poder abrir el video en
vivo de una cámara (desde el monitor de cámaras por sector, o desde el contexto
del camión seleccionado). La sección en vivo corre local en una PC con acceso
VPN al DSS. El **catálogo** (qué cámara es cuál y en qué IP está) sale del DSS;
el **stream** se toma por RTSP directo de la cámara, porque este build del DSS no
expone URL de video (ver "API real del DSS de planta"). Las credenciales viven
solo en el server local: el browser nunca ve host, usuario ni RTSP.

(El popup sobre visor IFC es un caso de uso de otra plataforma; comparte las
etapas 1 y 2 de este runbook.)

## Arquitectura

```
Browser (dashboard / visor IFC)
   │  WebRTC / MSE (http://localhost:1984 de go2rtc)
   ▼
go2rtc (PC local, misma máquina que el server truckflow)
   │  RTSP :554 (digest auth con CAM_RTSP_USER/PASS)
   ▼
Cámara Dahua (192.168.4.3x / 192.168.3.x, vía VPN)
   ▲
   │  server local Node ← OpenAPI DSS HTTPS :443 (login + inventario canal→IP)
   │  credenciales DSS y de cámara solo en .env del server
```

Piezas:

1. **OpenAPI del DSS** (`/brms/...` en el puerto 443 del server DSS): login en dos
   pasos con firma MD5 → token de sesión → inventario de canales (nombre → IP).
2. **go2rtc** (binario único, sin instalación): consume ese RTSP y lo re-expone
   al browser como WebRTC (latencia <1 s) o MSE. El browser no habla RTSP.
3. **Frontend**: popup con `<video>` (o el web component `video-stream` de
   go2rtc) apuntando a `http://localhost:1984/...?src=<camara>`.

## API real del DSS de planta (verificado 14/09/2026, DSS Pro V8.007)

Lo que el build instalado **sí** expone (probado contra 192.168.4.2:443):

| Para qué | Endpoint |
| --- | --- |
| Login (2 pasos, MD5) | `POST /brms/api/v1.0/accounts/authorize` |
| Keepalive | `PUT /brms/api/v1.0/accounts/keepalive` |
| Canales (nombre → channelId) | `GET /brms/api/v1.1/device/channel/page?page=1&pageSize=500` |
| Dispositivos (deviceCode → IP) | `GET /brms/api/v1.1/device/page?page=1&pageSize=500` |

Detalles que cuestan una tarde si no están escritos:

- El **paso 1 del login responde HTTP 401** con `realm`/`randomKey`: es el challenge, no un error.
- El token dura **30 segundos** (`duration` del login) → keepalive agresivo, no cada 5 min.
- Los canales traen `unitType`: **'1' es el canal de video**; 3 y 4 son subcanales del mismo
  equipo y duplican nombres (224 filas → 60 cámaras reales).
- Toda ruta desconocida del gateway devuelve **HTTP 503 con una página HTML**, y las rutas
  desconocidas dentro de `/brms` devuelven `{"code":1010}`. Ninguna de las dos es "servicio caído".

Lo que **no** existe en este build (probado, no supuesto):

- El prefijo `/vms` completo → `POST /vms/api/v1.0/realmonitor/uri` **no existe**. No hay
  endpoint de "dame la URL RTSP del canal" (se enumeraron ~1000 combinaciones bajo
  `/brms` y `/obms`; todas 1010).
- El RTSP server del DSS (`:9320`, "Dahua Rtsp Server/2.0") responde **404** a
  `dss/monitor/param?cameraid=…` y variantes.

**Consecuencia de diseño**: el DSS queda como *fuente de verdad del inventario*
(nombre de canal → IP de cámara) y el stream se toma **RTSP directo de la cámara**:
`rtsp://<CAM_RTSP_USER>:<CAM_RTSP_PASS>@<ip>:554/cam/realmonitor?channel=1&subtype=1`.
Las cámaras de Ricardone (192.168.4.3x) y San Lorenzo (192.168.3.x) son alcanzables por
la VPN y piden digest auth. Las credenciales viven solo en el `.env` del server.

## Etapa 1 — POC de la API (script listo)

Script: `scripts/poc-dss-live.mjs`. Desde la PC con VPN:

```powershell
$env:DSS_HOST = "IP_DEL_DSS"
$env:DSS_USER = "usuario"
$env:DSS_PASS = "contraseña"
node scripts/poc-dss-live.mjs login      # valida el flujo de autenticación
node scripts/poc-dss-live.mjs channels   # lista canales (anotar channelId de una LPR)
node scripts/poc-dss-live.mjs rtsp 1000004$1$0$0   # pide URL RTSP de ese canal
```

Recomendación: crear en el DSS un **usuario dedicado de solo-visualización**
(rol con permiso de "Real-time Monitor" sobre las cámaras necesarias y nada
más). Nunca usar el admin.

Verificar la URL RTSP resultante con VLC (Medio → Abrir ubicación de red) desde
la misma PC. Si VLC reproduce, la etapa 1 está cerrada.

Notas:
- El cert del DSS es autofirmado; el script ya lo tolera.
- Si `channels` devuelve 404 en todas las variantes, consultar el manual
  "DSS Pro OpenAPI" de la versión instalada (Dahua lo entrega con el DSS o vía
  partner portal) y ajustar el path — el resto del flujo no cambia.
- El token de sesión expira (`duration` del login); en producción hará falta
  keepalive (`PUT /brms/api/v1.0/accounts/keepalive`) o re-login.

## Etapa 2 — go2rtc para verlo en el browser

1. Descargar `go2rtc_win64.zip` de https://github.com/AlexxIT/go2rtc/releases
   (un solo .exe).
2. `go2rtc.yaml` junto al exe:

```yaml
streams:
  # pegar la URL RTSP que devolvió la etapa 1
  cam_s4_01: rtsp://<lo-que-devuelva-el-dss>
```

3. Ejecutar `go2rtc.exe` y abrir `http://localhost:1984` → links → probar
   WebRTC/MSE de `cam_s4_01`.

Ojo: la URL RTSP del DSS lleva token temporal → en producción go2rtc no puede
tener la URL hardcodeada; el server local la renueva vía API (etapa 3).

## Etapa 3 — Integración en la sección "en vivo" (IMPLEMENTADA)

Implementado en `server/dss-live.mjs` (cliente OpenAPI + go2rtc) y cableado en
`server/truckflow-local-server.mjs`. Endpoints (el proxy Vite `/api/truckflow`
→ :8787 ya existía):

- `GET  /api/truckflow/live-camera/status` — `{ dssConfigured, dssSession,
  go2rtcBase, go2rtcOk, channelCacheCount }`. No hace login DSS (rápido siempre).
- `GET  /api/truckflow/live-camera/channels` — canales DSS
  (`{ name, channelId, source: 'dss'|'override' }`); útil para diagnosticar el
  mapeo y armar overrides.
- `POST /api/truckflow/live-camera/:deviceCode/stream` — resuelve
  `deviceCode → cámara` (por nombre de canal, case-insensitive), arma la URL RTSP
  de la cámara, la registra en go2rtc y devuelve `{ playerUrl }`. Errores tipados:
  `dss_not_configured` / `cam_credentials_missing` (503), `channel_not_found`
  (404 con `suggestions`), `go2rtc_unreachable` / `dss_error` (502).

**Mapeo deviceCode → channelId**: automático por nombre de canal DSS (los
nombres del feed — `RicCal01`, `RicB1Ingreso`, … — deberían coincidir). Para
excepciones: crear `data/dss/dss-channel-overrides.json` con formato
`{ "RicCal01": "192.168.4.35" }` (IP de la cámara) o directamente una URL
`rtsp://…` completa (prioridad sobre lo automático).

**Sesión DSS**: token cacheado + keepalive automático + retry único ante token
vencido. Los paths de la OpenAPI están concentrados en la constante `DSS_API`
al tope de `server/dss-live.mjs` — si un build del DSS difiere, se ajusta solo
ahí (usar el POC de la etapa 1 para descubrir los paths correctos).

**UI**: en el home de planta, al elegir una zona del mapa aparece un botón por
**grupo de cámaras** (`cameraGroups` en `public/plant/<sitio>/plantZones.json`);
en calada son dos: "Calada" (RicCal01–06) y "Calada líquida" (RicCalLiq). El modal
`LiveCameraPlayerModal.tsx` abre una **grilla**: un iframe de go2rtc por cámara,
cada uno con su propio loading/error/reintento.

**Env** (`.env` del server, plantilla en `.env.example`): `DSS_HOST`,
`DSS_PORT` (443), `DSS_USER`, `DSS_PASS` para el inventario; `CAM_RTSP_USER`,
`CAM_RTSP_PASS`, `CAM_RTSP_PORT` (554) y `CAM_RTSP_SUBTYPE` (1 = sub-stream, el
recomendado para grillas de 6) para el video; `GO2RTC_BASE` (http://127.0.0.1:1984).

**Smoke** (sin VPN): con el server arriba, `npm run smoke:live` — valida ruta y
shape aunque `dssConfigured` sea false.

Extensión futura (no implementada): player en `LivePlantPage.tsx` ("Contexto
del camión") — su `camaraActual` es sintético (`CAM_RIC_S4_01`, no un
deviceCode real); requiere mapeo sector → cámara representativa del catálogo.

## Seguridad

- Credenciales DSS: solo en `.env` del server local (agregar a `.gitignore` si
  no está). Jamás en el bundle del frontend ni en URLs del browser.
- Usuario DSS dedicado, solo-lectura, solo las cámaras necesarias.
- El browser solo ve `localhost:1984` (go2rtc) y el server local; nunca la IP
  del DSS ni tokens de la OpenAPI.
