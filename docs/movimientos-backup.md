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

## Piezas a construir
- **Núcleo puro** (`src/etl-core/ingest/movimientosDayPartition.ts`): `dayIsoFromMovimiento`,
  `partitionMovimientosByDay`, `mergeMovimientosDedup`. + tests. ✅ (este commit)
- **Server**: `POST /api/movimientos/ingest` (guarda crudo + normaliza + particiona + mergea),
  `GET /api/movimientos/list-days` (cobertura del backup). Usa el núcleo puro.
- **Runner/run_etl**: leer `data/movimientos/<día>/movimientos.json` del rango → `preNormalizedMovimientos`.
  Retirar el requisito de `--excel <uno>` (queda opcional para cargas puntuales).
- **UI (opcional)**: botón "Subir movimientos al backup" que pega a `/ingest`.

## Reusa
- `dedupeMovimientosByOperationId` (`src/etl-core/ingest/dedupeMovimientos.ts`).
- `preNormalizedMovimientos` en `runMovimientosContratoIntegration`.
- Patrón `data/truckflow/<día>/` + `/api/truckflow/list-days` en `server/truckflow-local-server.mjs`.
