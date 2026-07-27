# Handoff — Limpieza y refactor de arquitectura

> Documento de traspaso para continuar en sesión fresca (otra cuenta, mismo repo).
> Branch de trabajo: **`automatizacion`**. Todo lo de las waves 1-4 + Plan A está
> **commiteado** en `2779525`; el working tree quedó limpio.
> Última actualización: 2026-07-27.

---

## 0. Objetivo global

Depurar el Dashboard: sacar código muerto, des-enmarañar el cruce de información, y dejar
la clasificación de circuitos y el KPI/anomalías limpios. La app corre por **Vite dev**
(no gatea en `tsc`). Grafo de arquitectura generado con **graphify** en `graphify-out/`.

**Regla de oro:** los refactors que tocan clasificación deben quedar **completos y verdes**
(85 tests golden + `check:arch`), nunca a medias.

---

## 1. Hechos de arquitectura (verificados en código)

- **App = single-page, sin router.** `src/App.tsx` monta solo:
  `SiteProvider > RealJourneyDiagnosticsPage → RealTruckflowPage → RealJourneyDiagnosticsPageLegacy → RealJourneyDiagnosticsView`.
  Pese al nombre, **`...Legacy` está VIVO**. `RealTruckflowPage` envuelve
  `RealTruckflowWorkspaceProvider` **y** `EtlWorkbenchProvider` (ambos disponibles en los tabs).
- **Clasificación de circuitos = capas, no reemplazo.** El pipeline vivo
  (`etlTransformPipeline.runEtlTransform`, ~3k LOC) corre:
  1. **Técnica:** `classifyJourneyAgainstCircuitMatrix` (de `finalCircuitScoring.ts`) → `matrixClassification`
     (líneas ~1783/1794).
  2. **Ejecutiva:** reconciliación **excel-first** por ranking `EXCEL_FIRST_MATCH_RANK`
     (`etlCircuitClassificationIndex.ts:772`).
  3. **Comité:** bucketiza.
  → **`finalCircuitScoring` NO es borrable** (exporta `EXECUTIVE_CIRCUIT_MATRIX` + el scoring técnico vivo).
- **Solapamiento de circuitos (el "que no se pisen"):** a nivel secuencia de cámaras hay
  ambigüedad estructural real: **R5≡R6** (misma `baseSequence` + alias `CIRCUITO_VOLCABLE_1_2`),
  **R26/R27/R28** y **R30/R31/R32** comparten secuencia, **R7** solapa con **SL1**. Se desambigua por
  **plataforma+producto** (excel-first). Sin match de Excel → status **`NO_DIFERENCIABLE`**.
  R7 es **99.8% Soja** (2363/2367). Pendiente: auditar cuántos caen en `NO_DIFERENCIABLE`.
- **Los 4 "catálogos" son 4 FORMAS distintas, todas vivas:**
  - `CIRCUIT_CATALOG` — `src/etl-core/domain/circuitCatalog.ts:63` (canónico; fuente única objetivo).
  - `DEFAULT_CIRCUIT_MATRIX` — `finalCircuitScoring.ts:127` (circuito→secuencias; alimenta el clasificador vivo).
  - `EXECUTIVE_CIRCUIT_MATRIX` — `finalCircuitScoring.ts:181` (derivado con `Object.fromEntries`).
  - `MASTER_CIRCUIT_CATALOG` — `src/data/masterCircuitCatalog.ts:35` (site→plant; lo usa `powerBiCommitteeExecutive.ts`).

---

## 2. Hecho en la sesión previa (verificado)

### Wave 1-2 (limpieza front + motor legacy)
Borrados ~89 archivos: IFC completo (`IfcViewer`, `IfcLoadingOverlay` + deps `web-ifc`,
`web-ifc-three`, `three`), 9 páginas huérfanas (Home/LivePlant/HistoricalOperational/Analytics/
Comite/Comparativo/OperationalAlerts/PlanningDemand/Saturation), simulador-UI (`TruckRouteSimulator`,
`VisitDetailModal`, `VisitPickerSimple`, `TruckIcon`, `LoadingScreen`), clusters `estadia/*`,
`saturation/*`, `kpi5/*`, `analytics/*`, `charts/*`, `dashboard/*`, `flow/*`, `reports/*`,
3 contextos muertos (`DataContext`, `SimulatorVisitContext`, `LogisticsOpsContext`) + sacados de `App.tsx`,
y el **motor de transform legacy `src/services/truckflowTransform/*`** (mata la deuda de "dos motores en paralelo").
Dep `framer-motion` removida.

