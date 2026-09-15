# Plan de ejecución — Plant State

> **Este plan está escrito para que lo ejecute un agente barato.** Cada tarea es
> autocontenida: dice qué archivos leer (y solo esos), qué archivo tocar, cuál es
> el contrato exacto y con qué comando se verifica. No quedan decisiones de diseño
> abiertas: si algo no está escrito acá, **no se inventa — se pregunta**.
>
> Diseño de referencia: canvas «Home — plano vivo de planta».
> Rama: `automatizacion`.

## Cómo usar este plan

1. **Una tarea por sesión.** No empieces T05 en la misma sesión que T04.
2. **Leé solo los archivos de la sección «Leer».** El repo es grande; abrir de más
   gasta contexto y no aporta.
3. **Tocá solo los archivos de la sección «Editar».** Si creés que hace falta tocar
   otro, pará y reportalo.
4. **Corré el comando de «Verificar» antes de dar la tarea por terminada.** Si falla,
   la tarea no está hecha.
5. **No agregues dependencias** a `package.json`. Todo se hace con lo que ya hay.

## Reglas que valen para todas las tareas

- **Idioma:** comentarios y textos de UI en español.
- **Hora operativa:** siempre `getEventLiveInstantMs` / `getEventLiveInstantIso` de
  `src/services/live/liveEventTime.ts` (aplican `occurredAt` + 206 min de skew del
  sensor). **Nunca** `createdAt`: se amontona con los backlogs de subida y genera
  picos falsos.
- **Ningún número inventado.** Si un dato no está, la UI muestra «sin dato», no un
  cero ni una estimación.
- **`npm run check:arch` tiene que pasar siempre.** Si tu cambio lo rompe, el cambio
  está mal, no la regla.
- **No tocar** `src/services/truckflowTransform/**`, `src/etl-core/**` ni
  `src/features/real-truckflow/**` salvo que la tarea lo diga explícitamente.
- Los archivos nuevos del servidor son `.mjs` (ESM), como el resto de `server/`.

## Tablero

| # | Tarea | Fase | Depende de |
|---|---|---|---|
| T01 | Reconciliar el catálogo en vivo con `eventNormalization` | 0 | — |
| T02 | Recuperar `LiveCameraPlayerModal` de git | 0 | — |
| T03 | Verificar server local y puente DSS | 0 | — |
| T04 | Perfiles de sector (tipo + capacidad + Edge) | 1 | T01 |
| T05 | Reductor de estado (función pura) | 1 | T04 |
| T06 | Test del reductor contra una ventana guardada | 1 | T05 |
| T07 | Baselines por cuarto de día | 1 | T05 |
| T08 | Reglas de estado por tipo de sector | 1 | T05, T07 |
| T09 | Endpoints `/api/live/plant-state` y `/api/live/stream` | 1 | T08 |
| T10 | Smoke de Plant State | 1 | T09 |
| T11 | Cliente y tipos en el front | 2 | T09 |
| T12 | Hook `useLivePlantState` | 2 | T11 |
| T13 | Archivo de zonas del plano | 2 | T01 |
| T14 | Componente `PlantMap` | 2 | T12, T13 |
| T15 | Pantalla `PlantHome` | 2 | T14 |
| T16 | Ruta del Home | 2 | T15 |
| T17 | Endpoints de sector y camiones | 3 | T09 |
| T18 | Panel de sector | 3 | T17 |
| T19 | Tabla de camiones y ficha de journey | 3 | T17 |
| T20 | Endpoint de NVAi | 4 | T09 |
| T21 | Burbuja y panel de NVAi | 4 | T20 |
| T22 | Reagrupar la navegación bajo Estadísticas | 5 | T16 |

---

# FASE 0 — Desbloqueos

## T01 · Reconciliar el catálogo en vivo con `eventNormalization`

**Por qué.** El catálogo en vivo decide qué sectores y cámaras existen para la
pantalla. Hoy está desfasado del mapa de normalización en tres puntos, y uno de
ellos deja invisible justo el sector donde se forma la cola.

**Leer**
- `src/services/live/liveOperationalCatalog.ts`
- `src/services/live/liveOperationalCatalog.test.ts`
- `src/etl-core/domain/eventNormalization.ts` (solo el bloque `RIC_DEVICE_POINT_MAP`)
- `src/data/realSectorCodeMap.ts` (solo el bloque de Ricardone)

**Editar**
- `src/services/live/liveOperationalCatalog.ts`
- `src/services/live/liveOperationalCatalog.test.ts`

**Hacer**

1. Agregar a `RICARDONE_SECTORS` tres entradas nuevas. **Ojo con el `sectorCode`:**
   las cámaras nuevas reportan el sectorCode ya en S-code (así está documentado en
   `realSectorCodeMap.ts`, y las claves del mapa para estos tres son literalmente
   `S6`, `S7`, `S8`, no `RICARDONE_*`).

   ```ts
   { sectorCode: 'S6', label: 'Playa 3', devices: ['RicS6Playa3'] },
   { sectorCode: 'S7', label: 'Despacho silos', devices: ['RicS7DescLinea1', 'RicS7DescLinea2', 'RicS7Carga'] },
   { sectorCode: 'S8', label: 'Carga silo Chief', devices: ['RicS8CargaLinea1', 'RicS8CargaLinea2'] },
   ```

2. Corregir dos desajustes existentes entre el catálogo y `RIC_DEVICE_POINT_MAP`:
   - El catálogo lista `RicEgrCamTrasera`; el mapa de normalización tiene
     `RicEgrCamTraser` (sin la «a» final). **Antes de cambiar nada**, corré el
     diagnóstico del punto 3 y quedate con la grafía que efectivamente aparece en
     los eventos. Corregí el lado que esté mal y dejá un comentario de una línea
     diciendo cuál era el correcto y por qué.
   - El catálogo lista `RicCal06`, que no existe en `RIC_DEVICE_POINT_MAP`. Si el
     diagnóstico no la encuentra en los eventos, sacala del catálogo; si aparece,
     agregala a la normalización y dejá el comentario.

