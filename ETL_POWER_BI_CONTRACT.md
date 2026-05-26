# Contrato Power BI / comité — ETL Truckflow

El usuario final (comité, Power BI) **solo debe consumir** estos archivos:

| Archivo | Uso |
|---------|-----|
| `pb_final_circuits.csv` | Circuitos finales clasificados |
| `pb_circuit_summary.csv` | Resumen operativo por estado de circuito |
| `pb_anomalies.csv` | Subset de circuitos anómalos |
| `pb_camera_lpr_analysis.csv` | Diagnóstico LPR por cámara (`LPR_MALFUNCTION`) |

Opcional técnico: `etl_result.json` (manifiesto consolidado del transform).

## Columnas clave — `pb_final_circuits.csv`

Además de estado/score del circuito, incluye cruce operativo:

| Columna | Descripción |
|---------|-------------|
| `executive_bucket` | COMPLETO / INCOMPLETO / ANOMALO / DEDUCIDO |
| `operationalAlertCount` | Cantidad de alertas operativas asociadas al journey |
| `hasInvalidRoute` | Tiene alerta `INVALID_ROUTE` |
| `hasInvalidJourneyStart` | Tiene alerta `INVALID_START_JOURNEY` (API) |
| `operationalAlertCodes` | Códigos unidos por `\|` |
| `firstOperationalAlertAt` | Primera alerta operativa asociada |
| `operationalAlertSectors` | Sectores de alertas asociadas |
| `possibleSystemCutReason` | `INVALID_JOURNEY_START_AT_NON_ENTRY_SECTOR`, `INVALID_ROUTE_DURING_JOURNEY`, `OPERATIONAL_ALERT_WITHOUT_EVENT_MATCH`, `NONE` |

Filtros típicos en Power BI:

- Incompletos con mal inicio: `executive_bucket = INCOMPLETO` AND `hasInvalidJourneyStart = true`
- Anómalos con ruta inválida: `executive_bucket = ANOMALO` AND `hasInvalidRoute = true`

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
- **Buckets:** COMPLETO · INCOMPLETO · ANOMALO · DEDUCIDO.

## Flujo batch

```
API → servidor local → data/truckflow/YYYY-MM-DD/
  → Análisis local → runEtlTransform → Load/Export → pb_*
```

Versión reglas transform: `etl_transform_v6` (cruce operativo alerta ↔ journey; bucket ejecutivo con tolerancia de secuencia).
