# FASE 4 — Corridas headless por API + persistencia por runId

> Objetivo: el ETL corre en Node por endpoint, y cada corrida queda persistida y
> consultable. Esto es EL prerequisito de los agentes (Fase 5): sus tools leen de acá.
> Base existente: `server/truckflow-local-server.mjs` (Express) y el CLI
> `scripts/contract-first-cli-runner.ts` (ya ejecuta lógica TS vía `npx tsx`).

## Layout de persistencia (disco primero, Supabase después)

```
runs/
  <runId>/                  ← runId = <YYYYMMDD-HHmmss>-<hash6>
    manifest.json           ← input (rango, archivos), timestamps, rulesVersion, estado
    stats.json              ← EtlTransformOutput.stats completo
    logs.txt
    tables/
      <clave>.json          ← filas tipadas (de tables si existe; si no, parseado del csv)
      <clave>.csv           ← el CSV exacto (compatibilidad Power BI)
```

`runs/` se agrega a `.gitignore`.

---

## Paso 4.1 — Runner headless que persiste

1. Creá `scripts/run-etl-headless.ts` (TS, se ejecuta con `npx tsx`):
   - Args: `--events <ruta.json>` (uno o más), `--excel <ruta.xlsx>` (opcional),
     `--out runs/` (default).
   - Carga eventos (mismo parseo que usa `scripts/find-sl-exit-ric-return.mjs`:
     `parsePayloadToJourneyEvents` de `src/services/realJourneyEventsDataSource.ts`),
     llama a `runEtlTransform(...)` de
     `src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts`
     con los mismos parámetros que el golden test (`mergeWindowHours: 4`, etc., más
     los archivos Excel si vienen), y escribe el layout de arriba.
   - Imprime el `runId` por stdout como última línea.
2. Probalo con el fixture:
   `npx tsx scripts/run-etl-headless.ts --events tests/fixtures/etl/s-events-slice.json`
   → debe crear `runs/<runId>/` con manifest, stats y ≥10 tablas.
3. Agregá script npm: `"etl:run": "tsx scripts/run-etl-headless.ts"`.

**Verificación:** la corrida sobre el fixture produce `stats.json` cuyos conteos
ejecutivos coinciden con el snapshot del golden. **Commit:** `fase4: runner headless con persistencia por runId`

## Paso 4.2 — Endpoints de corridas en el server local

En `server/truckflow-local-server.mjs` agregá (patrón de los endpoints existentes):

```
POST /api/etl/runs            body: { eventsPaths?, excelPath?, from?, to? }
                              → spawnea `npx tsx scripts/run-etl-headless.ts ...`
                              → responde { runId } (síncrono está bien para empezar)
GET  /api/etl/runs            → lista manifests (leer runs/*/manifest.json)
GET  /api/etl/runs/:id/summary→ stats.json
GET  /api/etl/runs/:id/tables → nombres de tablas disponibles
GET  /api/etl/runs/:id/tables/:name
       ?limit=100&offset=0
       &filtro simple: ?col=<columna>&eq=<valor>  (igualdad string; suficiente para Fase 5)
GET  /api/etl/catalog/circuits → sirve CIRCUIT_CATALOG como JSON
       (generarlo a archivo en build del runner: el server .mjs no importa TS;
        el runner escribe runs/_catalog/circuits.json al arrancar)
```

Usá `spawnSync('npx', ['tsx', ...])` igual que `scripts/run-truckflow-transform-local.mjs`.

**Verificación:** con el server corriendo (`npm run server:truckflow`):
```
curl -X POST localhost:8788/api/etl/runs -H "Content-Type: application/json" \
  -d '{"eventsPaths":["tests/fixtures/etl/s-events-slice.json"]}'
curl localhost:8788/api/etl/runs
curl localhost:8788/api/etl/runs/<id>/tables/final_circuits?limit=5
```
(ajustá el puerto al que use el server — verificalo en el archivo).

**Commit:** `fase4: endpoints /api/etl/runs (crear, listar, consultar tablas)`

## Paso 4.3 — Smoke test automatizado

Creá `scripts/smoke-etl-api.mjs`: levanta el server (o asume levantado), hace el
ciclo POST run → GET summary → GET una tabla, y valida shape básico. Agregá
`"smoke:etl": "node scripts/smoke-etl-api.mjs"`.

**Commit:** `fase4: smoke test de la API de corridas`

## Paso 4.4 — 🛑 STOP-HUMANO: ¿Supabase ahora o después?

El repo ya tiene cliente Supabase (`server/supabase-client.mjs`) y migraciones.
Preguntar al usuario si las corridas deben subirse a Supabase (tabla `etl_runs` +
storage de tablas) o si disco alcanza por ahora. Si aprueba, diseñar la migración
SQL siguiendo el patrón de `supabase/migrations/` existente.

## ✅ Criterio de salida de la Fase 4

- `npm run etl:run -- --events <fixture>` produce una corrida completa en `runs/`.
- Los 5 endpoints responden y el smoke test pasa.
- La UI existente NO se tocó (sigue funcionando en modo navegador).
