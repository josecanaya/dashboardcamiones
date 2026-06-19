# Mapa del backend lógico — Transform Truckflow (`src/services`)

Documento de referencia (Etapa 1 ✅). **No sustituye** los archivos en su ubicación actual; complementa `src/services/truckflowTransform/` (barrels de reexportación). Guía Cursor: `.cursor/rules/truckflow-transform-backend.mdc`.

## Jerarquía conceptual del Transform (objetivo)

| Rol | Archivo | Uso |
|-----|---------|-----|
| Clasificación inicial / lectura rápida | `realPreliminaryCircuit.ts` | Reglas operativas preliminares sobre journeys reconstruidos |
| **Motor oficial Transform (v2)** | `circuitEtlV2.ts` | Sesiones por patente+site, scoring matriz, bundle CSV v2 |
| Salida ejecutiva / comité | `realCommitteePipeline.ts` | Segmentación temporal, flags comité, circuito operativo Ricardone |
| Exportación (no clasifica) | `powerBiEtlExportBuilder.ts` + `powerBiBrowserDownload.ts` | Builder: CSV/ZIP bytes; browser: descargas (`powerBiEtlExport.ts` reexporta ambos) |
| Indicadores posteriores | `analyticsKpi.ts`, `saturationAnalytics.ts` | KPIs logísticos / saturación (dominio `HistoricalTrip`, no solo Truckflow crudo) |
| Presentación filtrada | `truckflowEventosPresentation.ts` | Filtros para vistas de eventos Ricardone |

### Fuente de verdad recomendada (hoy)

- **Clasificación “oficial” para Power BI comité + v2:** `circuitEtlV2.ts` + `realCommitteePipeline.ts` (consumidos por `powerBiEtlExport.ts`).
- **Clasificación rápida / legacy en UI y mapper:** `realPreliminaryCircuit.ts` (usada en `realJourneyEventsMapper.ts` al reconstruir).
- **Segundo motor Transform (UI Workbench):** `src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts` y `finalCircuitScoring.ts` — **paralelo** a `src/services`, no reemplazado por este mapa.

## Contract-first / Excel-first (Movimientos por Contrato)

**Qué es:** expectativa operativa desde planillas Excel (`MovimientosPorContrato_*.xlsx`), conciliación con evidencia Truckflow (patente exacta/fuzzy OCR, ventanas temporales), estados Excel↔Truckflow, enriquecimiento con producto/plataforma/contrato. **No** es matriz de circuitos ni export Power BI comité/v2.

**Dónde estaba:** `src/features/real-truckflow/etlWorkbench/` (`etlExternalMovimientosContrato`, `etlExcelFirstMerge`, `etlTruckflowMovimientosMerge`, `etlMovimientosContratoIntegration`, …).

**Dónde queda (entrada backend):** `src/services/truckflowTransform/contractFirst/` — barrels que reexportan la implementación Workbench (sin mover código aún).

| Módulo contractFirst | Implementación física (fuente de verdad hoy) |
|----------------------|-----------------------------------------------|
| `contractExcelParser.ts` | `etlExternalMovimientosContrato.ts` |
| `contractFieldNormalizer.ts` | `etlExternalNormalization.ts` |
| `contractTruckflowMerge.ts` | `etlTruckflowMovimientosMerge.ts` + `etlPlatformCircuitInference.ts` |
| `contractExcelFirstEvidence.ts` | `etlExcelFirstMerge.ts` |
| `contractIntegrationRun.ts` | `etlMovimientosContratoIntegration.ts` |
| `contractFirstAudit.ts` | CSV diagnóstico (`etlExcelFirstMerge` + `etlOperationalAnalysis`) |

**Orden pipeline global (sin cambiar en Etapa Contract-first):** Truckflow → clasificación Workbench (`finalCsvRows` / `classifiedJourneys`) → `runMovimientosContratoIntegration` → KPI/scatter. **No** Excel → clasificar → Power BI todavía.

**Separado de:** `truckPlateRegistryFilter.ts` / `server/truck-plate-registry*` = catálogo manual de **exclusión/inclusión** de patentes, no contratos comerciales.

**Qué falta para Excel-first completo:** invertir orden (merge antes de clasificar), alimentar `circuitEtlV2` / `powerBiEtlExportBuilder` con filas conciliadas, carga Excel en CLI/servidor sin UI.

---

### Riesgos de duplicación (no corregidos en Etapa 1)

| Tema | Dónde | Riesgo |
|------|--------|--------|
| Cámaras traseras | `rearCameraFilter.ts` vs `etlWorkbench/etlRearDevices.ts` | Listas alineadas por diseño, pero dos módulos |
| LPR | Workbench (`LPR_MALFUNCTION` estricto) vs alertas en varios servicios | Criterios distintos según ruta |
| Taxonomía circuito | `PreliminaryCircuitClassification` vs `ClassifiedOperationalCircuit` (v2) vs flags comité | Tres vocabularios |
| Rear filter en comité | `realCommitteePipeline` usa `rearCameraFilter` | OK si se mantiene sync con ETL Workbench |
| `buildCleanRealDataset` | Usa preliminar + filtros | Puede divergir de salida v2 si se comparan sin cuidado |

