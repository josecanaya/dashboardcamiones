# Contrato Power BI / comité — ETL Truckflow

El usuario final (comité, Power BI) **solo debe consumir** estos archivos:

| Archivo | Uso |
|---------|-----|
| `pb_committee_summary.csv` | Resumen ejecutivo del período |
| `pb_final_circuits.csv` | Circuitos finales clasificados |
| `pb_circuit_summary.csv` | Resumen ejecutivo de circuitos (3 categorías comité + desglose técnico legacy) |
| `pb_anomalies.csv` | Subset de circuitos anómalos |
| `pb_camera_committee_status.csv` | Estado operativo por cámara |
| `pb_camera_lpr_analysis.csv` | Diagnóstico LPR por cámara (`LPR_MALFUNCTION`) |
| `pb_alerts_operational.csv` | Alertas operativas cruzadas con eventos/journeys |
| `pb_load_manifest.json` | Manifiesto de carga y metadatos |

## Análisis de tiempos por circuito (técnico / KPI)

Exportados en Transform y consolidados en Load/Export (no son archivos de comité por defecto):

| Archivo | Uso |
|---------|-----|
| `circuit_timing_summary.csv` | Una fila por circuito ejecutivo: estadísticas del tiempo total del recorrido |
| `circuit_timing_journeys.csv` | Una fila por journey analizable: auditoría del cálculo |
| `segment_timing_kpi.csv` | Agregado por tramo/transición dentro de cada circuito |

### Columnas — `circuit_timing_summary.csv`

| Columna | Descripción |
|---------|-------------|
| `executive_circuit_code` | Código ejecutivo (R1, R5, R7, …) |
| `circuit_name` | Nombre legible del circuito |
| `executive_status` | Estado ejecutivo dominante en la muestra (`VALIDO`, …) |
| `n_journeys` | Cantidad de journeys analizables del circuito |
| `mean_total_min` | Promedio del tiempo total (min) |
| `std_total_min` | Desviación estándar del tiempo total |
| `median_total_min` | Mediana |
| `p90_total_min` | Percentil 90 |
| `min_total_min` / `max_total_min` | Extremos observados |
| `q1_total_min` / `q3_total_min` / `iqr_total_min` | Cuartiles e IQR |
| `min_plate` / `max_plate` | Patentes del menor y mayor tiempo total |

Población: journeys con `committee_group = COMPLETOS`, circuito ejecutivo identificado, ≥2 eventos frontales útiles y duración total **mayor a 3 min** y hasta 24 h.

Uso típico en Power BI (dispersión): eje X `mean_total_min`, eje Y `std_total_min`, tamaño `n_journeys`, detalle `executive_circuit_code`.

### Columnas — `circuit_timing_journeys.csv`

| Columna | Descripción |
|---------|-------------|
| `journey_id` | UID del journey |
| `plate` | Patente |
| `executive_circuit_code` | Circuito ejecutivo |
| `circuit_name` | Nombre del circuito |
| `executive_status` | Estado ejecutivo del journey |
| `valid_detail` | `COMPLETO` o `DEDUCIDO` si aplica |
| `start_time` / `end_time` | Primer y último evento frontal útil |
| `total_duration_min` | Diferencia en minutos |
| `event_count` | Cantidad de eventos frontales útiles |

Opcional técnico: `etl_result.json` (manifiesto consolidado del transform).

## Columnas clave — `pb_final_circuits.csv`

Además de estado/score del circuito, incluye cruce operativo:

