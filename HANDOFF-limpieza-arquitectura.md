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

## 3. Estado del plan B

Baseline sano actual: `check:arch` OK, **601 tests pasan**, **3 fallos preexistentes**
(`etlSegmentTiming` ×2, `etlRicSanLorenzoRoute` R27), **tsc 173**, **0 ciclos**, `vite build` OK.

### B4 — Cortar ciclos de import ✅ HECHO (`9e884db`)
De **5 SCC / 14 archivos** a **0 ciclos**. El handoff listaba 4 ciclos a ojo; el detector encontró 5,
incluyendo dos no documentados. Guardá el detector: `scripts/`… no, quedó en scratchpad — recrear con
Tarjan sobre `src/` si hace falta, **con rutas absolutas** (con relativas da falso negativo).

Patrón usado: en los 5 pares un lado importaba un **tipo** y el otro un **valor**; se extrae lo
compartido a un módulo leaf y el original re-exporta. Módulos nuevos: `etlTransformContracts.ts`,
`etl-core/domain/contractMovements.types.ts`, `etlTruckflowMergeTypes.ts`, `config/sanLorenzoFlags.ts`,
`etlPlantaFromSegment.ts`, `auditCameraCalibrationTypes.ts`.

⚠️ El plan decía "mover tipos a `etl-core/domain/`" — para los contratos del pipeline **eso viola el
gate de capas** (`check-arch-rules` prohíbe que etl-core importe etlWorkbench). Van en leaf dentro de
etlWorkbench.

### B1 — Catálogo único ✅ CERRADO (`8200145`) — el plan estaba mal planteado
1. `EXECUTIVE_CIRCUIT_MATRIX` **ya se derivaba** de `CIRCUIT_CATALOG` (`finalCircuitScoring.ts:181`).
2. La resolución alias→código ejecutivo **ya sale** de `cfg.aliases` (`finalCircuitScoring.ts:790,817`).
3. `DEFAULT_CIRCUIT_MATRIX` **NO es derivable**: usa puntos lógicos (INGRESO/PREINGRESO/…) y el
   catálogo usa S-codes, con granularidad distinta (R1: 9 S-codes vs 7 puntos). No hay mapeo.
4. `MASTER_CIRCUIT_CATALOG` **NO es duplicado**: es la taxonomía de **negocio** (A1V0/B1V0,
   codigoCircuito, codigoVuelta, grupos, colores). Borrarlo pierde la cobertura `matriz_negocio` de
   `powerBiCommitteeExecutive`. Ya está documentado en `src/data/masterCircuitCatalog.ts`.

Deduplicación real aplicada: `expectedCircuitTemplateLength` derivada de `DEFAULT_CIRCUIT_MATRIX`
+ `circuitTemplateLength.test.ts` (11 casos) que fija equivalencia con el switch original.

🔴 **Deuda encontrada, NO resuelta:** `CIRCUITO_LIQUIDO` lista **5** puntos en
`DEFAULT_CIRCUIT_MATRIX` pero el scoring espera **6**. Se preservó tal cual (para no mover el KPI de
líquidos) como override documentado. **Decidir cuál es la correcta** — toca el KPI de líquidos.

### B3 — God-files 🟡 PARCIAL

Hecho sobre `etlSegmentTiming.ts`: **5066 → 4661 LOC**, en dos extracciones verificadas.
- `etlSegmentTimingRules.ts` (354 LOC, `0b2b2e9`) — topes por transición, rollups, cadenas KPI.
- `etlTimelinePrimitives.ts` (180 LOC, `f2e25a6`) — colapsado de puntos, grupo coherente, timeline.

Pendiente, en orden:
1. **Bloque San Lorenzo de `etlSegmentTiming.ts`** (~L658-1330: `sanitizeMisplacedSlEgreso` →
   `resolveSlBalanzaEgresoHorarioForKpi`, ~700 LOC muy cohesivo). Ya está **desbloqueado**: depende de
   `etlTimelinePrimitives`, así que sale sin ciclo. Es la extracción grande que queda.
2. `etlTransformPipeline.ts` (2952 LOC) y `RealJourneyDiagnosticsView.tsx` (3030 LOC) — sin tocar.

**Receta para extraer (aprendida a los golpes, 2 bugs atrapados por el gate):**
- Matchear declaraciones **solo a columna 0** (`^(export )?(const|function|type)`). Con el regex sin
  anclar se promueven variables locales (`out`, `prev`, `start`…) a export y sale basura.
- Los god-files tienen **`import` a mitad de archivo**. Si el rango extraído se lleva uno, el archivo
  original pierde esos símbolos → cientos de errores tsc. Revisar y repartir el import.
- No confiar en una lista de candidatos hecha a mano para las dependencias: buscar **todos** los
  símbolos top-level definidos fuera del rango y usados dentro.
- Gate por extracción: `npm test` (601 + los 3 preexistentes), `tsc` = 173, 0 ciclos, `vite build`.

### 🔴 circuitEtlV2 / PowerBI — NO retirado, requiere decisión de producto
El plan decía "migrar el export committee a `etlCanonicalCsvExport` y ahí muere circuitEtlV2".
**No es un refactor**: `buildCommitteePowerBiEtlExport` re-deriva desde eventos crudos y expone un
panel de UI con ~14 claves CSV + ZIP debug (`RealJourneyDiagnosticsView.tsx:1-9` define las filas,
`Legacy:2209` llama al builder). `etlCanonicalCsvExport` sirve **otras** tablas (las canónicas ya
calculadas). Reemplazar uno por otro **cambia lo que el usuario descarga** y rompería
`powerBiEtlExport.test.ts`. Nota: el archivo ya no se llama `circuitEtlV2` sino
`etlWorkbench/powerBiCircuitCsvBundle.ts`. **Preguntar antes de tocar.**

### Auditorías / colas
- **Auditar `NO_DIFERENCIABLE`**: cuántos journeys quedan sin desambiguar (el solapamiento real).
- `scripts/` + `tools/`: CLIs de auditoría; knip los marca "unused" pero son manuales — **NO borrar sin decidir**.
- Revisar `LoadExportTab.tsx` (usa `powerBiLoad`) — ¿tab vivo o huérfano?
- Los **173 errores tsc preexistentes** — pasada aparte (no bloquean Vite).
- **Lockfiles desincronizados** (ver sección 2): `npm install --package-lock-only` en commit aparte.

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
