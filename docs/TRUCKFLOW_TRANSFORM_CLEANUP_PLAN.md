# Plan de limpieza futura — Transform Truckflow

Checklist por etapas. **Etapa 1** es la actual (documentación + barrels, sin mover archivos).

## Etapa 1 — Documentación y barrels ✅ (en curso)

- [x] `docs/TRUCKFLOW_TRANSFORM_BACKEND_MAP.md`
- [x] `docs/TRUCKFLOW_TRANSFORM_BACKEND_USAGE.md`
- [x] `src/services/truckflowTransform/*` (reexportaciones)
- [x] Comentarios de cabecera en archivos núcleo
- [x] Stub CLI + README
- [ ] Regla Cursor opcional «modo backend Transform»

**Criterio de salida:** cualquier dev puede ubicar clasificación vs diagnóstico vs export sin abrir UI.

## Etapa 2 — Separar browser de funciones puras (parcial ✅)

- [x] `powerBiEtlExportBuilder.ts` — CSV, datasets, nombres, `zipPowerBiNamedCsvSync`
- [x] `powerBiBrowserDownload.ts` — descargas DOM / File System Access
- [x] `powerBiEtlExport.ts` — compatibilidad (reexport)
- [x] `truckflowTransform/export.ts` — apunta a builder + browser
- [ ] `resolve*ApiOrigin` con parámetro `baseUrl` obligatorio en CLI
- [ ] `annotate*Chunked` / parse con flag `yield: false` para Node
- [ ] Tests dedicados que importen solo `powerBiEtlExportBuilder` (opcional)

**Criterio de salida:** Vitest y CLI importan solo módulos sin side effects DOM. **Power BI export:** cumplido para build/ZIP; extract/parseo pendiente.

## Etapa Contract-first — Capa backend (parcial ✅)

- [x] `src/services/truckflowTransform/contractFirst/*` (reexports + `CONTRACT_FIRST_INTEGRATION_CSV_KEYS`)
- [x] Documentación en MAP / USAGE
- [x] `@deprecated` en cabeceras Workbench (imports nuevos → contractFirst)
- [ ] Mover implementación física de `etlWorkbench` → `contractFirst` (sin reexport inverso)
- [ ] Invertir orden: Excel + Truckflow limpio → merge → **luego** clasificación
- [ ] Conciliación en Power BI comité/v2
- [ ] Lectura `.xlsx` desde CLI / `data/`

**Criterio de salida:** CLI y servicios importan solo `contractFirst`; Workbench es thin wrapper.

## Etapa 3 — Motor oficial único (decisión de producto)

- [ ] Documento ADR: ¿v2 + comité vs Workbench `etlTransformPipeline`?
- [ ] Alinear listas rear y LPR entre `rearCameraFilter` y `etlRearDevices`
- [ ] Tabla de equivalencia `preliminary` ↔ `circuit_status` v2 ↔ flags comité
- [ ] Deprecar gradualmente una ruta (sin borrar archivos hasta Etapa 5)

**Criterio de salida:** una ruta documentada para Power BI y otra explícitamente «legacy/exploración».

## Etapa 4 — CLI local ETL sin React (parcial ✅ Contract-first)

- [x] `run-truckflow-transform-local.mjs` — validación + delegación a `contract-first-cli-runner.ts`
- [x] Contract-first: Excel + `event-list.json` → `runMovimientosContratoIntegration` → CSV en `scripts/output/contract-first`
- [x] `contractFirstCliAdapter.ts` — reconstrucción mínima (sin matriz Workbench)
- [x] Runner `tsx` vía `npx` + script `npm run contract-first:local`
- [ ] CLI Transform completo: comité/v2 + `powerBiEtlExportBuilder`
- [ ] Usar `finalCsvRows` exportados desde Workbench (paridad clasificación)
- [ ] Alertas en merge / filtros rear en CLI

**Criterio de salida:** un comando genera CSV sin navegador. **Contract-first:** cumplido en alcance acotado.

### Diagnóstico de performance Paso 3 Contract-first

- [x] `runContractFirstStage` + `onProgress` opcional en `runMovimientosContratoIntegration`
- [x] `stageTimings` en salida; `[SLOW_STEP]` / aviso 3 min en consola
- [x] Progreso UI mínimo (`TransformRunProgress`, panel XLSX)
- [x] Cache OCR compartido + índice patente exacta (merge / Excel-first)
- [x] Contadores agregados de descarte + `excel_first_candidate_diagnostics.csv`
- [x] Prefiltro seguro `journeysForFuzzyOcrPrefilter` (`useCandidatePrefilter`, default true; test paridad vs full scan)
- [ ] Medir en producción qué etapa supera 30 s y priorizar índice por día/site sin cambiar umbrales
- [ ] Documentar paridad CLI vs Workbench con mismos `finalCsvRows`

Detalle operativo: `docs/TRUCKFLOW_TRANSFORM_BACKEND_USAGE.md` § «Diagnóstico de performance Paso 3».

## Etapa 5 — Eliminar duplicaciones / legacy

- [ ] Mover físicamente archivos a `src/services/truckflowTransform/` (subcarpetas) con reexports de compat en `src/services/*.ts`
- [ ] Consolidar diagnósticos dispersos
- [ ] Retirar rutas muertas solo tras métricas de uso en repo

**Criterio de salida:** imports nuevos solo desde `truckflowTransform/`; aliases legacy temporales.

## Etapa 6 — Validación Power BI y dashboard

- [ ] Comparar hashes/conteos CSV CLI vs export UI
- [ ] Regresión visual mínima en pestañas comité/ETL (fuera del alcance backend puro)
- [ ] Checklist release con `npx vitest run src/services/*.test.ts` + etlWorkbench

**Criterio de salida:** paridad datos aceptada entre CLI, tests y una corrida manual UI.

---

## Riesgos a vigilar

- Cambiar `realPreliminaryCircuit` impacta `realJourneyEventsMapper` y clean dataset.
- Cambiar `circuitEtlV2` impacta ZIP Power BI y tests v2.
- Workbench puede divergir silenciosamente si no se ejecutan ambas suites de tests.
