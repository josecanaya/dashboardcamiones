# Informe ETL Dashboard Truckflow

## 1) Resumen ejecutivo

El dashboard ya tiene un flujo ETL bastante completo para tu caso:

1. **Extract** desde API por rango de fechas/horas hacia JSON por día.
2. **Transform** con separación front/rear, LPR vs operativas, reconstrucción de journeys, clasificación de circuitos y cruce alerta↔journey.
3. **Load/Export** para consolidar días y emitir archivos `pb_*` para Power BI/comité.

Lo más importante: gran parte de tu objetivo ya está implementado, pero hay vacíos puntuales (normalización avanzada LPR contra patentes circulantes, merge final con alertas normalizadas por circuitos incompletos, y algo de deuda técnica por coexistencia de pipeline nuevo + legacy).

---

## 2) Cómo funciona hoy el proceso ETL (end-to-end)

## 2.1 Extract (API -> JSON por día)

- UI principal: `src/features/real-truckflow/tabs/ExtraccionDatosTab.tsx`
- Cliente API local: `src/features/real-truckflow/api/truckflowLocalServerApi.ts`
- Servidor local: `server/truckflow-local-server.mjs`

Flujo actual:

1. Se elige rango (fecha/hora, site).
2. Si es día completo (00:00-23:59), usa `postTruckflowExportPeriod()` (batch por días).
3. Si es parcial, usa `postTruckflowExportWindow()` día por día.
4. El servidor guarda:
  - `data/truckflow/YYYY-MM-DD/event-list.json`
  - `data/truckflow/YYYY-MM-DD/alert-list.json`
5. Luego `postTruckflowLoadLocalPeriod()` fusiona días en memoria para transform.

Esto cumple bien tu necesidad de **extracción por día** en JSON.

---

## 2.2 Staging / Carga en memoria

- Contexto: `src/features/real-truckflow/etlWorkbench/EtlWorkbenchContext.tsx`
- Parser JSON: `src/features/real-truckflow/etlWorkbench/parseTruckflowJsonFiles.ts`

Funciones clave:

- `loadLocalPeriod(startDate, endDate)`: trae todos los JSON del rango desde el servidor local.
- `loadJsonFiles(...)`: permite alternativa manual por archivos.
- Deduplicación:
  - Eventos: `journeyUid|id|occurredAt`
  - Alertas: `journeyUid|id|occurredAt|createdAt`
- Conversión a DTO:
  - `journeyDtoListFromRawExtractedRowsChunked`
  - `alertDtoListFromRawExtractedRows`

---

## 2.3 Transform (núcleo principal)

- Pipeline: `src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts`
- Scoring y estado final: `src/features/real-truckflow/etlWorkbench/finalCircuitScoring.ts`
- Cruce alertas operativas: `src/features/real-truckflow/etlWorkbench/etlOperationalAlertMatch.ts`
- Filtro rear: `src/features/real-truckflow/etlWorkbench/etlRearDevices.ts`

`runEtlTransform()` ejecuta 4 pasos:

### Paso 1: separación front/rear + export base

- Eventos y alertas se separan por cámara frontal/trasera.
- LPR se detecta con regla estricta: `alertCode === 'LPR_MALFUNCTION'`.
- Sale CSV de base:
  - `front_events`, `rear_events`
  - `front_alerts`, `rear_alerts`

### Paso 2: agregación cámara-tiempo (día/semana/día-noche)

- Construye `camera_lpr_status.csv` con:
  - `date`, `week`, `day_name`, `time_bucket`, `day_night`
  - `deviceCode`, `sectorCode`, `event_count`, `alert_lpr_count`
  - `lpr_alerts_per_100_events`, `status`
- Ya cubre tu pedido de medir **LPR malfunction vs cantidad de eventos por cámara** y si fue **día o noche**.

### Paso 3: journeys y circuitos

- Excluye journeys solamente traseros.
- Reconstruye journeys con front:
  - `reconstructRealJourneysIncludingInvalidPlates(...)`
- Clasifica:
  - `circuito_detectado`
  - `circuito_incompleto`
  - `sin_clasificar`
- Calcula confiabilidad (`computeJourneyReliability`) y estado final (`resolveFinalStatus`).
- También bucket ejecutivo:
  - `COMPLETO`, `INCOMPLETO`, `ANOMALO`, `DEDUCIDO`

### Paso 4: sugerencias de merge