3. Diagnóstico (comando exacto, sobre una ventana ya guardada):

   ```bash
   node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('runs/windows/2026-09-08_2026-09-08/tables/merged_truckflow_movimientos.json','utf8'));const s=new Set();for(const r of (d.rows||d)) if(r.deviceCode) s.add(r.deviceCode);console.log([...s].sort().join('\n'))"
   ```

   Si ese archivo no tiene `deviceCode`, probá con
   `runs/windows/2026-09-08_2026-09-08/tables/calada_camera_events.json` o pedí ayuda.
   **No adivines la grafía.**

4. Agregar al test estas aserciones:
   - `getLiveSectorEntries('ricardone')` incluye una entrada con `sectorCode === 'S6'`.
   - `getExpectedDevicesForLiveSector('S6')` devuelve `['RicS6Playa3']`.
   - `lookupCanonicalSectorByDevice('RicS6Playa3')` devuelve `'S6'`.
   - **Invariante nueva:** todo `deviceCode` del catálogo de Ricardone existe como
     clave en `RIC_DEVICE_POINT_MAP`. Importá el mapa y recorré el catálogo. Este
     test es el que evita que el desfase vuelva.

**Verificar**

```bash
npx vitest run src/services/live/liveOperationalCatalog.test.ts && npm run check:arch
```

**No tocar.** `circuitCatalog.ts`, `sectorCapacityByPlant.ts`, nada de `features/`.

---

## T02 · Recuperar `LiveCameraPlayerModal` de git

**Por qué.** Son 98 líneas que ya funcionan con el puente DSS. No se reescriben.

**Hacer**

```bash
git show 9e0cec9^:src/components/realDiagnostics/LiveCameraPlayerModal.tsx > src/components/plant/LiveCameraPlayerModal.tsx
```

Creá el directorio `src/components/plant/` si no existe. Después abrí el archivo y
arreglá **solo los imports rotos** por el cambio de ruta (las rutas relativas suben
un nivel distinto). No cambies la lógica, no cambies los estilos, no lo «mejores».

**Verificar**

```bash
npx tsc --noEmit -p tsconfig.json
```

Tiene que compilar sin errores nuevos en ese archivo.

---

## T03 · Verificar server local y puente DSS

**Por qué.** Si el server no levanta, las fases 1 a 4 no se pueden probar.

**Hacer**

```bash
npm run server:truckflow
```

En otra terminal:

```bash
npm run smoke:live
curl -s http://127.0.0.1:8787/api/truckflow/health
curl -s http://127.0.0.1:8787/api/truckflow/live-camera/status
```

**Reportar** (no arreglar): si `dssConfigured` es `false`, decilo y seguí — el resto
del plan no depende del video. Si `/health` no responde, pará y reportalo.

---

# FASE 1 — El reductor de estado

> Esta es la única pieza conceptualmente nueva del proyecto. El salto es pasar de
> **contar detecciones** a **saber dónde está cada camión**. Si esta fase no queda
> bien, nada de lo que sigue sirve.

## T04 · Perfiles de sector

**Por qué.** Cada tipo de sector se mide distinto. Comparar una playa con una
balanza por el mismo indicador no significa nada operativamente.

**Leer**
- `src/services/live/liveOperationalCatalog.ts`
- `src/config/sectorCapacityByPlant.ts`
- `src/data/realSectorCodeMap.ts`

**Crear**
- `server/plantState/sectorProfiles.mjs`

**Contrato exacto**

```js
/**
 * @typedef {'gate'|'queue'|'process'|'buffer'|'scale'|'discharge'|'load'|'exit'} SectorType
 */

/** sectorCode → perfil. Solo datos, sin lógica. */
export const SECTOR_PROFILES = {
  RICARDONE_INGRESO_CAMIONES: { type: 'gate',      label: 'Ingreso',          capacity: 28,  edgeId: 'EDGE_INGRESO' },
  RICARDONE_PREINGRESO:       { type: 'queue',     label: 'Preingreso',       capacity: 263, edgeId: 'EDGE_PREINGRESO' },
  RICARDONE_CALADA:           { type: 'process',   label: 'Calada',           capacity: 39,  edgeId: 'EDGE_CALADA' },
  RICARDONE_BALANZA:          { type: 'scale',     label: 'Balanza',          capacity: 14,  edgeId: 'EDGE_BALANZA' },
  S6:                         { type: 'buffer',    label: 'Playa 3',          capacity: 141, edgeId: 'EDGE_PLAYA' },
  RICARDONE_VOLCABLE:         { type: 'discharge', label: 'Volcables',        capacity: 44,  edgeId: 'EDGE_DESCARGA' },
  RICARDONE_CELDA_16:         { type: 'discharge', label: 'Celda 16',         capacity: 44,  edgeId: 'EDGE_DESCARGA' },
  S7:                         { type: 'load',      label: 'Despacho silos',   capacity: 44,  edgeId: 'EDGE_SILOS' },
  S8:                         { type: 'load',      label: 'Carga silo Chief', capacity: 44,  edgeId: 'EDGE_SILOS' },
  RICARDONE_EGRESO_CAMIONES:  { type: 'exit',      label: 'Egreso',           capacity: 39,  edgeId: 'EDGE_EGRESO' },
}

/** @returns {{type: SectorType, label: string, capacity: number|null, edgeId: string}|null} */
export function getSectorProfile(sectorCode) { /* lookup directo, null si no está */ }

/** Qué indicadores tienen sentido para cada tipo. La UI lee esto, no lo decide. */
export const KPI_BY_TYPE = {
  gate:      ['rate60', 'present'],
  queue:     ['present', 'occupancy', 'in60', 'out60', 'dwellP90'],
  process:   ['present', 'rate60', 'dwellAvg', 'dwellP90', 'queueAhead'],
  buffer:    ['present', 'occupancy', 'in60', 'out60', 'delta40', 'dwellP90'],
  scale:     ['present', 'rate60', 'waitAvg', 'dwellAvg'],
  discharge: ['present', 'rate60', 'waitAvg', 'accumulationUpstream'],
  load:      ['present', 'rate60', 'dwellAvg'],
  exit:      ['rate60', 'queueAhead', 'balance60'],
}
```