### Wave 3-4
- **`simulador/` entero borrado** + sus 10 scripts npm en `package.json` (`seed:*`, `simulator:*`, `dev:live`).
- **8 huérfanos** de `features/real-truckflow/**` (`RealTruckflowProvider`, `MovimientosContratoPanel`,
  `TransilePlateAliasesPanel`, `ExtraccionLocalTab`, `SegmentTramoFlowChartPanel`, `useRealTruckflowRange`,
  `transilePlateAliases`, `etlWorkbench/etl/indexes.ts`) + 2 transitivos (`data/cameraCatalog.ts`,
  `services/logisticsDataSource.ts`) + devDep `@types/three`.

### Plan A — Export CSV canónico (hecho, versión acotada)
- **Nuevo:** `src/features/real-truckflow/etlWorkbench/etlCanonicalCsvExport.ts` — toma las tablas
  canónicas de `transformResult.csv` y las sirve en **CSV plano / ZIP sin re-derivar** (fin de la
  sobreabundancia). Allowlist: `excel_operations_with_truckflow`, `final_circuits`,
  `circuit_timing_summary`, `circuit_timing_journeys`, `alerts_operational`, `transile_externo_operaciones`.
- **`EtlExportTab.tsx` reescrito** para usarlo vía `useEtlWorkbenchOptional().transformResult.csv`.
- **Borrado** `usePowerBiExport.ts`.
- **Retiro total de circuitEtlV2/PowerBI DIFERIDO** (ver §3): no es quirúrgico.

### Estado / verificación
- **tsc:** 200 (inicio) → **174** (removidos 26 errores, 0 nuevos). Los 174 restantes son **preexistentes**
  (drift de tipos en tests, unused vars, `@types/node` en scripts) — NO de esta limpieza.
- **`check:arch`: OK**. **85 tests núcleo verdes** (`circuitCatalog`, `finalCircuitScoring`,
  `committeeClassification`, `etlCircuitTiming`, `powerBiEtlExport`).
- **Graph:** 4194→**3805 nodos**, 186→**183 comunidades**. IFC/simulador/estadía/truckflowTransform/LogisticsOps
  ya no aparecen.
- **Suite completa al commitear:** `check:arch` OK + **590 tests pasan**. Quedan **3 fallos
  preexistentes** (`etlSegmentTiming` ×2, `etlRicSanLorenzoRoute` R27) en archivos que esta
  limpieza no tocó — no son regresiones.

### Corrección aplicada antes del commit (LEER)
`src/services/truckflowTransform/contractFirst/` se había borrado por muerto, pero **está vivo** y
rompía los golden master. Restaurado completo. Dos consumidores reales:
- `etlWorkbench/etlTransformContractFirst.ts:3` → `buildCliWorkbenchInputsFromJourneys` (pipeline ETL de la app).
- `scripts/contract-first-cli-runner.ts` → `contractIntegrationRun` + `contractFirstCliAdapter`; es la
  **ruta ETL headless** a la que delega `scripts/run-truckflow-transform-local.mjs`.

Lección para las próximas waves: knip mira solo `src/`. **Antes de borrar, grepear también
`scripts/`, `server/` y `tools/`**, y correr la suite completa (`npm test`), no solo los 85 golden.
El resto de `truckflowTransform/` (`analytics`, `classify`, `export`, `extract`, `index`, `normalize`,
`quality`, `reconstruct`, `types`, `diagnostics`) sí quedó borrado: nadie lo importa (verificado).

### Deuda abierta por esta limpieza
`package.json` sacó `three`, `web-ifc`, `web-ifc-three`, `framer-motion` y `@types/three`, pero
`package-lock.json` y `pnpm-lock.yaml` **siguen desincronizados** → `npm ci` fallaría en un clone
limpio o en CI. No se tocó a propósito (resolver dependencias mete diff ruidoso y riesgo en el env
de dev). Follow-up acotado: `npm install --package-lock-only` en un commit aparte.

