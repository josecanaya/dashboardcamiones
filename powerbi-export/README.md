# Carpeta recomendada para archivos Power BI (contrato schema v2)

## Uso

1. En el dashboard, pestaña **Datos reales → Export ETL**, definí **fecha/hora inicial** y **fecha/hora final**.
2. Pulsá **Cargar datos del período** (consulta `/journey-event/list` y `/alert/list` con ese rango).
3. Revisá la tarjeta **Período cargado** y los avisos si hubo 0 eventos o 0 alertas.
4. Pulsá **Exportar CSV Power BI** (bundle completo) y guardá **siempre los archivos exportados en la misma descarga** en **esta misma carpeta** (o en cualquier carpeta fija que use tu modelo). La cantidad de archivos depende del producto (`POWER_BI_ETL_FILENAMES`; hoy incluye capa legacy + **circuitos ETL v2**).

Los nombres legacy son **fijos** (no renombrar si querés que el modelo BI siga funcionando sin cambiar parámetros). Los nuevos (`*_v2`, debug) también conviene respetarlos:

| Archivo | Rol en el modelo |
|---------|------------------|
| `raw_events_api.csv` | Hechos crudos API (Ricardone filtrado por sitio en la app). |
| `raw_alerts_api.csv` | Alertas crudas tal cual la consulta vigente. |
| `clean_events.csv` | Eventos tras capa limpia + metadatos comité. |
| `clean_alerts.csv` | **Todas las alertas operativas** del comité (`alertsAlignedToSegments`): una fila por alerta después de filtros traseros; columnas nuevas incl. `has_related_event`, payloads y `etl_*`. Igual cardinalidad que `etl_summary.clean_alerts_count`. |
| **`alert_summary.csv`** | Agregación por `alert_code` + `sector_code` + `device_code`: conteos y primera/última ocurrencia (Power BI alertas por tipo/cámara/sector). |
| **`clean_circuits.csv`** | Circuitos por `journey_uid` (contrato anterior; KPIs legacy). |
| **`clean_circuits_v2.csv`** | **Circuitos reconstruidos** (`reconstructed_journey_id`, scoring, `circuit_status`, `confidence`, etc.) — entrada recomendada para análisis operativo sin depender solo de `journey_uid`. |
| **`clean_events_v2.csv`** | Hechos por evento enlazados a `reconstructed_journey_id`. |
| **`etl_quality_summary_v2.csv`** | Métricas del ETL de circuitos (incluye `reconstruction_rate`, conteos por estado). |
| `incompletos_por_motivo.csv` | Diagnóstico por bucket de incompletos. |
| `reconstructed_from_fragments.csv` | Fusiones por patente/site/ventana. |
| `circuit_score_debug.csv` | Descomposición de score por sesión reconstruida. |
| **`camera_diagnostics.csv`** | **Misma lógica que la vista cámara por cámara**: métricas por `device_code` + `sector_code` (estado sugerido, LPR, última lectura, etc.). |
| **`etl_summary.csv`** | **Una fila** con rango seleccionado (`selected_*`, `query_*`), `generated_at`, conteos raw/operativo/limpio y columnas extendidas para **tarjetas de estado general**. |

## Contrato de versión

- `schema_version` en `etl_summary.csv` y la constante `POWER_BI_ETL_SCHEMA_VERSION` en código deben coincidir.
- Si cambian **orden o nombre de columnas** en cualquier CSV, hay que **subir la versión del esquema** y actualizar el modelo Power BI.

## Próximas páginas sugeridas en Power BI

- **Estado general** → `etl_summary` + KPIs agregados desde `clean_circuits` / `camera_diagnostics`.
- **Cámara por cámara** → `camera_diagnostics` (columnas `device_code`, `sector_code`, `suggested_status`, `lpr_per_100_events`, …).
- **Alertas y calidad LPR** → **`clean_alerts`** (fact table operativa por alerta), **`alert_summary`**, `raw_alerts_api`, columnas LPR/eventos en `clean_events`.
- **Circuitos operativos reconstruidos** → **`clean_circuits_v2`** + **`clean_events_v2`** + **`etl_quality_summary_v2`** (circuitos fusionados por patente/site/ventana y scoring).
- **Circuitos preliminares / journey UID** → **`clean_circuits`** cuando el modelo aún usa el contrato anterior.
- **DSS vs Truckflow** → placeholder en app; cuando exista CSV DSS, añadir al mismo flujo y relacionar por patente/tiempo.

Esta carpeta está en el repo para **documentación**; los CSV reales los genera el navegador y los guardás vos localmente.