Las capacidades salen tal cual de `SECTOR_CAPACITY_RICARDONE` mapeando el S-code
del sector. Si un sector no tiene capacidad conocida, poné `null` — **no inventes
un número**.

**Verificar**

```bash
node -e "import('./server/plantState/sectorProfiles.mjs').then(m=>{const c=Object.keys(m.SECTOR_PROFILES).length;if(c!==10)throw new Error('esperaba 10 perfiles, hay '+c);console.log('ok',c)})"
```

---

## T05 · Reductor de estado (función pura)

**Por qué.** Es el corazón. Función pura: entra un array de eventos y un instante,
sale un snapshot. Sin red, sin disco, sin `Date.now()` adentro — así se puede testear
contra el pasado.

**Leer**
- `src/etl-core/domain/journeyEvents.types.ts` (el tipo `RealJourneyEventDto`)
- `src/services/live/liveEventTime.ts`
- `server/plantState/sectorProfiles.mjs`

**Crear**
- `server/plantState/reducer.mjs`

**Contrato exacto**

```js
/**
 * @param {RealJourneyEventDto[]} events  eventos crudos del feed, cualquier orden
 * @param {number} nowMs                  instante de corte (epoch ms)
 * @param {{site: string}} options
 * @returns {PlantSnapshot}
 */
export function reducePlantState(events, nowMs, options) { }
```

**Algoritmo, paso por paso**

1. **Normalizar el instante.** Para cada evento, `t = getEventLiveInstantMs(evento)`.
   Descartar los que den `NaN` y los que tengan `t > nowMs` (llegaron tarde pero son
   del futuro respecto del corte).
2. **Agrupar en journeys.** Clave: `journeyUid`. Si viene vacío o nulo —pasa desde el
   27-08, es un bug conocido del export— usar como clave `normalizedPlate` + el índice
   de la ventana de 12 h en que cae el evento. Nunca descartar el evento por eso.
3. **Ordenar cada journey** por `t` ascendente.
4. **Resolver el sector de cada evento** con
   `resolveCanonicalSectorForLiveFeed(sectorCode, deviceCode)` del catálogo. Si no
   resuelve a un sector con perfil, ignorar ese evento para presencia (pero contarlo
   para salud de Edge).
5. **Journeys abiertos.** Un journey está abierto si:
   - su último evento **no** cae en un sector de tipo `exit`, **y**
   - `nowMs - tÚltimo < 180 * 60000` (3 h de inactividad máxima).
   Los demás están cerrados y no cuentan para presencia.
6. **Presencia.** `present[sector]` = cantidad de journeys abiertos cuyo último evento
   cae en ese sector.
7. **Transiciones.** Recorriendo cada journey en orden, cada par de eventos
   consecutivos con sector distinto es una transición `A → B` con instante `t(B)`.
   - `in60[B]` = transiciones hacia B con `t > nowMs - 3600000`.
   - `out60[A]` = transiciones desde A en la misma ventana.
   - Para el primer evento de un journey, la transición es `null → sector` (cuenta
     como `in60` del sector de ingreso).
8. **Permanencia.** Para cada journey abierto, `dwell = nowMs - t(evento que lo puso en
   el sector actual)`. Del array de dwells por sector salen `dwellAvgMin` y
   `dwellP90Min` (percentil 90 por interpolación lineal; si hay menos de 3 muestras,
   `dwellP90Min = null`).
9. **Ritmo.** `rate60[sector]` = `out60[sector]` — cuántos salieron en la última hora.
   Es la medida de throughput; no uses el conteo de detecciones.
10. **Estadía en planta.** Para cada journey abierto, `nowMs - t(primer evento)`.
    Agregado: `dwellAvgMin` y `dwellP90Min` de planta.
11. **Delta 40 min.** **No guardes serie.** Llamá recursivamente a `reducePlantState`
    con `nowMs - 40*60000` sobre los mismos eventos y restá las presencias:
    `delta40[s] = present[s] - presentAntes[s]`. Para evitar recursión infinita, la
    llamada interna usa `options.skipDelta = true`.
12. **Salud de Edge.** Por cada `edgeId`, agrupando las cámaras esperadas del catálogo:
    - `camerasExpected` = cuántas cámaras tiene el Edge en el catálogo.
    - `camerasOk` = cuántas tuvieron al menos un evento en los últimos 60 min.
    - `lastEventAgeS` = `(nowMs - t del último evento de cualquier cámara del Edge) / 1000`.
    - `ocrQuality` = `1 - (alertas LPR_MALFUNCTION / eventos)` en la última hora, o
      `null` si hay menos de 10 eventos.
    - `status`: `'online'` si `camerasOk === camerasExpected`; `'degraded'` si
      `0 < camerasOk < camerasExpected`; `'offline'` si `camerasOk === 0`.

**Forma del snapshot** (exactamente esta; el front la espeja en T11):

```js
{
  site: 'ricardone',
  at: '2026-09-14T14:32:07-03:00',
  plant: {
    trucksInPlant: 137,
    inflow60: 61, outflow60: 48, balance60: 13,
    dwellAvgMin: 134, dwellP90Min: 242
  },
  sectors: [{
    sectorCode: 'S6', label: 'Playa 3', type: 'buffer',
    present: 42, capacity: 141,
    in60: 38, out60: 14, rate60: 14, delta40: 19,
    dwellAvgMin: 41, dwellP90Min: 78,
    status: 'critical',            // lo pone T08, acá dejalo en 'normal'
    edgeId: 'EDGE_PLAYA'
  }],
  edges: [{
    id: 'EDGE_CALADA', label: 'Edge Calada', status: 'degraded',
    camerasOk: 6, camerasExpected: 7, lastEventAgeS: 2460,
    detections60: 61, ocrQuality: 0.95
  }],
  trucksOpen: 137,
  generatedInMs: 42
}
```

**Verificar**

```bash
node -e "import('./server/plantState/reducer.mjs').then(m=>{const r=m.reducePlantState([],Date.now(),{site:'ricardone'});if(r.plant.trucksInPlant!==0)throw new Error('con 0 eventos tiene que dar 0');console.log('ok')})"
```

