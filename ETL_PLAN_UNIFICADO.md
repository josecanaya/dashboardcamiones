# Plan ETL unificado — Datos reales Truckflow

> **Objetivo:** un solo proceso, pocas salidas útiles, reutilizar al máximo lo que ya existe.  
> **Principio:** no sumar capas ni CSVs; **consolidar** dos pipelines que hoy compiten (Workbench vs Comité/API).

---

## 1. Qué buscamos (en tus palabras)

| Fase | Qué debe pasar |
|------|----------------|
| **Extract** | Descargar de la API (vía servidor local) por ventana elegida (día / 3 días / semana). Eventos y alertas **por separado** en `data/truckflow/YYYY-MM-DD/`. |
| **Transform — eventos** | Enriquecer → agrupar journeys → clasificar en **completos**, **incompletos** (≤2 lecturas), **anómalos** (>2 lecturas pero bajo puntaje o secuencia ilógica) → cruzar con alertas no-LPR para merge/sugerencias. |
| **Transform — alertas** | Separar **LPR** (diagnóstico cámara) vs **operativas** (merge con eventos huérfanos). |
| **Load / Export** | Pocos archivos finales (CSV/JSON) listos para métricas Power BI / comité — **no 10+ CSVs sueltos**. |

---

## 2. Estado actual (qué ya tenemos y qué sobra)

### 2.1 Extract — **rescatar tal cual**

| Pieza | Archivo | Estado |
|-------|---------|--------|
| UI descarga | `ExtraccionDatosTab.tsx` | OK: semana actual/anterior, 00:00–23:59 batch, ventana parcial día a día |
| Cliente HTTP | `truckflowLocalServerApi.ts` | OK |
| Servidor local | `server/truckflow-local-server.mjs` | OK: `event-list.json` + `alert-list.json` por día |
| Carga en memoria | `EtlWorkbenchContext.loadLocalPeriod` | OK |

**Pequeño ajuste futuro (sin cambiar arquitectura):** preset “últimos 3 días” además de semana actual/anterior. La mecánica ya existe (`postTruckflowExportPeriod`).

### 2.2 Transform — **dos motores en paralelo (problema raíz)**

| Motor | Archivo | Produce | Problema |
|-------|---------|---------|----------|
| **Workbench** | `etlTransformPipeline.ts` | 13 CSV (`front_*`, `final_circuits`, …) | Merge solo sugerencias; `merged_journeys.csv` vacío |
| **Comité + v2** | `realCommitteePipeline.ts` + `circuitEtlV2.ts` | `clean_*`, `clean_circuits_v2`, merge real | Vive en otra ruta (`EtlExportTab`, API directa) |

**Duplicaciones a eliminar conceptualmente (no reimplementar):**

- Dos listas de cámaras traseras (`etlRearDevices.ts` vs `rearCameraFilter.ts`)
- Dos criterios LPR (`LPR_MALFUNCTION` estricto vs regex amplia)
- Dos taxonomías de circuito (`final_status` workbench vs `circuit_status` v2)
- Dos exports Power BI (`pb_*` vs `powerbi-comite_*.zip` con 10+ archivos)

### 2.3 Lo que **sí** rescatamos

| Módulo | Para qué |
|--------|----------|
| `finalCircuitScoring.ts` | Puntaje, `resolveFinalStatus`, ingreso/egreso operativo, flags calidad |
| `circuitEtlV2.ts` | Reconstrucción por fragmentos, merge fuzzy patente, matriz S0–S10 |
| `reconstructRealJourneysIncludingInvalidPlates` | Agrupación por `journeyUid` |
| `powerBiEtlExport.findRelatedOperationalEvent` | Cruzar alerta ↔ evento (30–120 min, device/sector) |
| `alignAlertsToSegments` (comité) | Alertas dentro del segmento temporal del journey |
| `powerBiLoad.consolidatePowerBiLoad` | Capa ejecutiva `pb_*` (pocos archivos estables) |
| `etlCsv.ts` / `etlCsvParse.ts` | Utilidades CSV |
| Servidor local + envelope JSON | Extract |

---

## 3. Pipeline objetivo (único)

