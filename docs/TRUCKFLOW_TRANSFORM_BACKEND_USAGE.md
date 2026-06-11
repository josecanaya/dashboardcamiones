# Uso recomendado — Backend Transform Truckflow (sin UI)

## Objetivo

Trabajar clasificación, normalización y export **sin** abrir Vite, componentes ni páginas.

## Arranque mínimo

1. **Datos en disco** (opcional pero habitual):
   ```bash
   npm run server:truckflow
   ```
   Exportar días vía `POST http://127.0.0.1:8787/api/truckflow/export-period` o usar JSON ya en `data/truckflow/YYYY-MM-DD/`.

2. **Tests unitarios** (motor lógico en Node/Vitest):
   ```bash
   npx vitest run src/services/circuitEtlV2.test.ts
   npx vitest run src/services/circuitPlateOcr.test.ts
   npx vitest run src/services/realJourneyCycleSplit.test.ts
   npx vitest run src/services/powerBiEtlExport.test.ts
   npx vitest run src/services/truckflowRawJourneyStats.test.ts
   npx vitest run src/services/truckPlateRegistryFilter.test.ts
   ```

3. **Suite ETL Workbench** (otro motor, mismo repo):
   ```bash
   npx vitest run src/features/real-truckflow/etlWorkbench
   ```

4. **CLI futuro** (stub): `scripts/run-truckflow-transform-local.mjs` — ver README en la misma carpeta.

## Qué archivo abrir según el problema

| Problema | Archivo(s) |
|----------|------------|
| Patente / OCR | `argentinaPlate.ts`, `circuitPlateOcr.ts`, `realJourneyEventPlate.ts` |
| Punto lógico / sector | `realEventNormalization.ts`, `src/data/realSectorCodeMap.ts` |
| Agrupación journeyUid | `realJourneyEventsMapper.ts` |
| Mismo UID, varios viajes | `realJourneyCycleSplit.ts` |
| Clasificación rápida | `realPreliminaryCircuit.ts` |
| Matriz / scoring v2 | `circuitEtlV2.ts` |
| Comité / segmentos largos | `realCommitteePipeline.ts` |
| Dataset filtrado previo a export | `realTruckflowCleanDataset.ts` |
| CSV Power BI (CLI/tests) | `powerBiEtlExportBuilder.ts` (`build*`, `zipPowerBiNamedCsvSync`) |
| Descargas ZIP/CSV en UI | `powerBiBrowserDownload.ts` o `powerBiEtlExport.ts` (compat) |
| Stats sobre JSON crudo | `truckflowRawJourneyStats.ts` |
| Auditoría puntual | `realPlateAudit.ts`, `nearbyAlertResearch.ts` |
| Mapa de capas | `docs/TRUCKFLOW_TRANSFORM_BACKEND_MAP.md` |
| Entrada agrupada | `src/services/truckflowTransform/index.ts` |

## Qué evitar (ahorro de contexto)

- `src/components/**`, `src/pages/**`, `simulador/**`
- Gráficos: `Segment*Chart*.tsx`, `KpiTiemposTab.tsx`, etc.
- `analyticsKpi.ts` / `saturationAnalytics.ts` si el ticket es solo circuitos Truckflow (usan `HistoricalTrip` mock/logistics)
- Descargas browser al final de `powerBiEtlExport.ts` si solo validás CSV en tests

## Flujo recomendado de trabajo

```
eventos/alertas crudos (API o data/truckflow/.../event-list.json)
  → normalización (patente + punto lógico)
  → reconstrucción (mapper, opcional cycle split)
  → clasificación (preliminar y/o v2 y/o comité)
  → calidad / clean dataset
  → exportación (build* CSV, tests)
  → KPIs (solo si el alcance lo pide)
```

## Cursor / tokens

- Anclar `@docs/TRUCKFLOW_TRANSFORM_BACKEND_MAP.md` y un solo archivo núcleo.
- Preferir `npx vitest run <un test>` sobre `npm run dev`.
- Modo sugerido en el chat: *«Solo src/services + etlWorkbench tests; sin UI»*.

## Contract-first / Excel-first

```ts
import {
  runMovimientosContratoIntegration,
  mergeExcelOperationsWithTruckflowEvidence,
  loadMovimientosContratoFiles,
} from '@/services/truckflowTransform/contractFirst'
```

- **Tests:** `npx vitest run src/features/real-truckflow/etlWorkbench/etlExcelFirstMerge.test.ts` (siguen importando Workbench).
- **Artefactos CSV clave:** `merged_truckflow_movimientos`, `excel_operations_with_truckflow`, `movimientos_without_truckflow_match`, `excel_no_truckflow_evidence_diagnostics` — ver `CONTRACT_FIRST_INTEGRATION_CSV_KEYS` en `contractIntegrationRun.ts`.
- **No mezclar** con `truckPlateRegistryFilter` (exclusiones manuales).

Orden actual: clasificación Workbench **antes** del merge; esta etapa solo documenta y agrupa imports.

### CLI Contract-first (sin UI)

```bash
# Validar JSON por día
node scripts/run-truckflow-transform-local.mjs --from 2026-06-04 --to 2026-06-04

# Conciliar con Excel
node scripts/run-truckflow-transform-local.mjs \
  --from 2026-06-04 --to 2026-06-04 \
  --excel /ruta/MovimientosPorContrato_YYYYMMDD.xlsx \
  --out scripts/output/contract-first
```

Salida y limitaciones: `scripts/run-truckflow-transform-local.README.md`.  
Adaptador: `contractFirst/contractFirstCliAdapter.ts` (reconstrucción Ricardone mínima, no matriz Workbench).

## Servidor Node vs lógica TS

| Pieza | Dónde corre |
|-------|-------------|
| Descarga a JSON | `server/truckflow-local-server.mjs` (:8787) |
| Transform | Hoy: bundler/Vitest (TS en `src/services`); UI React opcional |
| Persistencia patentes | `server/truck-plate-registry.mjs` + Supabase opcional |
