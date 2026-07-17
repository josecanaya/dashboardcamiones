# Movimientos por contrato: backup local particionado por día

## Objetivo
Cargar todos los Excel de Movimientos por Contrato (meses enteros) en una carpeta
local persistente, leídos **por fecha** igual que los JSON de Truckflow, para que
el histórico quede como backup y el agente/ETL lo consulte corriendo cualquier rango.

## Decisiones (2026-07-16)
- **Layout particionado por día**: `data/movimientos/<YYYY-MM-DD>/movimientos.json`
  (espejo de `data/truckflow/<día>/`). El Excel crudo se guarda además en
  `data/movimientos/_raw/` como respaldo tal cual.
- **Consulta por rango en cada corrida**: `run_etl` con `from_day`/`to_day` incluye
  automáticamente los movimientos del rango (además de los eventos Truckflow). Para
  "todo el tiempo", rango amplio.

## Flujo
### Ingesta (una vez por archivo nuevo)
1. Se sube/deja un `.xlsx` → se guarda crudo en `data/movimientos/_raw/`.
2. Se **normaliza una vez** (`readMovimientosContratoXlsx` + `normalizeMovimientosContratoBatch`).
3. Se **particiona por día** según la fecha de cada fila (`external_ingreso_at`, fallback `source_date`).
4. Cada partición se **mergea con la existente y deduplica** por `external_operation_id`
   (`dedupeMovimientosByOperationId`) → `data/movimientos/<día>/movimientos.json`.

### Corrida
5. `run_etl(from_day, to_day)` lee las particiones de días del rango, concatena,
   deduplica, y pasa como `preNormalizedMovimientos` a `runMovimientosContratoIntegration`
   (camino ya existente que salta la relectura de XLSX).

## Piezas
- ✅ **Núcleo puro** (`src/etl-core/ingest/movimientosDayPartition.ts`): `dayIsoFromMovimiento`,
  `partitionMovimientosByDay`, `mergeMovimientosDedup` + 7 tests.
- ✅ **Ingesta** (`scripts/ingest-movimientos.ts`): `--excel <xlsx>` → normaliza, particiona por
  día, mergea+dedup a `data/movimientos/<día>/movimientos.json`, crudo a `_raw/`. Idempotente.
  Exporta `ingestMovimientosBuffer` para el server. Verificado sobre Excel real.
- ✅ **Runner** (`scripts/run-etl-headless.ts`): `--movimientos-root/--from-day/--to-day`; sin
  `--excel` lee las particiones del rango (inferido del min/max de eventos si no se pasa) y las
  pasa como `preNormalizedMovimientos`. Pipeline (`etlTransformPipeline`) cablea ese campo.
- ⏳ **Server (opcional, siguiente)**: `POST /api/movimientos/ingest` (reusa `ingestMovimientosBuffer`)
  + `GET /api/movimientos/list-days` (cobertura). Hoy la ingesta se hace por CLI.
- ⏳ **UI (opcional)**: botón "Subir movimientos al backup" → `/ingest`.

## Cómo usarlo hoy (CLI)
1. Cargar los Excel al backup (repetible, idempotente):
   `npx tsx scripts/ingest-movimientos.ts --excel "ruta/uno.xlsx" --excel "ruta/dos.xlsx"`
2. Correr el ETL sobre un rango — toma los movimientos del backup automáticamente:
   `npx tsx scripts/run-etl-headless.ts --events data/truckflow/<día>/... --from-day 2026-05-01 --to-day 2026-07-31`
   (o vía el agente con `run_etl(from_day, to_day)` sin `excel_path`).

## Reusa
- `dedupeMovimientosByOperationId` (`src/etl-core/ingest/dedupeMovimientos.ts`).
- `preNormalizedMovimientos` en `runMovimientosContratoIntegration`.
- Patrón `data/truckflow/<día>/` + `/api/truckflow/list-days` en `server/truckflow-local-server.mjs`.