---

## Capas y archivos

Leyenda de categoría: **núcleo** | **soporte** | **diagnóstico** | **exportación** | **analytics**

### Tipos — núcleo

| Archivo | Qué hace | Categoría |
|---------|----------|-----------|
| `realJourneyEvents.types.ts` | DTO de eventos, journeys reconstruidos, tipos de clasificación preliminar | núcleo |

### Extract / API — núcleo + soporte

| Archivo | Qué hace | Categoría |
|---------|----------|-----------|
| `realTruckflowApi.ts` | `fetch` journey/alert, parseo crudo → DTO, URLs API | núcleo |
| `realJourneyEventsDataSource.ts` | Origen API/archivo, URLs list, carga unificada | núcleo |
| `truckflowRawJourneyStats.ts` | Conteos `journeyUid` en JSON crudo por día | soporte |

### Normalización — núcleo

| Archivo | Qué hace | Categoría |
|---------|----------|-----------|
| `argentinaPlate.ts` | Formato patente AR | núcleo |
| `realJourneyEventPlate.ts` | Enriquecimiento `normalizedPlate` / `isValidPlate` | núcleo |
| `realEventNormalization.ts` | Punto lógico (INGRESO, EGRESO, SL_*, etc.) y sitio | núcleo |
| `circuitPlateOcr.ts` | Similaridad OCR entre patentes | núcleo |
| `rearCameraFilter.ts` | Excluye dispositivos traseros / trazas de filtro | núcleo |
| `truckPlateRegistryFilter.ts` | Exclusiones por catálogo manual de patentes | soporte |

### Reconstrucción — núcleo

| Archivo | Qué hace | Categoría |
|---------|----------|-----------|
| `realJourneyEventsMapper.ts` | Agrupa por `journeyUid`, sitio Ricardone, preliminar al reconstruir | núcleo |
| `realJourneyCycleSplit.ts` | Parte ciclos por huecos temporales dentro del mismo UID | núcleo |

### Clasificación — núcleo

| Archivo | Qué hace | Categoría |
|---------|----------|-----------|
| `realPreliminaryCircuit.ts` | Clasificación preliminar operativa (muchos códigos DESCARTADO_*) | núcleo |
| `circuitEtlV2.ts` | Sesiones, fusión OCR controlada, matriz, CSV v2 | núcleo |
| `realCommitteePipeline.ts` | Pipeline comité: traseras, buckets temporales, ejecutivo | núcleo |

### Calidad / limpieza — soporte (afecta export, no redefine matriz v2)

| Archivo | Qué hace | Categoría |
|---------|----------|-----------|
| `realJourneyQuality.ts` | Flags de calidad por journey, sectores, días locales | soporte |
| `realTruckflowCleanDataset.ts` | Dataset “limpio” con índices de alertas y filtros opcionales | soporte |

### Diagnóstico — no obligatorio en pipeline

| Archivo | Qué hace | Categoría |
|---------|----------|-----------|
| `realPlateQuality.ts` | Rankings lecturas inválidas por cámara | diagnóstico |
| `realPlateAudit.ts` | Auditoría patentes / ventanas SL↔RIC | diagnóstico |
| `realAlertsInspector.ts` | Vista normalizada de alertas | diagnóstico / soporte export |
| `nearbyAlertResearch.ts` | Cruce alertas cercanas a journeys incompletos | diagnóstico |
| `realIncompleteAnalysis.ts` | Análisis secuencias lógicas faltantes | diagnóstico |
| `realJourneyDepurationMap.ts` | Mapa de depuración por journey | diagnóstico |
| `realCameraCoverage.ts` | Cobertura sector/dispositivo | diagnóstico |
| `liveCameraDiagnostics.ts` | Diagnóstico cámara / tiempos operativos live | diagnóstico |

### Exportación

| Archivo | Qué hace | Categoría |
|---------|----------|-----------|
| `powerBiEtlExportBuilder.ts` | CSV comité + debug, nombres ZIP, `zipPowerBiNamedCsvSync` (puro) | exportación |
| `powerBiBrowserDownload.ts` | `trigger*Download*`, `downloadPowerBiNamedCsvZipSync` | exportación (browser) |
| `powerBiEtlExport.ts` | Barrel de compatibilidad (reexporta builder + browser) | exportación |

### Analytics (posterior a clasificación)

| Archivo | Qué hace | Categoría |
|---------|----------|-----------|
| `analyticsKpi.ts` | KPIs estadía, flujo, percentiles (`HistoricalTrip`) | analytics |
| `saturationAnalytics.ts` | Saturación por sector / buckets | analytics |
| `truckflowEventosPresentation.ts` | Filtros presentación eventos Ricardone | analytics / presentación |

### Tests (misma carpeta)