| Columna | Descripción |
|---------|-------------|
| `matrix_final_status` | Estado técnico de matriz: COMPLETO / DEDUCIDO / INCOMPLETO / ANOMALO |
| `committee_group` | **Categoría comité (v10):** `COMPLETOS` · `VARIACIONES_OPERATIVAS` · `ANOMALIAS` |
| `committee_reason` | Motivo legible para comité (`CIRCUITO_COMPLETO`, `RECALADO_CONTEMPLADO`, `CAMARAS_SLZ_S1_S5_S7_PENDIENTES`, …) |
| `operational_variation_type` | Tipo de variación operativa (`RECALADO`, `DOBLE_PASO_BALANZA`, …) o vacío |
| `analysis_scope` | `RICARDONE` · `SAN_LORENZO_INTERNO` · `TRANSILE_EXTERNO` · `MIXTO` · `UNKNOWN` |
| `strong_point_source` | `RICARDONE` · `SAN_LORENZO` · `LIQUIDO` · vacío |
| `show_in_committee` | Si el journey debe mostrarse en la presentación |
| `show_as_exact_circuit` | Si se puede mostrar un circuito exacto (false si ambiguo o SL pendiente) |
| `candidate_circuits` | Circuitos candidatos unidos por `\|` cuando no hay asignación exacta |
| `missing_key_cameras` | Cámaras clave faltantes (p. ej. SLZ S1/S5/S7 pendientes) |
| `executive_status` | Capa técnica interna: VALIDO / INCOMPLETO / ANOMALO / NO_EVALUABLE / NO_DIFERENCIABLE |
| `executive_reason` | Motivo ejecutivo (`CIRCUITO_COMPLETO`, `CIRCUITO_DEDUCIDO_VALIDO`, `CONFIG_ERROR_MISSING_SEQUENCE`, etc.) |
| `valid_detail` | Si `executive_status = VALIDO`: COMPLETO o DEDUCIDO |
| `executive_bucket` | Columna técnica legacy, preservada por compatibilidad |
| `matched_circuit_code` | Código de circuito técnico usado para la matriz |
| `sequence_respected` | Si respeta la secuencia técnica evaluada |
| `coverage_percent` | Cobertura configurada para el circuito habilitado |
| `has_strong_point` | Si el circuito tiene punto fuerte instalado |
| `enabled_for_classification` | Si el circuito está habilitado para clasificación productiva |
| `sequence_configured` | Si existe secuencia configurada para evaluar productivamente |
| `operationalAlertCount` | Cantidad de alertas operativas asociadas al journey |
| `hasInvalidRoute` | Tiene alerta `INVALID_ROUTE` |
| `hasInvalidJourneyStart` | Tiene alerta `INVALID_START_JOURNEY` (API) |
| `operationalAlertCodes` | Códigos unidos por `\|` |
| `firstOperationalAlertAt` | Primera alerta operativa asociada |
| `operationalAlertSectors` | Sectores de alertas asociadas |
| `possibleSystemCutReason` | `INVALID_JOURNEY_START_AT_NON_ENTRY_SECTOR`, `INVALID_ROUTE_DURING_JOURNEY`, `OPERATIONAL_ALERT_WITHOUT_EVENT_MATCH`, `NONE` |

Filtros típicos en Power BI:

- **Comité (v10):** `committee_group = COMPLETOS` | `VARIACIONES_OPERATIVAS` | `ANOMALIAS`
- Completos deducidos: `committee_group = COMPLETOS` AND `committee_reason` contiene `DEDUCIDO`
- Variaciones operativas: `committee_group = VARIACIONES_OPERATIVAS`
- Anomalías no evaluables: `committee_group = ANOMALIAS` AND `executive_status = NO_EVALUABLE`
- Válidos productivos (legacy): `executive_status = VALIDO`
- Deducidos válidos: `executive_status = VALIDO` AND `valid_detail = DEDUCIDO`
- Incompletos con mal inicio: `executive_status = INCOMPLETO` AND `hasInvalidJourneyStart = true`
- Anómalos con ruta inválida: `executive_status = ANOMALO` AND `hasInvalidRoute = true`
- No evaluables por configuración: `executive_status = NO_EVALUABLE` AND `executive_reason = CONFIG_ERROR_MISSING_SEQUENCE`

## Métricas clave — `pb_circuit_summary.csv`