- Genera candidatos por:
  - cercanía temporal
  - similitud de patente OCR simple
  - secuencia compatible
- Produce `journey_merge_candidates.csv` (sugerencias, no merge automático).

### Salidas clave del transform

- `final_circuits.csv`
- `alerts_operational.csv`
- `transform_summary.csv`
- más CSV de diagnóstico (debug)

---

## 2.4 Load/Export consolidado para Power BI

- UI: `src/features/real-truckflow/tabs/LoadExportTab.tsx`
- Consolidación: `src/features/real-truckflow/etlWorkbench/powerBiLoad.ts`
- Agregados cámara: `src/features/real-truckflow/etlWorkbench/powerBiCameraAggregates.ts`
- KPIs comité: `src/features/real-truckflow/etlWorkbench/powerBiCommitteeExecutive.ts`

Archivos productivos definidos:

- `pb_committee_summary.csv`
- `pb_final_circuits.csv`
- `pb_camera_committee_status.csv`
- `pb_camera_lpr_analysis.csv`
- `pb_alerts_operational.csv`
- `pb_load_manifest.json`

Esto está alineado con `ETL_POWER_BI_CONTRACT.md`.

---

## 3) Mapeo de tu necesidad vs estado actual

## 3.1 Lo que ya está cubierto

- Extraer eventos y alertas desde API.
- Filtrar por día (extract por día y carga por rango).
- Agrupar por semana en un único set consolidado (Load/Export por rango + `groupType=week`).
- Archivo general de alertas para Power BI (`front_alerts` y/o `pb_alerts_operational` según objetivo).
- Separación front/rear en eventos y alertas.
- Clasificación de journeys/circuitos en categorías operativas.
- Detección de incompletos y scoring.
- Métricas día/noche y tasa LPR por cámara.

## 3.2 Lo que falta para completar exactamente tu objetivo

1. **Normalización LPR avanzada contra patentes circulantes**
  - Hoy hay similitud OCR básica en el merge (`plateSimilarityScore` local en `etlTransformPipeline.ts`), pero no un proceso explícito de:
    - extraer lectura OCR desde descripción/payload de LPR,
    - normalizarla,
    - comparar contra universo de patentes válidas circulantes del período,
    - guardar mejor candidato + score + motivo.
2. **Merge final entre incompletos y alertas LPR normalizadas**
  - Hoy hay cruce fuerte con alertas operativas no-LPR (`alerts_operational`).
  - Falta archivo final dedicado de integración:
    - `incompletos + lpr_normalizadas` con clave de unión, score OCR y ventana temporal.
3. **Clasificación explícita de incompletos por “falta 1 o 2 eventos”**
  - Hay `missing_points_count`, `missing_expected_points_join` y `incompleto_revision`.
  - Falta una etiqueta explícita para negocio tipo:
    - `incompleto_falta_1`
    - `incompleto_falta_2`
    - `incompleto_falta_3+`
4. **JSON semanal único de salida analítica**
  - El flujo actual privilegia CSV.
  - JSON final existe como manifiesto (`pb_load_manifest.json`), pero no dataset semanal completo tipo `pb_weekly_bundle.json`.

---

## 4) Funciones importantes y para qué sirve cada una

## Extracción y carga

- `postTruckflowExportPeriod(...)`: descarga API por rango diario completo.
- `postTruckflowExportWindow(...)`: descarga por ventana horaria de un día.
- `postTruckflowLoadLocalPeriod(...)`: fusiona días guardados a memoria.
- `loadLocalPeriod(...)`: carga y convierte a DTO para transform.

## Transform principal

- `runEtlTransform(...)`: orquestador ETL completo.
- `isEtlRearCameraDevice(...)`: filtro único de cámaras traseras.
- `flattenAlertForEtlCsv(...)`: normaliza alertas para CSV.
- `isLprMalfunctionAlert(...)`: regla canónica LPR.
- `computeJourneyReliability(...)`: score por cobertura de plantilla esperada.
- `resolveFinalStatus(...)`: estado final técnico del circuito.
- `resolveExecutiveBucket(...)`: bucket ejecutivo para comité.

## Cruce de alertas operativas

- `accumulateOperationalAlertsMatch(...)`: match alerta↔journey.
- `findBestJourneyMatch(...)`: estrategia de matching por journeyUid, patente, sector/device y tiempo.
- `computeOperationalAlertCrossMetrics(...)`: KPIs de alertas en incompletos/anómalos.

