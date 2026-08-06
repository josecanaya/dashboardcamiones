# Tablas canónicas por pregunta — runs/windows/<from>_<to>/tables/

> ⚠️ **SUPERSEDIDO por [NIVELES_ABCD.md](./NIVELES_ABCD.md) (modelo v14, 2026-08-03).**
> Las canónicas hoy son las tablas de los niveles C / D / E. Las que este
> documento nombra pasaron a ser **insumo o derivadas**: se siguen escribiendo,
> pero ninguna es fuente de verdad para una pregunta de negocio.
>
> Se conserva porque documenta **por qué** las tablas viejas se contradicen entre
> sí — que es la razón de ser del modelo de niveles. Para saber qué tabla usar
> hoy, ir a NIVELES_ABCD.md.

> Objetivo: **una pregunta = una tabla = una respuesta**, idéntica a lo que muestra el front.
> Auditoría hecha sobre la semana `2026-07-13_2026-07-19` (2026-07-20).

## Regla de oro

Cada pregunta de negocio tiene UNA tabla canónica. Las demás tablas que "también podrían responder"
están PROHIBIDAS para esa pregunta (abajo se documenta por qué: dan números distintos).

| Pregunta | Tabla canónica | Columna(s) clave | Prohibido usar (y por qué) |
|---|---|---|---|
| ¿Cuántos camiones/movimientos descargaron X producto? (Excel contrato) | `excel_operations_with_truckflow` | `product_normalized` / `resolved_product`, `platform_normalized` | `merged_truckflow_movimientos` (cuenta journeys, no movimientos: da 2.528 vs 2.643 para soja) |
| ¿Qué plataformas se usaron? | `excel_operations_with_truckflow` | `platform_normalized`, `plataforma_original` | — |
| ¿Cuántos movimientos SIN evidencia de cámaras? | `excel_operations_with_truckflow` | `matched_journey_uids` vacío / `no_truckflow_reason` | `movimientos_without_truckflow_match` (pase de merge distinto: 1.000 vs 934 — números no cuadran) |
| Clasificación ejecutiva / comité (completos, anomalías) | `final_circuits` | `executive_bucket` (COMPLETO/DEDUCIDO/INCOMPLETO/ANOMALO), `executive_anomaly_reason` | `debug_matrix_classification` (taxonomía intermedia: VALIDO/NO_DIFERENCIABLE ≠ buckets ejecutivos); `merged_truckflow_movimientos.executive_status` (**columna muerta**: 100% NO_EVALUABLE) |
| ¿Cuántos recorridos de cámara hubo? | `final_circuits` | filas = journeys clasificados | `clean_journeys_for_analysis` / `merged` (incluyen pre-filtrado: 5.670 vs 2.384) |
| Tiempos por circuito (KPI) | `circuit_timing_summary` (+ `circuit_timing_journeys` para detalle) | | `segment_timing_kpi` (vacía desde 2026-06-08 por cobertura de cámaras; solo mayo tiene datos) |
| Transiles externos | `transile_externo_operaciones` / `_summary` / `_ciclos` | | — |
| Aceite / líquidos | `liquid_movements_summary` + `liquid_movements_aceite_truckflow_excel` | | — |
| Detalle de un camión/journey | `final_circuits` (por patente) o tool `explain_journey` | | — |
| Movimientos crudos del Excel (auditoría) | `external_movimientos_contrato_normalized` | | Para conteos de negocio usar `excel_operations_with_truckflow` (mismos totales: 4.215/4.215, pero enriquecida) |

## Denominadores (por qué "cuántos camiones" tiene 3 respuestas si no se fija tabla)

Semana 2026-07-13 → 2026-07-19:

- **4.215** movimientos del Excel de contrato (`external_movimientos_contrato_normalized` = `excel_operations_with_truckflow`).
- **5.670** journeys de cámara limpios (`merged_truckflow_movimientos`, `clean_journeys_for_analysis`).
- **2.384** journeys clasificados en circuitos (`final_circuits`, `debug_matrix_classification`).

Siempre decir el denominador: "X movimientos según Excel" ≠ "X recorridos de cámara".

## Contradicciones detectadas (no usar estas fuentes para estas preguntas)

1. `merged_truckflow_movimientos.executive_status`: **muerta** (5.670/5.670 = NO_EVALUABLE en corrida headless).
2. `movimientos_without_truckflow_match` (1.000) vs `excel_operations_with_truckflow` sin match (934): pases de merge distintos.
3. `debug_matrix_classification.executive_status` (VALIDO 1.568) vs `final_circuits.executive_bucket` (COMPLETO 966): taxonomías distintas sobre los mismos 2.384 journeys. La ejecutiva/comité es `final_circuits`.
4. `segment_timing_kpi` vacía desde jun-08 (cobertura de tramos); `circuit_timing_summary` siempre poblada.

## Paridad con el front

- El front hidrata Transform desde estas MISMAS tablas del run (`loadTransformOutputFromRun`), así que la fuente es única.
- La torta de comité del front se recalcula en el cliente (índice de clasificación + reglas comité) sobre `debug_matrix_classification` + `excel_operations_with_truckflow`; el agente responde comité con `final_circuits.executive_bucket`. Si se necesita paridad exacta de la torta, el paso siguiente es persistir ese índice como tabla del run (pendiente).

## Ventanas

- `runs/windows/` guarda **semanas calendario lunes→domingo** (la primera clampeada al inicio de datos: 2026-05-12).
- No crear ventanas ad-hoc solapadas: para "del 13 al 20" usar la semana 13→19 (el 20 no tiene datos hasta que se extraiga) o procesar la semana siguiente cuando haya datos.