**No tocar.** Nada del front. Este archivo no importa nada de `src/components` ni
de `src/features`.

---

## T06 · Test del reductor contra una ventana guardada

**Por qué.** Este es el gate de la fase. Si el reductor no reproduce el pasado, no
se sigue con las pantallas.

**Leer**
- `server/plantState/reducer.mjs`
- `runs/windows/2026-09-08_2026-09-08/manifest.json`
- Listar `runs/windows/2026-09-08_2026-09-08/tables/` y elegir el archivo que tenga
  los eventos crudos con `deviceCode`, `sectorCode` y `occurredAt`.

**Crear**
- `server/plantState/reducer.test.mjs`

**Hacer**

1. Cargar los eventos de esa ventana.
2. Correr `reducePlantState(events, corteDe14_32Del08_09, { site: 'ricardone' })`.
3. Aserciones:
   - `plant.trucksInPlant` es un entero `>= 0` y `<= 400`.
   - La suma de `sectors[].present` es **exactamente igual** a `plant.trucksInPlant`.
   - Ningún `present` supera su `capacity` en más del 20 % (si lo supera, o la
     capacidad está mal o el reductor está contando de más: reportalo, no ajustes el
     umbral).
   - `inflow60 - outflow60 === balance60`.
   - Correr con `nowMs` de las 03:00 (madrugada) da menos camiones que a las 14:32.
4. Dejar en el test un comentario con los números que dio, para tener referencia.

**Verificar**

```bash
npx vitest run server/plantState/reducer.test.mjs
```

**Si alguna aserción falla, pará y reportá.** No relajes el test.

---

## T07 · Baselines por cuarto de día

**Por qué.** «Habitual» no es un promedio global. Un R5 de madrugada no se compara
contra uno de la tarde. Los cuartos ya están definidos en el proyecto: Q1 22–04,
Q2 04–10, Q3 10–16, Q4 16–22.

**Leer**
- `server/plantState/reducer.mjs`
- `server/plantState/sectorProfiles.mjs`
- Listar `runs/windows/` para ver qué ventanas hay.

**Crear**
- `server/plantState/baselines.mjs`

**Contrato**

```js
/**
 * @returns {Promise<{[sectorCode: string]: {[quarter: string]: {rate60: number, dwellP90Min: number, samples: number}}}>}
 */
export async function buildBaselines({ site = 'ricardone', days = 14 } = {}) { }

/** Q1 22–04 · Q2 04–10 · Q3 10–16 · Q4 16–22 */
export function quarterOf(dateIso) { }
```

**Reglas**

- Recorrer las ventanas de `runs/windows/` de los últimos `days` días.
- Para cada día y cada cuarto, correr el reductor en 6 cortes (uno por hora del
  cuarto) y quedarse con la mediana de `rate60` y de `dwellP90Min` por sector.
- **Si un sector tiene menos de 5 muestras en un cuarto, no se emite baseline para
  ese par.** La UI mostrará «sin referencia». Un habitual flojo es peor que ninguno.
- Cachear el resultado en `runs/_cache/baselines-<site>.json` y recalcular solo si
  el archivo tiene más de 24 h.

**Verificar**

```bash
node -e "import('./server/plantState/baselines.mjs').then(async m=>{const b=await m.buildBaselines({days:14});const n=Object.keys(b).length;console.log('sectores con baseline:',n);if(n===0)throw new Error('sin baselines')})"
```

---

## T08 · Reglas de estado por tipo de sector

**Leer**
- `server/plantState/sectorProfiles.mjs`
- `server/plantState/baselines.mjs`

**Crear**
- `server/plantState/status.mjs`

**Contrato**

```js
/**
 * @returns {'normal'|'attention'|'critical'|'no_data'}
 */
export function resolveSectorStatus(sector, baseline, edge) { }
```

**Reglas, en este orden exacto** (la primera que se cumple gana):

1. `no_data` — el Edge del sector tiene `status === 'offline'`, o su
   `lastEventAgeS > 900` (15 min).
2. Por tipo:
   - **buffer / queue:** `critical` si `delta40 >= 15` **o** (hay baseline y
     `dwellP90Min > 2 * baseline.dwellP90Min`). `attention` si `delta40 >= 8` **o**
     `dwellP90Min > 1.5 * baseline.dwellP90Min`.
   - **process / scale / discharge / load:** `critical` si (hay baseline y
     `rate60 < 0.7 * baseline.rate60`) **o** (hay capacidad y `present >= capacity`).
     `attention` si `rate60 < 0.85 * baseline.rate60` **o**
     `present >= 0.85 * capacity`.
   - **gate / exit:** nunca `critical` por sí solos. `attention` si hay baseline y
     `rate60 < 0.7 * baseline.rate60`.
3. Si no hay baseline suficiente, **solo se evalúa capacidad**. Sin baseline y sin
   capacidad, el estado es `normal`.
4. En cualquier otro caso, `normal`.

**Verificar.** Escribí `server/plantState/status.test.mjs` con un caso por rama
(al menos 8 casos) y corré:

```bash
npx vitest run server/plantState/status.test.mjs
```

---

## T09 · Endpoints `/api/live/plant-state` y `/api/live/stream`

**Leer**
- `server/truckflow-local-server.mjs` (solo las líneas 150–230, para copiar el estilo
  de registro de rutas y de manejo de errores)
- `server/dss-live.mjs` (solo para ver cómo se tipan los errores)
- `src/services/live/liveApiChunkFetch.ts`
- Los cuatro archivos de `server/plantState/`

**Crear**
- `server/plantState/service.mjs` — mantiene el buffer de eventos y arma el snapshot.

**Editar**
- `server/truckflow-local-server.mjs` — solo para registrar dos rutas.

**Hacer**

1. `service.mjs` mantiene en memoria un buffer con los eventos de las últimas **6
   horas** (suficiente para estadías largas y para el delta de 40 min).
2. Refresco incremental cada 10 s: pedir solo lo nuevo desde el último `occurredAt`.
3. **Reconciliación cada 5 min:** refetch completo de la última hora y reemplazo de
   ese tramo del buffer. El estado incremental nunca es la única fuente.