## Consolidación para Power BI

- `consolidatePowerBiLoad(...)`: une múltiples días y genera `pb_*`.
- `buildCameraPowerBiAggregates(...)`: resúmenes cámara, day/night y sector.
- `buildCommitteeExecutiveCsvPack(...)`: KPIs ejecutivos consolidados.

---

## 5) Código duplicado, sobreescrito o con deuda técnica

## 5.1 Dos rutas de export conviviendo (nueva + legacy)

- Nueva: ETL Workbench + `LoadExportTab` + `powerBiLoad.ts` (ruta recomendada).
- Legacy: `EtlExportTab` + `usePowerBiExport` + `services/powerBiEtlExport.ts`.

Impacto:

- Duplicación de lógica y formatos de salida.
- Riesgo de inconsistencias de reglas entre ambos exports.

## 5.2 Duplicación de lógica OCR de patentes

- En `etlTransformPipeline.ts` hay implementación local:
  - `normalizePlateForSim`, `digitizePlateVariants`, `levenshtein`, `plateSimilarityScore`.
- También existe módulo dedicado:
  - `src/services/circuitPlateOcr.ts` con `normalizePlateStrict`, `weightedOcrLevenshtein`, `plateSimilarityScore`.

Impacto:

- Puede dar scores distintos según ruta.
- Mantenimiento difícil.

## 5.3 Parámetro no usado efectivamente

- `mergeWindowHours` está en input/context (`EtlWorkbenchContext`) pero `etlTransformPipeline.ts` usa constantes fijas (`MERGE_CANDIDATE_MAX_GAP_MINUTES`), no el valor recibido.

Impacto:

- Configuración engañosa para usuario/desarrollador.

## 5.4 Estados de cámara parecidos pero no idénticos

- Transform usa `Sin base de eventos`.
- Agregados Power BI usan `Sin base`.

Impacto:

- Inconsistencia semántica en reportes/filtros BI.

## 5.5 Artefactos debug mezclados con productivos

- En modo DEV se exponen muchos CSV intermedios.
- Está bien para diagnóstico, pero conviene blindar más fuerte el contrato productivo para evitar consumo accidental.

---

## 6) Propuesta concreta para cerrar lo que falta

1. **Crear capa `lpr_normalization.ts`**
  - Parsear lectura OCR desde `description/payload`.
  - Normalizar caracteres confusos (3/E, 5/S, O/Q/0, etc.).
  - Comparar contra patentes observadas en eventos frontales del período.
  - Persistir:
    - `ocr_raw`
    - `ocr_normalized`
    - `best_plate_match`
    - `similarity_score`
    - `match_confidence`
2. **Generar `lpr_malfunction_normalized.csv`**
  - Una fila por alerta LPR.
  - Columnas de tiempo, cámara, día/noche, OCR y match.
3. **Generar `incomplete_circuits_for_alert_merge.csv`**
  - Subset de `final_circuits` con bucket incompleto/anómalo relevante.
  - Claves de unión temporal y por cámara/patente.
4. **Generar `incomplete_vs_lpr_merge.csv`**
  - Resultado del merge entre 2 y 3.
  - Listo para visual en Power BI (estado de cámara y potencial causa).
5. **Unificar OCR**
  - Reusar `circuitPlateOcr.ts` en transform y remover implementación duplicada.
6. **Depurar ruta legacy progresivamente**
  - Mantenerla solo en DEV.
  - Declarar oficialmente `LoadExportTab + powerBiLoad` como único productivo.

---

## 7) Riesgos actuales

- Si se usa export legacy en paralelo al nuevo, pueden aparecer discrepancias de cifras.
- La ausencia de merge final con LPR normalizada limita análisis causal de fallas por cámara.
- Hay cobertura de tests para partes de scoring, pero faltan tests integrales del pipeline unificado end-to-end (extract->transform->load con fixtures reales).

---

## 8) Conclusión

El ETL ya está en buen nivel para operar y exportar a Power BI, incluyendo clasificación de circuits, separación front/rear y análisis LPR por cámara con dimensión día/noche.  
Para completar exactamente tu objetivo de diagnóstico operacional de LPR malfunction y merge con incompletos, falta cerrar la **normalización OCR avanzada**, el **merge final dedicado** y limpiar **duplicaciones legacy/OCR**.