| Archivo | Cubre |
|---------|--------|
| `circuitEtlV2.test.ts` | Motor v2 |
| `circuitPlateOcr.test.ts` | OCR |
| `realJourneyCycleSplit.test.ts` | Split ciclos |
| `powerBiEtlExport.test.ts` | Export CSV |
| `truckflowRawJourneyStats.test.ts` | Stats crudo |
| `truckPlateRegistryFilter.test.ts` | Registro patentes |

---

## Qué no tocar si solo trabajás clasificación

Evitar cambios en salvo necesidad explícita:

- `powerBiEtlExport.ts` (salvo headers/export naming acordado)
- `analyticsKpi.ts`, `saturationAnalytics.ts`, `truckflowEventosPresentation.ts`
- Diagnósticos (`realPlateQuality`, `realIncompleteAnalysis`, `liveCameraDiagnostics`, etc.)
- `src/features/real-truckflow/etlWorkbench/*` si el ticket es solo `circuitEtlV2` / preliminar / comité

Sí podés tocar con foco:

- `circuitEtlV2.ts`, `realPreliminaryCircuit.ts`, `realCommitteePipeline.ts`
- Soporte directo: `realEventNormalization.ts`, `circuitPlateOcr.ts`, `rearCameraFilter.ts`, `realJourneyEventsMapper.ts`, `realJourneyCycleSplit.ts`

---

## Uso de navegador / entorno Vite (mezcla con backend lógico)

| Archivo | Función / mecanismo | Motivo | Recomendación futura |
|---------|---------------------|--------|----------------------|
| `powerBiBrowserDownload.ts` | `triggerAnchorDownloadZip` (interno), `triggerSinglePowerBiCsvDownload`, `triggerCommitteeCsvDownloadsSync`, `triggerBrowserDownloadsSequential`, `triggerPowerBiDebugDownloadsSequential`, `downloadPowerBiNamedCsvZipSync` | `Blob`, `URL.createObjectURL`, `document`, `a.click()`, `showSaveFilePicker` | **Etapa 2 hecho:** solo importar este módulo desde UI |
| `powerBiEtlExportBuilder.ts` | `buildCommitteePowerBi*`, `zipPowerBiNamedCsvSync`, `buildPowerBiZipDownloadName` | Sin DOM — apto CLI | Import preferido para `scripts/run-truckflow-transform-local` (Etapa 4) |
| `realTruckflowApi.ts` | `resolveRealTruckflowApiOrigin` | `import.meta.env` (proxy Vite `/journey-api`) | Inyectar `baseUrl` desde CLI/servidor Node |
| `realJourneyEventsDataSource.ts` | `resolveJourneyEventApiOrigin` | Igual | Igual |
| `realTruckflowApi.ts` | `journeyDtoListFromRawExtractedRowsChunked`, `fetchJourneyEvents` | `yieldToBrowser()` entre chunks | En Node usar parseo sin yield o `setImmediate` |
| `realJourneyEventPlate.ts` | `annotateRealJourneyEventsWithPlateFieldsChunked` | `yieldToBrowser()` | Versión sync para CLI |
| `realJourneyEventsDataSource.ts` | `parsePayloadToJourneyEvents` | `yieldToBrowser()` | Idem |
| `src/utils/yieldToBrowser.ts` | (dependencia) | `requestAnimationFrame` en browser | No importar desde rutas CLI |

**Falsos positivos `window`:** parámetros `windowMs` en `realPlateAudit.ts`, `realPreliminaryCircuit.ts`, `saturationAnalytics.ts`, `liveCameraDiagnostics.ts` — son ventanas temporales en ms, no DOM.

**Fuera del listado núcleo pero browser:** `src/services/live/liveExport.ts` (descargas), `logisticsDataSource.ts` (`localStorage`).

---

## Flujo lógico recomendado (servicios)

```
JSON/API crudo
  → realTruckflowApi / realJourneyEventsDataSource
  → realJourneyEventPlate + argentinaPlate
  → realEventNormalization
  → realJourneyEventsMapper (+ realJourneyQuality, realPreliminaryCircuit al reconstruir)
  → [opcional] realJourneyCycleSplit
  → circuitEtlV2 y/o realCommitteePipeline
  → realTruckflowCleanDataset (filtros)
  → powerBiEtlExport
  → analyticsKpi / saturationAnalytics (otro dominio de entrada)
```

Extract en disco (Node): `server/truckflow-local-server.mjs` → `data/truckflow/YYYY-MM-DD/*.json` (ver `docs/TRUCKFLOW_TRANSFORM_BACKEND_USAGE.md`).

---

## Barrels (Etapa 1)

| Módulo | Ruta |
|--------|------|
| Índice | `src/services/truckflowTransform/index.ts` |
| Por capa | `types.ts`, `extract.ts`, `normalize.ts`, `reconstruct.ts`, `classify.ts`, `quality.ts`, `diagnostics.ts`, `export.ts`, `analytics.ts` |

Import opcional:

```ts
import { buildCircuitEtlV2CsvBundle } from '@/services/truckflowTransform/classify'
// equivalente histórico:
import { buildCircuitEtlV2CsvBundle } from '@/services/circuitEtlV2'
```