4. `GET /api/truckflow/live/plant-state?site=ricardone` → el snapshot, con `status`
   ya resuelto por T08.
5. `GET /api/truckflow/live/stream?site=ricardone` → SSE, un `data:` con el snapshot
   completo cada 10 s. Heartbeat `: ping` cada 20 s para que no lo corten los proxies.
6. Errores tipados como los del DSS: `{ error: 'feed_unreachable' }` con 502,
   `{ error: 'site_unknown' }` con 400.

**Verificar**

```bash
npm run server:truckflow
# en otra terminal
curl -s "http://127.0.0.1:8787/api/truckflow/live/plant-state?site=ricardone" | head -c 600
curl -N -s "http://127.0.0.1:8787/api/truckflow/live/stream?site=ricardone" | head -c 400
```

El primero tiene que devolver JSON con `plant.trucksInPlant`. El segundo tiene que
emitir al menos un evento en menos de 15 s.

---

## T10 · Smoke de Plant State

**Leer**
- `scripts/smoke-live-camera.mjs` (copiá la estructura, es el patrón del repo)

**Crear**
- `scripts/smoke-plant-state.mjs`

**Editar**
- `package.json` — agregar `"smoke:plant": "node scripts/smoke-plant-state.mjs"`.
  **Solo esa línea en `scripts`.** No toques dependencias.

**Hacer.** El smoke valida la *forma*, no los valores: que el snapshot tenga `plant`,
`sectors`, `edges`; que cada sector tenga `sectorCode`, `present`, `status`; que la
suma de presencias sea igual a `trucksInPlant`. Tiene que pasar aunque la planta
esté vacía.

**Verificar**

```bash
npm run smoke:plant
```

---

# FASE 2 — Home y plano

## T11 · Cliente y tipos en el front

**Leer**
- `src/services/live/liveCameraStreamApi.ts` (el patrón de cliente del repo)
- `src/features/real-truckflow/api/truckflowLocalFetch.ts`
- El contrato del snapshot en T05

**Crear**
- `src/services/live/plantStateApi.ts`

**Hacer.** Tipos TypeScript que espejen **exactamente** el snapshot de T05
(`PlantSnapshot`, `SectorState`, `EdgeState`), más `getPlantState(site)` y
`openPlantStateStream(site, onSnapshot)` con `EventSource`. Nada de lógica de
negocio acá: solo fetch y tipos.

**Verificar**

```bash
npx tsc --noEmit -p tsconfig.json && npm run check:arch
```

---

## T12 · Hook `useLivePlantState`

**Crear**
- `src/hooks/useLivePlantState.ts`

**Contrato**

```ts
export function useLivePlantState(site: string): {
  snapshot: PlantSnapshot | null
  status: 'connecting' | 'live' | 'stale' | 'error'
  lastUpdateMs: number | null
}
```

**Reglas**

- Carga inicial con `getPlantState`, después SSE.
- Si el stream se corta, **mantener en pantalla el último snapshot válido** y pasar
  `status` a `'stale'`. Nunca dejar la pantalla en blanco.
- Reconexión con backoff: 1 s, 2 s, 5 s, 10 s, después cada 30 s.
- `'stale'` también si pasaron más de 60 s sin snapshot nuevo.

**Verificar**

```bash
npx tsc --noEmit -p tsconfig.json
```

---

## T13 · Archivo de zonas del plano

**Por qué.** Es lo que convierte el dibujo en interfaz: cada zona sabe qué sector es.

**Crear**
- `public/plant/ricardone/plantZones.json`
- `src/data/plantZones.types.ts`

**Contrato**

```ts
export type PlantZone = {
  id: string              // S-code corto, para la UI
  sectorCode: string      // el mismo del catálogo, sin excepción
  label: string
  x: number; y: number; w: number; h: number   // px del viewBox
  labelAnchor?: [number, number]
  cameras: string[]
}
export type PlantLayout = {
  rev: string             // fecha de revisión, se muestra en el mapa
  viewBox: [number, number, number, number]
  metersPerUnit: number
  zones: PlantZone[]
  baseImage?: string      // 'plant-base.svg' cuando exista; ausente = lienzo vacío
}
```

**Hacer.** Cargar las diez zonas con las coordenadas del artboard «Home» del canvas
de diseño. `viewBox` = `[0, 0, 1060, 490]`, `metersPerUnit` = `0.5`, `rev` = la fecha
de hoy, **sin** `baseImage` (todavía no existe el plano del IFC). Los `sectorCode`
salen de `SECTOR_PROFILES` de T04 — tienen que coincidir uno a uno.

**Verificar**

```bash
node -e "const z=require('./public/plant/ricardone/plantZones.json');const p=require('fs').readFileSync('server/plantState/sectorProfiles.mjs','utf8');for(const q of z.zones){if(!p.includes(q.sectorCode))throw new Error('zona sin perfil: '+q.sectorCode)}console.log('ok',z.zones.length,'zonas')"
```

---

## T14 · Componente `PlantMap`

**Leer**
- `src/data/plantZones.types.ts`
- `src/services/live/plantStateApi.ts`

**Crear**
- `src/components/plant/PlantMap.tsx`

**Contrato**

```tsx
export function PlantMap(props: {
  layout: PlantLayout
  sectors: SectorState[]
  onSelectSector: (sectorCode: string) => void
  selected?: string | null
}): JSX.Element
```

**Reglas**

- Panel oscuro (`#0B1220`), es el único elemento oscuro de la app.
- Si `layout.baseImage` existe, se dibuja de fondo; si no, grilla de 20 px.
- Una zona por entrada de `layout.zones`, coloreada por el `status` del sector
  correspondiente: `normal` gris, `attention` `#FBBF24`, `critical` `#F87171`,
  `no_data` borde punteado gris.
- Cada zona es un `<button>` con `aria-label="{label}, {present} camiones, {status}"`,
  navegable con tabulador.
- **No dibujar camiones.** Truckflow sabe el sector, no la coordenada.
- Si un sector del snapshot no tiene zona en el layout, **no romper**: ignorarlo y
  loguear un `console.warn` una sola vez.

**Verificar**

