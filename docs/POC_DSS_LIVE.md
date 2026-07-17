# POC — Video en vivo desde DSS Professional V8.7 (sección "en vivo")

Objetivo final: en la sección en vivo del dashboard, poder abrir el video en
vivo de una cámara (desde el monitor de cámaras por sector, o desde el contexto
del camión seleccionado). La sección en vivo corre local en una PC con acceso
VPN al DSS; el video sale del **DSS** (no de las cámaras directo), así las
credenciales de cámaras nunca se exponen y el DSS audita/limita los streams.

(El popup sobre visor IFC es un caso de uso de otra plataforma; comparte las
etapas 1 y 2 de este runbook.)

## Arquitectura

```
Browser (dashboard / visor IFC)
   │  WebRTC / MSE (http://localhost:1984 de go2rtc)
   ▼
go2rtc (PC local, misma máquina que el server truckflow)
   │  RTSP con token temporal
   ▼
DSS Media Gateway (puerto ~9320, vía VPN)
   ▲
   │  OpenAPI HTTPS :443 → login + "dame la URL RTSP del canal X"
   │  (server local Node; credenciales DSS solo en .env del server)
```

Piezas:

1. **OpenAPI del DSS** (`/brms/...` y `/vms/...` en el puerto 443 del server DSS):
   login en dos pasos con firma MD5 → token de sesión → se pide la URL RTSP en
   vivo de un canal. La URL sale por el Media Gateway con token temporal.
2. **go2rtc** (binario único, sin instalación): consume ese RTSP y lo re-expone
   al browser como WebRTC (latencia <1 s) o MSE. El browser no habla RTSP.
3. **Frontend**: popup con `<video>` (o el web component `video-stream` de
   go2rtc) apuntando a `http://localhost:1984/...?src=<camara>`.

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
  `deviceCode → channelId` (por nombre de canal, case-insensitive), pide la URL
  RTSP al DSS, la registra en go2rtc y devuelve `{ playerUrl }`. Errores
  tipados: `dss_not_configured` (503), `channel_not_found` (404 con
  `suggestions`), `go2rtc_unreachable` / `dss_error` (502).

**Mapeo deviceCode → channelId**: automático por nombre de canal DSS (los
nombres del feed — `RicCal01`, `RicB1Ingreso`, … — deberían coincidir). Para
excepciones: crear `data/dss/dss-channel-overrides.json` con formato
`{ "RicCal01": "1000004$1$0$0" }` (prioridad sobre lo automático).

**Sesión DSS**: token cacheado + keepalive automático + retry único ante token
vencido. Los paths de la OpenAPI están concentrados en la constante `DSS_API`
al tope de `server/dss-live.mjs` — si un build del DSS difiere, se ajusta solo
ahí (usar el POC de la etapa 1 para descubrir los paths correctos).

**UI**: `LiveCameraMonitor.tsx` (monitor en vivo) → elegir sector y cámara →
botón "● Ver en vivo" en el header del Detalle operativo → modal
`LiveCameraPlayerModal.tsx` con iframe al player de go2rtc. Si `DSS_*` no está
en `.env`, el botón queda deshabilitado con tooltip (no rompe nada existente).

**Env** (`.env` del server, plantilla en `.env.example`): `DSS_HOST`,
`DSS_PORT` (443), `DSS_USER`, `DSS_PASS`, `GO2RTC_BASE`
(http://127.0.0.1:1984).

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