```
┌─────────────────────────────────────────────────────────────────┐
│ EXTRACT (sin cambios de fondo)                                   │
│  API → server local → data/truckflow/YYYY-MM-DD/                 │
│    • event-list.json                                             │
│    • alert-list.json                                             │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGING (carga manual — ya existe)                               │
│  Análisis local → eventos[] + alertas[] en EtlWorkbenchContext   │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ TRANSFORM (un solo runEtlTransform unificado)                    │
│                                                                  │
│  A) Normalizar front/rear (una sola lista trasera)               │
│  B) Rama EVENTOS → journeys → clasificar                         │
│  C) Rama ALERTAS → LPR vs operativas                             │
│  D) Cruzar alertas operativas ↔ journeys huérfanos / incompletos │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ LOAD / EXPORT (máx. 6–8 artefactos finales)                      │
│  pb_* consolidado + opcional JSON manifiesto                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Criterios unificados de clasificación (eventos / journeys)

Alinear tu definición con código existente:

| Bucket tuyo | Regla operativa propuesta | Mapeo código actual |
|-------------|---------------------------|---------------------|
| **Completo puro** | Secuencia coherente + puntaje alto + ingreso/egreso operativos OK | `final_status` ∈ `circuito_completo`, `circuito_probable` **y** `reliability_score` ≥ umbral (ej. 70) **y** sin flags graves | v2: `COMPLETO_CONFIRMADO` / `COMPLETO_RECONSTRUIDO` |
| **Incompleto** | **≤ 2 lecturas frontales** en el journey (post-filtro trasera) | Nuevo criterio explícito en transform (hoy se mezcla con `incompleto_revision`) | v2: `INCOMPLETO_*` con `event_count ≤ 2` |
| **Anómalo** | **> 2 lecturas** pero puntaje bajo **y/o** secuencia ilógica (saltos, repetición mismo sector, orden temporal roto) | `reliability_score` < umbral **o** flags `incomplete_sequence`, `suspicious_duplicate` | v2: `ANOMALIA`, `VARIACION_OPERATIVA` dudosa |

**Puntaje:** reutilizar `computeJourneyReliability` + desglose v2 (`circuit_score_debug`) — **no inventar otro score**.

**Secuencia ilógica:** reutilizar `sequencesComplementary` / matriz en `circuitEtlV2` — **no nuevo algoritmo**.

---

## 5. Salidas del Transform (mínimas, por rama)

### 5.1 Rama EVENTOS — de muchos CSV a **4 + debug opcional**

| # | Archivo | Contenido | Origen actual |
|---|---------|-----------|---------------|
| E1 | `events_front.csv` | Eventos operativos (front) enriquecidos | `front_events.csv` |
| E2 | `journeys_all.csv` | Un journey por fila: uid, patente, secuencias, conteos, `preliminary_code`, score | `clean_journeys` + `classified_circuits` **fusionados** |
| E3 | `journeys_completos.csv` | Subset bucket completo | filtro sobre E2 |
| E4 | `journeys_incompletos.csv` | ≤2 lecturas front | filtro sobre E2 |
| E5 | `journeys_anomalos.csv` | >2 lecturas, bajo score / secuencia mala | filtro sobre E2 |
| E6 | `journey_merge_applied.csv` | Merge **real** (no stub) | reemplaza `merged_journeys` vacío → salida de `circuitEtlV2` `reconstructed_from_fragments` |

**Eliminar / no exportar por defecto:** `rear_events`, `unclassified_journeys`, `rear_only_journeys_debug` (solo modo debug DEV).

### 5.2 Rama ALERTAS — **2 archivos operativos + 1 LPR**

| # | Archivo | Contenido | Origen actual |
|---|---------|-----------|---------------|
| A1 | `alerts_lpr.csv` | Solo `LPR_MALFUNCTION`: id, deviceCode, sectorCode, camera_type, occurredAt, patente OCR, payload | filtro de `front_alerts` + columnas de `camera_lpr_status` |
| A2 | `alerts_operativas.csv` | Alertas **no** LPR, listas para merge | `front_alerts` − LPR |
| A3 | `alerts_matched.csv` | Operativas con match a evento/journey (`has_related_event`, `etl_status`, `etl_reason`) | lógica `findRelatedOperationalEvent` + `alignAlertsToSegments` |

**Criterio LPR único:** `alertCode === 'LPR_MALFUNCTION'` (como En vivo y workbench). Sin regex alternativa en producción.

### 5.3 Cruzar alertas ↔ journeys huérfanos

Flujo propuesto (reutilizando paso 4 workbench + v2):

1. **Huérfanos** = journeys en `incompletos` + `anomalos` sin match alerta en A3.
2. **Candidatos merge** = alerta operativa sin journey + patente similar (≥0.8) a journey de **alto puntaje** en ventana ±120 min — hoy: `journey_merge_candidates.csv` (solo sugerencias).
3. **Decisión:** adoptar merge **real** de `circuitEtlV2` (fuzzy) para los casos aprobados; escribir en `journey_merge_applied.csv`.
4. **No** mantener O(n²) de 2500×2500 en UI productiva; cap bajo o solo sobre huérfanos.

---

## 6. Load / Export — paquete final para métricas

**Meta: 6 archivos `pb_*` + manifiesto** (ya definidos en `powerBiLoad.ts`, consolidar ahí):

| Archivo | Uso métricas |
|---------|--------------|
| `pb_committee_summary.csv` | KPIs globales del período (1 fila o pocas) |
| `pb_final_circuits.csv` | Tabla principal comité: circuitos clasificados |
| `pb_camera_committee_status.csv` | Estado operativo por cámara |
| `pb_camera_lpr_analysis.csv` | **Nuevo nombre** de agregado LPR (desde A1, no duplicar `camera_lpr_status` + `pb_camera_status_general`) |
| `pb_alerts_operational.csv` | Alertas no-LPR matched (desde A3) |
| `pb_load_manifest.json` | Qué se generó, rango, reglas, conteos |

**Deprecar en producción:**

- ZIP debug de 10+ CSV (`powerBiEtlExport` legacy) → solo DEV o botón “export técnico”.
- Descarga suelta de 13 CSV en `TransformEtlTab` → reemplazar por “Export debug” colapsado.
- Pestaña `etl_export` duplicada → absorber en `Load / Export`.

**JSON opcional:** un solo `etl_result.json` con resumen + pointers a CSV (para automatización), no JSON por journey.

---

## 7. UI ETL simplificada (sin features nuevas)

| Pestaña | Rol |
|---------|-----|
| **Extracción** | Ventana + descarga (día / 3 días / semana) — ya casi listo |
| **Análisis local** | Cargar período desde disco |
| **Transform** | Un botón “Ejecutar transform” + resumen buckets (completos / incompletos / anómalos / LPR count) |
| **Load / Export** | Generar `pb_*` + ZIP |

**Quitar de la barra principal (o ocultar bajo “Diagnóstico DEV”):** Resumen legacy, Depuración, Incompletos, Export ETL duplicado, 13 botones CSV individuales.

**En vivo** queda arriba, fuera del ETL batch (correcto).

---

## 8. Plan de ejecución por fases (cuando implementemos)

### Fase 0 — Acuerdo (este documento)
- [ ] Validar umbrales: incompleto = ≤2 lecturas front; anómalo = >2 + score < X.
- [ ] Validar paquete final `pb_*` (6 archivos).
- [ ] Confirmar que LPR = solo `LPR_MALFUNCTION`.

### Fase 1 — Unificar filtros (bajo riesgo)
- [ ] Un solo módulo `rearCameraFilter` usado por workbench y comité.
- [ ] Un solo criterio LPR.
- [ ] Eliminar `mergeWindowHours` muerto o conectarlo al gap real.

### Fase 2 — Unificar Transform
- [ ] Un `runEtlTransform` que llame internamente a piezas de `circuitEtlV2` para merge real.
- [ ] Clasificación explícita en 3 CSV (completos / incompletos / anómalos).
- [ ] Split alertas A1 / A2 / A3.
- [ ] Reducir exports intermedio de 13 → 6 (+ debug opcional).

### Fase 3 — Unificar Load
- [ ] `LoadExportTab` solo genera `pb_*` desde salidas Fase 2.
- [ ] Deprecar `EtlExportTab` en UI normal.
- [ ] Documentar contrato en `powerbi-export/README.md`.

### Fase 4 — Limpieza
- [ ] Eliminar stubs (`merged_journeys` vacío).
- [ ] Eliminar paso 4 O(n²) si v2 cubre merge.
- [ ] Tests mínimos sobre conteos bucket con fixture 1 día conocido.

---

## 9. Qué **no** hacemos (evitar sobre-abundancia)

- No agregar más pestañas ni toggles de entorno (`VITE_*` de modo mock/comité).
- No duplicar scoring (un score, una taxonomía final + 3 buckets simples para el usuario).
- No mantener dos exports Power BI en paralelo en producción.
- No exportar raw + clean + v2 + pb para el mismo período salvo modo debug explícito.
- No sumar DSS / simulador / IFC a este flujo.

---

## 10. Referencia rápida de archivos clave

```
Extract:     ExtraccionDatosTab.tsx, truckflowLocalServerApi.ts, server/truckflow-local-server.mjs
Staging:     EtlWorkbenchContext.tsx, parseTruckflowJsonFiles.ts
Transform:   etlTransformPipeline.ts, finalCircuitScoring.ts, circuitEtlV2.ts, realCommitteePipeline.ts
Alert match: powerBiEtlExport.ts (findRelatedOperationalEvent), alignAlertsToSegments
Load:        powerBiLoad.ts, LoadExportTab.tsx, powerBiCommitteeExecutive.ts
Live (fuera): LiveCameraMonitor.tsx, liveExport.ts
```

---

## 11. Próximo paso contigo

Antes de tocar código, confirmar:

1. **Incompleto = ≤2 lecturas frontales** (¿contamos solo eventos válidos de patente o todas las lecturas?).
2. **Umbral anómalo:** ¿score < 50, < 60, u otro?
3. **Paquete final:** ¿6 CSV `pb_*` + ZIP es suficiente para Power BI?
4. **Merge automático:** ¿aplicamos merge fuzzy de v2 sin revisión manual, o solo sugerencias en CSV?

Con eso avanzamos **Fase 1** sin sumar archivos ni pantallas.