---

## 3. Pendiente — plan preciso (orden recomendado)

### B4 — Cortar ciclos de import (EMPEZAR ACÁ: mecánico, bajo riesgo)
Mover tipos compartidos a `src/etl-core/domain/` (dependencia en una sola dirección). Ciclos:
- `etlExcelMovimientosStep.ts → etlTransformPipeline.ts → etlTransformPhaseStore.ts → (vuelta)`
- `etlTransformPhaseStore.ts → etlTransformTramo3.ts → etlTransformPipeline.ts → (vuelta)`
- `pipelineTypes.ts → etlExcelFirstMerge.ts → etlPlatformCircuitInference.ts → transileExternoCiclo.ts → (vuelta)`
- `pipelineTypes.ts → etlExcelFirstMerge.ts → etlCircuitClassificationIndex.ts → etlPlatformCircuitInference.ts → transileExternoCiclo.ts → (vuelta)`
Sin cambio de lógica. Gate: build + 85 tests verdes.

### B1 — Catálogo único de circuitos
`CIRCUIT_CATALOG` como fuente única; **derivar** `DEFAULT_CIRCUIT_MATRIX` y `EXECUTIVE_CIRCUIT_MATRIX`
desde él (behavior-preserving); migrar `powerBiCommitteeExecutive.ts` para que no dependa de
`MASTER_CIRCUIT_CATALOG` y luego borrar ese último. **Gate obligatorio:** los 85 tests golden verdes
(cualquier cambio de comportamiento en la clasificación se ve ahí).

### B3 — Partir god-files + retirar PowerBI/circuitEtlV2
- Partir `RealJourneyDiagnosticsView.tsx` (god-file, ~65 edges), `etlTransformPipeline.ts` (~3k LOC),
  `etlSegmentTiming.ts` (~5k LOC) por responsabilidad.
- **Al partir View/Legacy, migrar su export committee al nuevo `etlCanonicalCsvExport`** → ahí muere
  `circuitEtlV2` de una. Contexto: `buildCircuitEtlV2CsvBundle` es el núcleo de
  `buildCommitteePowerBiEtlExport` (`powerBiEtlExportBuilder.ts:447,687`), y las páginas vivas
  `RealJourneyDiagnosticsView` (~L1811-1961) y `Legacy` (~L2190-2221) lo usan. NO borrar suelto.

### Auditorías / colas
- **Auditar `NO_DIFERENCIABLE`**: cuántos journeys quedan sin desambiguar (el solapamiento real).
- `scripts/` + `tools/`: CLIs de auditoría; knip los marca "unused" pero son manuales — **NO borrar sin decidir**.
- Revisar `LoadExportTab.tsx` (usa `powerBiLoad`) — ¿tab vivo o huérfano?
- Los **174 errores tsc preexistentes** — pasada aparte (no bloquean Vite).

---

## 4. Comandos útiles

```bash
# Código muerto (autoritativo):
npx -y knip@5 --include files,dependencies --no-exit-code

# Gate de arquitectura + tests golden:
node scripts/check-arch-rules.mjs
npx vitest run src/etl-core/domain/circuitCatalog src/features/real-truckflow/etlWorkbench/finalCircuitScoring src/features/real-truckflow/etlWorkbench/committeeClassification src/features/real-truckflow/etlWorkbench/etlCircuitTiming

# Conteo de errores tsc (baseline 174):
npx tsc -b 2>&1 | grep -cE "error TS"

# Regenerar el grafo tras borrar código (--force por el shrink-guard):
graphify update . --force        # (PATH: C:\Users\Usuario\.local\bin)
```

---

## 5. Notas de graphify
- Instalado vía `uv tool install graphifyy` (paquete PyPI **`graphifyy`** con doble-y; CLI = `graphify`).
- El skill vive en `~/.claude/skills/graphify/`. Salidas en `graphify-out/` (`graph.html`, `graph.json`, `GRAPH_REPORT.md`).
- Para nombres de comunidad con LLM: `graphify label`. Para grafo más limpio: agregar `.graphifyignore`
  con `data/`, `runs/`, `graphify-out/`, `*.json` de fixtures, y regenerar con `--directed`.