```bash
npx tsc --noEmit -p tsconfig.json && npm run check:arch
```

---

## T15 · Pantalla `PlantHome`

**Crear**
- `src/pages/PlantHome.tsx`

**Hacer.** Reproducir el artboard «Home» del canvas de diseño, de arriba a abajo:
barra, título con las cuatro cifras, mapa + panel de NVAi (en esta tarea el panel va
vacío con un texto «NVAi — próximamente»; se llena en T21), fila de chips de sectores,
y la fila inferior con actividad de hoy, últimas detecciones y cámara en vivo.

**Todos los números salen del snapshot.** Ninguno hardcodeado. Si `snapshot` es
`null`, mostrar esqueletos, no ceros. Si `status === 'stale'`, mostrar un aviso
discreto con la antigüedad del dato.

**Verificar**

```bash
npm run dev
```

Abrir el navegador y confirmar que la pantalla carga y que los números cambian
cuando llega un snapshot nuevo.

---

## T16 · Ruta del Home

**Leer**
- `src/App.tsx`
- `src/app/sectors.ts`

**Editar**
- `src/App.tsx` — `<Route index element={<PlantHome />} />` en lugar del redirect a
  `/inicio`; agregar `<Route path="en-vivo" element={<PlantHome />} />`.

**No borres `InicioTab` todavía.** Se retira en T22, cuando la navegación esté
reagrupada.

**Verificar**

```bash
npm run build
```

---

# FASE 3 — Sector y camión

## T17 · Endpoints de sector y camiones

**Crear**
- `server/plantState/queries.mjs`

**Editar**
- `server/truckflow-local-server.mjs` — tres rutas más.

**Contrato**

- `GET /api/truckflow/live/sectors/:sectorCode` → el `SectorState` más: serie de
  presencia de las últimas 3 h (un punto cada 10 min), lista de cámaras del Edge con
  su salud, y el baseline del cuarto de día actual.
- `GET /api/truckflow/live/trucks?sector=&order=dwell|plate` → `{ plate, circuit,
  sectorCode, dwellSectorMin, dwellPlantMin, nextExpectedPoint, status }`.
- `GET /api/truckflow/live/trucks/:plate` → journey abierto completo: timeline de
  eventos con sector y cámara, próximo punto esperado según la plantilla del circuito,
  minutos desde la última detección y tope del tramo.

El circuito y el próximo punto salen de `src/etl-core/domain/circuitCatalog.ts` por
**prefijo** de la secuencia recorrida, y se marcan como `provisional: true`. La
clasificación definitiva la sigue haciendo el Transform.

**Verificar**

```bash
curl -s "http://127.0.0.1:8787/api/truckflow/live/sectors/S6" | head -c 400
curl -s "http://127.0.0.1:8787/api/truckflow/live/trucks?sector=S6&order=dwell" | head -c 400
```

---

## T18 · Panel de sector

**Crear**
- `src/components/plant/SectorPanel.tsx`
- `src/components/plant/sectorKpiProfile.ts` (espejo de `KPI_BY_TYPE` de T04)

**Regla central.** El panel **no** muestra los mismos seis indicadores para todos:
lee el `type` del sector y renderiza solo los de `KPI_BY_TYPE`. Referencia visual: el
artboard «Al clickear una zona — Playa 3».

---

## T19 · Tabla de camiones y ficha de journey

**Crear**
- `src/components/plant/TrucksTable.tsx`
- `src/components/plant/TruckJourneyPanel.tsx`

**Hacer.** La ficha muestra el timeline, el próximo punto esperado, el tiempo desde
la última detección y —si hay— la anomalía abierta con la regla que la disparó. El
botón «Ver en vivo» abre el `LiveCameraPlayerModal` recuperado en T02 con la cámara
de la última lectura.

**El tiempo de cada fila del timeline es el del tramo anterior.** Aclaralo en el
encabezado del panel.

---

# FASE 4 — NVAi

## T20 · Endpoint de NVAi

**Leer**
- `server/truckflow-local-server.mjs`, la ruta `/api/etl/agent/chat`
- `src/features/real-truckflow/api/etlAgentApi.ts`

**Crear**
- `server/plantState/nvai.mjs`

**Hacer.** `POST /api/truckflow/live/nvai/ask` recibe `{ question, site, focus }`,
arma el prompt con el **snapshot actual serializado** más el foco (sector o patente),
y delega en el agente que ya existe. No es un modelo nuevo: es un envoltorio.

**Regla dura:** el prompt le dice al agente que **no calcule ningún número** y que
cada hecho que cite lleve la clave de dónde salió (`plant-state`, `sectors/S6`,
`baseline`). Si el dato no está en el snapshot, la respuesta es que no se sabe.

---

## T21 · Burbuja y panel de NVAi

**Crear**
- `src/components/nvai/NvaiBubble.tsx`
- `src/components/nvai/NvaiPanel.tsx`

**Hacer.** Burbuja de 56 px abajo a la derecha, en todas las pantallas. Al abrir,
panel de 400 px pegado al borde derecho; la pantalla de atrás **no se oscurece ni se
tapa**. Reusar `streamEtlAgentChat` y `AgentInsightPanel`, que ya están escritos.
Cada respuesta muestra los hechos con su fuente al costado.

Referencia visual: el artboard «Bridge — burbuja de consultas» del canvas anterior.

---

# FASE 5 — Estadísticas

## T22 · Reagrupar la navegación

**Leer**
- `src/app/sectors.ts`
- `src/app/AppShell.tsx`
- `src/App.tsx`

**Editar**
- Esos tres archivos, y nada más.

**Hacer.** Las doce pantallas actuales pasan a colgar de **Estadísticas**, agrupadas
en Indicadores (KPI tiempos, Calada, Descargas, Anomalías), Reportes (Calibración,
Líquidos S10, Transile interno, Transile externo, Base de datos) y Datos y proceso
(Extracción, Análisis local, Transform ETL). **Ninguna pantalla se toca por dentro.**

Dejar redirecciones de las rutas viejas a las nuevas para no romper links guardados.
Recién acá se retira `InicioTab`.

**Verificar**

```bash
npm run build && npm run test
```

