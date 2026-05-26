# Contrato Power BI / comité — ETL Truckflow

El usuario final (comité, Power BI) **solo debe consumir** estos archivos:

| Archivo | Uso |
|---------|-----|
| `pb_committee_summary.csv` | Resumen ejecutivo del período |
| `pb_final_circuits.csv` | Circuitos finales clasificados |
| `pb_circuit_summary.csv` | Resumen ejecutivo de circuitos (`VALIDO`, `INCOMPLETO`, `ANOMALO`, `NO_EVALUABLE`) |
| `pb_anomalies.csv` | Subset de circuitos anómalos |
| `pb_camera_committee_status.csv` | Estado operativo por cámara |
| `pb_camera_lpr_analysis.csv` | Diagnóstico LPR por cámara (`LPR_MALFUNCTION`) |
| `pb_alerts_operational.csv` | Alertas operativas cruzadas con eventos/journeys |
| `pb_load_manifest.json` | Manifiesto de carga y metadatos |

Opcional técnico: `etl_result.json` (manifiesto consolidado del transform).

## Columnas clave — `pb_final_circuits.csv`

Además de estado/score del circuito, incluye cruce operativo:

| Columna | Descripción |
|---------|-------------|
| `matrix_final_status` | Estado técnico de matriz: COMPLETO / DEDUCIDO / INCOMPLETO / ANOMALO |
| `executive_status` | Capa ejecutiva: VALIDO / INCOMPLETO / ANOMALO / NO_EVALUABLE |
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

- Válidos productivos: `executive_status = VALIDO`
- Deducidos válidos: `executive_status = VALIDO` AND `valid_detail = DEDUCIDO`
- Incompletos con mal inicio: `executive_status = INCOMPLETO` AND `hasInvalidJourneyStart = true`
- Anómalos con ruta inválida: `executive_status = ANOMALO` AND `hasInvalidRoute = true`
- No evaluables por configuración: `executive_status = NO_EVALUABLE` AND `executive_reason = CONFIG_ERROR_MISSING_SEQUENCE`

## Métricas clave — `pb_circuit_summary.csv`

| Columna | Descripción |
|---------|-------------|
| `total_journeys` | Total de circuitos finales |
| `valid_journeys` | COMPLETO + DEDUCIDO como circuitos válidos |
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
- **Capa técnica:** `matrix_final_status` conserva COMPLETO · DEDUCIDO · INCOMPLETO · ANOMALO.
- **Capa ejecutiva:** `executive_status` usa VALIDO · INCOMPLETO · ANOMALO · NO_EVALUABLE. DEDUCIDO se suma dentro de VALIDO.

## Flujo batch

```
API → servidor local → data/truckflow/YYYY-MM-DD/
  → Análisis local → runEtlTransform → Load/Export → pb_*
```

Versión reglas transform: `etl_transform_v6` (cruce operativo alerta ↔ journey; capa ejecutiva VALIDO/INCOMPLETO/ANOMALO/NO_EVALUABLE).