| Columna | Descripción |
|---------|-------------|
| `total_journeys` | Total de circuitos finales |
| `committee_completos` | Journeys con `committee_group = COMPLETOS` |
| `committee_variaciones_operativas` | Journeys con `committee_group = VARIACIONES_OPERATIVAS` |
| `committee_anomalias` | Journeys con `committee_group = ANOMALIAS` |
| `valid_journeys` | COMPLETO + DEDUCIDO como circuitos válidos (desglose técnico legacy) |
| `incomplete_journeys` | Eventos insuficientes o falta de información |
| `anomalous_journeys` | Evaluable con eventos suficientes que no respeta secuencia |
| `non_evaluable_journeys` | Sin cobertura/punto fuerte/secuencia configurada |
| `valid_complete` | Válidos con `matrix_final_status = COMPLETO` |
| `valid_deduced` | Válidos con `matrix_final_status = DEDUCIDO` |
| `non_evaluable_by_coverage` | No evaluables por cobertura o punto fuerte |
| `non_evaluable_missing_sequence` | No evaluables por secuencia no configurada |
| `anomalous_no_respeta_secuencia` | Anómalos por secuencia ilógica |

## Columnas clave (debug) — `pb_alerts_operational.csv`

| Columna | Descripción |
|---------|-------------|
| `alertId` | ID alerta |
| `alertCode` | Código (≠ `LPR_MALFUNCTION`) |
| `matchedEventId` | Evento físico relacionado (si hay match) |
| `matchedJourneyUid` | Journey reconstruido asociado |
| `matchedCircuitCode` | `preliminary_code` del journey |
| `matchedBucket` | Bucket ejecutivo del journey |
| `matchStrategy` | `journey_uid_exact`, `plate_sector_device_time`, `plate_sector_time`, `plate_within_journey_window`, `none` |
| `matchConfidence` | `high` / `medium` / `low` / `none` |

## Columnas clave (debug) — `pb_committee_summary.csv`

Métricas agregadas de cruce operativo:

| Columna | Descripción |
|---------|-------------|
| `journeys_with_operational_alerts` | Journeys finales con ≥1 alerta operativa |
| `journeys_with_invalid_route` | Journeys con `INVALID_ROUTE` |
| `journeys_with_invalid_journey_start` | Journeys con `INVALID_START_JOURNEY` |
| `incompletos_with_invalid_journey_start` | Bucket INCOMPLETO + mal inicio |
| `anomalos_with_invalid_route` | Bucket ANOMALO + ruta inválida |

## Todo lo demás es debug

No usar en comité por defecto:

- CSV del workbench (`front_events`, `rear_events`, `classified_circuits`, …)
- `merge_candidates_debug.csv` / `journey_merge_candidates.csv` (solo sugerencias)
- `rear_only_journeys_debug`, `unclassified_journeys`
- Archivos `pb_*` técnicos adicionales

## Criterios productivos unificados

- **Cámaras traseras:** `etlRearDevices.ts` (fuente única).
- **Alertas LPR:** `alertCode === 'LPR_MALFUNCTION'`.
- **Alertas operativas:** todo lo demás (frontales, post-filtro trasera).
- **Códigos especiales:** `INVALID_ROUTE`, `INVALID_START_JOURNEY` (alias documental `INVALID_JOURNEY_START`).
- **Capa comité (v10):** `committee_group` — COMPLETOS · VARIACIONES_OPERATIVAS · ANOMALIAS. PROBABLE / NO_EVALUABLE / NO_DIFERENCIABLE se mapean a ANOMALIAS salvo variación operativa contemplada.
- **Capa técnica:** `matrix_final_status` conserva COMPLETO · DEDUCIDO · INCOMPLETO · ANOMALO.
- **Capa ejecutiva:** `executive_status` usa VALIDO · INCOMPLETO · ANOMALO · NO_EVALUABLE · NO_DIFERENCIABLE. DEDUCIDO se suma dentro de VALIDO y comité COMPLETOS.

## Flujo batch

```
API → servidor local → data/truckflow/YYYY-MM-DD/
  → Análisis local → runEtlTransform → Load/Export → pb_*
```

Versión reglas transform: `etl_transform_v10` — detalle completo en [`ETL_TRANSFORM_V9_RULES.md`](./ETL_TRANSFORM_V9_RULES.md) (sección v10).