Abrir cada ruta vieja y confirmar que redirige.

---

## Qué no hacer, en ninguna tarea

- **No revivir `LiveCameraMonitor`.** Responde «qué vio esta cámara», no «cómo está
  la planta». Las funciones que llamaba sí se reusan; la estructura no.
- **No dibujar camiones en el mapa.** Truckflow sabe el sector, no la coordenada.
  Lo vivo es la densidad por zona.
- **No dejar que NVAi calcule.** Si el número lo produce el modelo, deja de ser
  auditable y dos preguntas seguidas pueden dar dos respuestas.
- **No meter el visor 3D en el bundle del Home.** Ruta aparte, carga diferida.
- **No relajar un test que falla.** Si el gate de T06 no pasa, el problema está en el
  reductor.
- **No agregar dependencias.** Todo se hace con lo que ya está en `package.json`.

---

# FASE 6 — Corrección del modelo: zonas en vez de puntos ✅ EJECUTADA (14-09)

> **Esta fase corrige código que ya está escrito.** El reductor atribuye la
> presencia al sector de la última cámara (`present[last.sector]++`). Eso está mal:
> un camión que pasó preingreso no está «en preingreso» —que es una barrera de dos
> carriles— está en **Playa 1**, y va a estar ahí hasta que pase por calada.
>
> Lo que se acumula son los **espacios entre puntos**, no los puntos. Ese es el
> backlog, y es lo único que un operador puede leer y usar.
>
> Fuente de capacidades: `traspaso_modelo_capacidades_circuitos.md`.
> Diseño de referencia: artboard «El camión no está en la cámara».

## T23 · Reemplazar `sectorProfiles.mjs` por `plantGraph.mjs`

**Leer**
- `server/plantState/sectorProfiles.mjs`
- `src/config/sectorCapacityByPlant.ts`

**Crear** `server/plantState/plantGraph.mjs` · **Borrar** `sectorProfiles.mjs` al final.

**Contrato**

```js
/** Puntos: donde se procesa. La tasa es la que drena la zona que llega al punto. */
export const POINTS = {
  INGRESO:   { sectorCode: 'RICARDONE_INGRESO_CAMIONES', label: 'Ingreso',    ratePerHour: null },
  PREINGRESO:{ sectorCode: 'RICARDONE_PREINGRESO',       label: 'Preingreso', ratePerHour: null },
  CALADA:    { sectorCode: 'RICARDONE_CALADA',           label: 'Calada',     ratePerHour: 60,
               note: '2 de 3 caladores a 30/h; con 3 son 90/h; -20 min por cambio de turno' },
  BALANZA:   { sectorCode: 'RICARDONE_BALANZA',          label: 'Balanza',    ratePerHour: 38,
               note: '1,5 min por pesaje — misma tasa que San Lorenzo (confirmado 14-09)' },
  VOLCABLES: { sectorCode: 'RICARDONE_VOLCABLE',         label: 'Volcables',  ratePerHour: 4.5,
               note: 'entre los dos, no cada uno' },
  CELDA16_R: { sectorCode: 'RICARDONE_CELDA_16',         label: 'Celda 16 recepcion', ratePerHour: 11,
               exclusiveWith: 'CELDA16_C', stockMaxT: 100000 },
  CELDA16_C: { sectorCode: 'RICARDONE_CELDA_16',         label: 'Celda 16 carga',     ratePerHour: 5,
               exclusiveWith: 'CELDA16_R' },
  SILOS_R:   { sectorCode: 'S7',                         label: 'Silos recepcion',    ratePerHour: 9,
               note: 'Keppler 4-5/h + Chief 4-5/h', exclusiveWith: 'SILOS_C' },
  SILOS_C:   { sectorCode: 'S8',                         label: 'Carga desde silos',  ratePerHour: 13.5,
               note: '3 puntos a 4-5/h', exclusiveWith: 'SILOS_R' },
  EGRESO:    { sectorCode: 'RICARDONE_EGRESO_CAMIONES',  label: 'Egreso',     ratePerHour: 120,
               note: '~30 s por camion' },
}

/** Zonas: donde se espera. `to` puede ser una lista (drenan varios puntos a la vez). */
export const ZONES = [
  { id: 'Z0', label: 'Acceso',               from: null,         to: ['INGRESO'],    capacityPhysical: 28,   capacityOperational: 28 },
  { id: 'Z1', label: 'Ingreso a Preingreso', from: 'INGRESO',    to: ['PREINGRESO'], capacityPhysical: null, capacityOperational: null },
  { id: 'Z2', label: 'Playa 1',              from: 'PREINGRESO', to: ['CALADA'],     capacityPhysical: 263,  capacityOperational: 450,
    pending: 'definir si Playa 1 son los 263 de densidad o parte de los 450 del estudio' },
  { id: 'Z3', label: 'Calada a Balanza',     from: 'CALADA',     to: ['BALANZA'],    capacityPhysical: 39,   capacityOperational: 39 },
  { id: 'Z4', label: 'Calada a Egreso',      from: 'CALADA',     to: ['EGRESO'],     capacityPhysical: 39,   capacityOperational: 39 },
  { id: 'Z5', label: 'Playa 3',              from: 'BALANZA',    to: ['VOLCABLES', 'CELDA16_R', 'SILOS_R'],
    capacityPhysical: 141, capacityOperational: 30 },
  { id: 'Z6', label: 'Descarga a Balanza',   from: '*DESCARGA',  to: ['BALANZA'],    capacityPhysical: null, capacityOperational: null },
  { id: 'Z7', label: 'Balanza a Egreso',     from: 'BALANZA',    to: ['EGRESO'],     capacityPhysical: null, capacityOperational: null },
]
```

**Dos capacidades, no una.** `capacityPhysical` es cuántos entran (densidad,
geometría). `capacityOperational` es cuántos puede haber sin romper la operación.
**El estado se evalúa contra la operativa.** Playa 3 es el caso claro: entran 141,
pero el estudio dice 30 y que «nunca debe llenarse porque bloquea circulación».
Guardá las dos y no promedies.

