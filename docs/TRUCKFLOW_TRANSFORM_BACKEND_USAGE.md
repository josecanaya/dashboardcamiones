# Uso recomendado — Backend Transform Truckflow (sin UI)

## Objetivo

Trabajar clasificación, normalización y export **sin** abrir Vite, componentes ni páginas.

**Cursor (opcional):** regla de proyecto `.cursor/rules/truckflow-transform-backend.mdc` — se sugiere al abrir archivos bajo `truckflowTransform/`, `etlWorkbench/`, export Power BI o scripts CLI Transform.

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

### Diagnóstico de performance Paso 3 Contract-first

Orquestador: `runMovimientosContratoIntegration` (`etlMovimientosContratoIntegration.ts`).

**Orden de sub-etapas (sin cambiar criterios de match):**

| step | Función / módulo | Entrada → salida (orden de magnitud) |
|------|------------------|--------------------------------------|
| (previo) | `loadMovimientosContratoFiles` + `normalizeMovimientosContratoBatch` | XLSX → filas Excel normalizadas |
| `build_truckflow_journeys` | `buildTruckflowJourneysForMerge` | `finalCsvRows` (~3.8k) → journeys merge |
| `build_segments` | `extractSegmentLegsWithTimes` + `buildTruckflowSegmentsForMerge` | ~3.8k journeys → segmentos |
| `merge_truckflow_movimientos` | `mergeTruckflowWithMovimientos` | journeys × mov Excel; fuzzy OCR con cache |
| `merge_excel_first_evidence` | `mergeExcelOperationsWithTruckflowEvidence` | **cuello habitual:** O(mov × journey) si no hay exact; progreso cada 25 filas |
| `clean_journeys` | `buildCleanJourneysForAnalysis` | merged → clean |
| `operational_sample` | `createOperationalSample` | muestra operativa |
| (si `skipKpiTiemposArtifacts` false) | scatter / `buildSegmentScatterByDayRows` | KPI tiempos |
| `export_csv` | varios `*Csv()` | muchos strings CSV |

**Telemetría:** callback opcional `onProgress` / `onContractFirstProgress` con `{ step, label, current, total, elapsedMs, details }`. Helpers: `etlContractFirstProgress.ts` (`runContractFirstStage`, `[SLOW_STEP]` si &gt; 30 s, aviso larga corrida &gt; 3 min). UI: `TransformRunProgress` + consola `[CONTRACT_FIRST_PROGRESS]`. Salida: `stageTimings[]` en el resultado de integración.

**CLI:** `contract-first-cli-runner.ts` loguea progreso y `stageTimings` al final.

**Optimizaciones seguras ya aplicadas (mismo resultado):** índice `journeysByExactPlate` en merge Truckflow; memo `fuzzyCandidatesByPlate` en Excel-first; `createPlateMatchCache()` compartido entre merge y Excel-first; prefiltrado OCR fuzzy `journeysForFuzzyOcrPrefilter` (`useCandidatePrefilter`, default **true**).

### Contadores de descarte Excel-first

Tras el merge, en `excelFirstResult.summary` / `discardCounters` / `onContractFirstProgress.details`:

| Contador | Interpretación |
|----------|----------------|
| `no_plate_in_truckflow` | Operaciones sin patente exacta ni fuzzy OCR en Truckflow |
| `exact_plate_candidates` | Suma de journeys con misma patente normalizada (antes de ventana) |
| `fuzzy_plate_candidates` | Candidatos OCR fuzzy aceptados por umbral (antes de ventana) |
| `rejected_by_time_window` | Candidatos exact/fuzzy descartados por no caer en ventana de búsqueda |
| `rejected_by_low_ocr_similarity` | Comparaciones en pool prefiltrado que no alcanzaron fuzzy (métrica OCR) |
| `rejected_by_ambiguous_fuzzy` | Operaciones con fuzzy ambiguo o rechazado por múltiples en ventana |
| `rejected_by_site_or_plant` | **Informativo:** journeys en pool con `plant_scope` distinto a Excel (no filtra match) |
| `candidates_after_prefilter` | Tamaño del pool antes de OCR (journeys que pueden entrar en ventana) |
| `candidates_after_time_filter` | Candidatos exact+fuzzy tras ventana y rechazo operativo |
| `operations_with_exact_plate` | Ops con al menos un journey de patente exacta en Truckflow |
| `operations_with_only_fuzzy_plate` | Sin exacta pero con fuzzy OCR |
| `operations_without_any_candidate` | Sin exacta ni fuzzy |

**CSV diagnóstico (nuevo, no rompe exports previos):** `excel_first_candidate_diagnostics.csv` — una fila por operación Excel con conteos y `match_quality` / `no_truckflow_reason`.

**Lectura rápida de causas:** mucho `rejected_by_time_window` → revisar ingreso/salida Excel vs horarios Truckflow; mucho `rejected_by_low_ocr_similarity` → OCR/patente en cámara; alto `no_plate_in_truckflow` → patente ausente en período o `PERIOD_MISMATCH`; `rejected_by_site_or_plant` alto solo indica mezcla RIC/SL en pool, no bloqueo automático.

## Servidor Node vs lógica TS

| Pieza | Dónde corre |
|-------|-------------|
| Descarga a JSON | `server/truckflow-local-server.mjs` (:8787) |
| Transform | Hoy: bundler/Vitest (TS en `src/services`); UI React opcional |
| Persistencia patentes | `server/truck-plate-registry.mjs` + Supabase opcional |