**No inventes ninguna tasa.** `ratePerHour: null` significa sin relevar, y la UI
muestra «sin referencia». La balanza de Ricardone es el caso: bloquea el tiempo
estimado de Z3, Z6 y Z7 hasta que alguien releve el dato.

**Verificar**

```bash
node -e "import('./server/plantState/plantGraph.mjs').then(m=>{if(m.ZONES.length!==8)throw new Error('faltan zonas');const z=m.ZONES.find(x=>x.id==='Z5');if(z.capacityOperational!==30)throw new Error('Playa 3 operativa tiene que ser 30');console.log('ok')})"
```

---

## T24 · Presencia por zona en el reductor

**Leer** `server/plantState/reducer.mjs` · `server/plantState/circuitPrefix.mjs` · `plantGraph.mjs`

**Editar** `server/plantState/reducer.mjs`

**Hacer**

1. Reemplazar `present[last.sector]++` por la asignación de zona:

   ```js
   const fromPoint = pointOf(last.sector)         // punto de la última lectura
   const nextPoint = expectedNextPoint(journey)   // de circuitPrefix.mjs
   const zone = resolveZone(fromPoint, nextPoint) // de plantGraph
   backlog[zone.id]++
   ```

2. **La bifurcación después de calada.** Si `fromPoint === 'CALADA'`, la zona es Z3 o
   Z4 según si el circuito del journey pesa en Ricardone. Sale de la plantilla de
   `circuitCatalog`. **R7 no pesa en Ricardone** → Z4.

3. **Si el circuito no se puede determinar todavía**, la zona es `Z3U`
   («Calada a destino indeterminado»). Se emite como una zona más, visible.
   **No la repartas** entre Z3 y Z4 ni la escondas: si crece, es señal de cobertura
   floja y hay que poder verlo.

4. Cada zona del snapshot lleva: `backlog`, `in60`, `out60`, `dwellAvgMin`,
   `dwellP90Min`, `capacityPhysical`, `capacityOperational`, `drainPoints`.

5. `plant.trucksInPlant` = suma de los backlogs de todas las zonas.

**Verificar**

```bash
npx vitest run server/plantState/reducer.test.mjs
```

Agregá al test: la suma de `zones[].backlog` es **exactamente** `plant.trucksInPlant`,
y con datos reales `Z2` (Playa 1) es la zona con más backlog en horario de recepción.

---

## T25 · Tasa efectiva y tiempo de drenaje

**Crear** `server/plantState/drain.mjs`

**Contrato**

```js
/** Suma las tasas de los puntos que están recibiendo AHORA. */
export function effectiveDrainRate(zone, pointActivity) { }

/** backlog / tasa efectiva, en minutos. null si no hay tasa. */
export function drainMinutes(zone, backlog, pointActivity) { }
```

**Reglas**

- Un punto está activo si tuvo al menos un evento en sus cámaras en los últimos
  **20 min**. Si no, aporta 0 a la tasa efectiva.
- **Exclusiones del estudio:** Celda 16 no puede recibir y cargar a la vez, y los
  silos tampoco. Si se detectó actividad de carga en los últimos 20 min, la tasa de
  recepción de ese punto es 0. Esto importa: Playa 3 drena a 24/h con todo activo y a
  13/h si Celda 16 está cargando — el mismo backlog pasa de 1 h 25 a 2 h 37 sin que
  entre un camión más.
- Si **ningún** punto de destino tiene tasa relevada, `drainMinutes` es `null` y la
  UI muestra «sin referencia». Nunca un cero.

**Verificar.** Test con tres casos: todos los puntos activos, Celda 16 cargando, y
ningún punto con tasa.

---

## T26 · Reglas de estado por zona

**Editar** `server/plantState/status.mjs`

Reemplazar las reglas por tipo de sector por estas, en este orden:

1. `no_data` — el punto que drena la zona no reporta hace más de 15 min.
2. `critical` — `backlog > capacityOperational`, **o** `drainMinutes > 2 ×` el
   habitual de ese cuarto de día.
3. `attention` — `backlog > 0.85 × capacityOperational`, **o**
   `drainMinutes > 1.5 ×` el habitual.
4. Sin capacidad operativa y sin baseline → `normal`.

**El cuello de botella de la planta** es la zona con mayor `drainMinutes`, no la de
mayor backlog. Emitilo en `plant.bottleneck` como `{ zoneId, label, drainMinutes }`.

---

## T27 · Zonas del plano como arcos

**Editar** `public/plant/ricardone/plantZones.json` y `src/components/plant/PlantMap.tsx`

Cada entrada pasa de `sectorCode` a `zoneId` + `from` + `to`. Las coordenadas salen
del artboard «Home» del canvas de diseño. El click abre el detalle de la **zona**.

En el mapa, cada zona muestra: nombre, backlog, y `→ drena por <punto> · <tasa> ·
<tiempo>`. Los puntos (cámaras) son marcadores chicos en los bordes, no cajas.

---

## T28 · Home con drenaje y cuello de botella

**Editar** `src/pages/PlantHome.tsx`

1. Quinta tarjeta de KPI: **cuello de botella**, con la zona y su tiempo de drenaje.
2. La fila de chips de sectores pasa a ser la tabla **Backlog por zona**: zona,
   esperando, drena por, tasa declarada, tiempo estimado, espacio, estado.
3. Las zonas sin tasa relevada muestran «sin relevar» en ámbar, y al pie de la tabla
   se listan cuáles faltan. **Es información, no un hueco.**

**Verificar**

```bash
npm run build && npm run test
```

---

## Pendientes que hay que preguntar, no resolver

- **Playa 1: 263 o 450.** El estudio informa 450 entre las dos playas de Ricardone;
  la tabla de densidad da 263 para el corredor preingreso→calada.
- **Capacidad de Z1, Z6 y Z7** — sin relevar.
- **Paradas de silos:** el estudio dice 1 h diaria + 8 h semanales, pero no está
  confirmado si frenan todo el sistema o solo el punto intervenido.
- **El número que limita R7.** El traspaso dice explícitamente que ese dato se
  informó y que no se puede recuperar de la transcripción. No lo reemplaces por
  600/día, 4.200/semana ni ninguna cifra derivada: preguntalo.
