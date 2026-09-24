# Mapa de la plantilla de logística v1

Actualización: páginas 2, 3 y 34 convertidas a elementos editables en plantilla_comite_logistica_editada.pptx. Conservan los valores reportados. El archivo anterior estaba abierto y Windows impidió reemplazarlo.

Estado: plantilla de revisión. Las 72 páginas conservan valores e imágenes de referencia; no están conectadas a una corrida.

El pie de revisión ocupa una franja nueva bajo el contenido original. No cubre cifras, mapas ni logos. Las imágenes originales se conservan byte a byte.

## Cobertura por diapositiva

### 01. Portada
- Familia: `cover`. Fuente prevista: `static`.
- Campos: `report.title`, `period.label`, `committee.date`.
- Inclusión automática futura: `always`.
- Estado: Recurso original conservado.

### 02. Índice
- Familia: `index`. Fuente prevista: `static`.
- Campos: `sections[].title`, `sections[].page_range`, `period.label`.
- Inclusión automática futura: `always`.
- Estado: Recurso original conservado.

### 03. Muestra por producto
- Familia: `sample`. Fuente prevista: `executive`.
- Campos: `sample.products[].count`, `sample.products[].unit`, `sample.total`, `period.label`.
- Inclusión automática futura: `always`.
- Estado: UI identificado; conciliación canónica pendiente.

### 04. Contenido soja
- Familia: `section_index`. Fuente prevista: `static`.
- Campos: `section.items`.
- Inclusión automática futura: `always`.
- Estado: Recurso original conservado.

### 05. Calidad de lectura soja
- Familia: `lpr`. Fuente prevista: `calibration`.
- Campos: `recognitionDepthBuckets`, `top_missing_step`, `missing_count`, `sample_n`.
- Inclusión automática futura: `always`.
- Estado: Fórmula identificada; falta validar período.
- Control: Conservar cobertura observada; no sumar baja cobertura a TODAS.

### 06. Mapa R7
- Familia: `route`. Fuente prevista: `static`.
- Campos: `route.label`, `product.label`, `route.steps`.
- Inclusión automática futura: `circuit_has_activity`.
- Estado: Recurso original conservado.

### 07. Tiempos semanales soja
- Familia: `timing_weekly`. Fuente prevista: `timing`.
- Campos: `segments[].mean_minutes`, `segments[].sample_n`, `sum_segment_means_minutes`, `plants[].sum_segment_means_minutes`, `sample_count`, `sample_unit`, `previous_operation.delta_minutes`.
- Inclusión automática futura: `product_circuit_has_activity`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Control: No confundir suma de medias con media de ciclo; comparar con último operativo.

### 08. Tiempos diarios soja
- Familia: `timing_daily`. Fuente prevista: `timing`.
- Campos: `segments[].mean_minutes`, `segments[].sample_n`, `sum_segment_means_minutes`, `plants[].sum_segment_means_minutes`, `sample_count`, `sample_unit`, `previous_operation.delta_minutes`, `quarters.Q1`, `quarters.Q2`, `quarters.Q3`, `quarters.Q4`, `day`.
- Inclusión automática futura: `product_circuit_day_has_activity`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Día ilustrado en el ejemplo: 2026-09-10.
- Control: No confundir suma de medias con media de ciclo; comparar con último operativo.

### 09. Tiempos diarios soja
- Familia: `timing_daily`. Fuente prevista: `timing`.
- Campos: `segments[].mean_minutes`, `segments[].sample_n`, `sum_segment_means_minutes`, `plants[].sum_segment_means_minutes`, `sample_count`, `sample_unit`, `previous_operation.delta_minutes`, `quarters.Q1`, `quarters.Q2`, `quarters.Q3`, `quarters.Q4`, `day`.
- Inclusión automática futura: `product_circuit_day_has_activity`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Día ilustrado en el ejemplo: 2026-09-11.
- Control: No confundir suma de medias con media de ciclo; comparar con último operativo.

### 10. Tiempos diarios soja
- Familia: `timing_daily`. Fuente prevista: `timing`.
- Campos: `segments[].mean_minutes`, `segments[].sample_n`, `sum_segment_means_minutes`, `plants[].sum_segment_means_minutes`, `sample_count`, `sample_unit`, `previous_operation.delta_minutes`, `quarters.Q1`, `quarters.Q2`, `quarters.Q3`, `quarters.Q4`, `day`.
- Inclusión automática futura: `product_circuit_day_has_activity`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Día ilustrado en el ejemplo: 2026-09-12.
- Control: No confundir suma de medias con media de ciclo; comparar con último operativo.

### 11. Tiempos diarios soja
- Familia: `timing_daily`. Fuente prevista: `timing`.
- Campos: `segments[].mean_minutes`, `segments[].sample_n`, `sum_segment_means_minutes`, `plants[].sum_segment_means_minutes`, `sample_count`, `sample_unit`, `previous_operation.delta_minutes`, `quarters.Q1`, `quarters.Q2`, `quarters.Q3`, `quarters.Q4`, `day`.
- Inclusión automática futura: `product_circuit_day_has_activity`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Día ilustrado en el ejemplo: 2026-09-13.
- Control: No confundir suma de medias con media de ciclo; comparar con último operativo.

### 12. Tiempos diarios soja
- Familia: `timing_daily`. Fuente prevista: `timing`.
- Campos: `segments[].mean_minutes`, `segments[].sample_n`, `sum_segment_means_minutes`, `plants[].sum_segment_means_minutes`, `sample_count`, `sample_unit`, `previous_operation.delta_minutes`, `quarters.Q1`, `quarters.Q2`, `quarters.Q3`, `quarters.Q4`, `day`.
- Inclusión automática futura: `product_circuit_day_has_activity`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Día ilustrado en el ejemplo: 2026-09-14.
- Control: No confundir suma de medias con media de ciclo; comparar con último operativo.

### 13. Tiempos diarios soja
- Familia: `timing_daily`. Fuente prevista: `timing`.
- Campos: `segments[].mean_minutes`, `segments[].sample_n`, `sum_segment_means_minutes`, `plants[].sum_segment_means_minutes`, `sample_count`, `sample_unit`, `previous_operation.delta_minutes`, `quarters.Q1`, `quarters.Q2`, `quarters.Q3`, `quarters.Q4`, `day`.
- Inclusión automática futura: `product_circuit_day_has_activity`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Día ilustrado en el ejemplo: 2026-09-15.
- Control: No confundir suma de medias con media de ciclo; comparar con último operativo.

### 14. Tiempos diarios soja
- Familia: `timing_daily`. Fuente prevista: `timing`.
- Campos: `segments[].mean_minutes`, `segments[].sample_n`, `sum_segment_means_minutes`, `plants[].sum_segment_means_minutes`, `sample_count`, `sample_unit`, `previous_operation.delta_minutes`, `quarters.Q1`, `quarters.Q2`, `quarters.Q3`, `quarters.Q4`, `day`.
- Inclusión automática futura: `product_circuit_day_has_activity`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Día ilustrado en el ejemplo: 2026-09-16.
- Control: No confundir suma de medias con media de ciclo; comparar con último operativo.

### 15. Comparativo diario por planta
- Familia: `plant_comparison`. Fuente prevista: `timing`.
- Campos: `days[].label`, `days[].ricardone_minutes`, `days[].san_lorenzo_minutes`.
- Inclusión automática futura: `always`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Control: Comparación de días del período; no confundir con serie histórica de operativos.

### 16. Comparativo diario de tiempos y turnos
- Familia: `daily_comparison`. Fuente prevista: `timing`.
- Campos: `days[].total_minutes`, `period.total_minutes`, `days[].quarters.Q1`, `days[].quarters.Q2`, `days[].quarters.Q3`, `days[].quarters.Q4`.
- Inclusión automática futura: `always`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.

### 17. Histórico de operativos
- Familia: `history`. Fuente prevista: `history`.
- Campos: `historical_series[].reported_values`, `historical_series[].periods`, `historical_series[].unit`, `previous_operation.period`.
- Inclusión automática futura: `always`.
- Estado: Histórico reportado preservado en imágenes; transcripción de series pendiente.
- Control: No recalcular el histórico presentado; sustituir imagen solo con transcripción validada.

### 18. Conclusiones soja
- Familia: `conclusions`. Fuente prevista: `derived`.
- Campos: `findings[].statement`, `findings[].metric_refs`.
- Inclusión automática futura: `product_has_activity`.
- Estado: Regla de negocio confirmada; implementación pendiente.
- Control: Redacción basada en indicadores; no inferir causas sin evidencia.

### 19. Contenido pellet
- Familia: `section_index`. Fuente prevista: `static`.
- Campos: `section.items`.
- Inclusión automática futura: `always`.
- Estado: Recurso original conservado.

### 20. Operativo pellet
- Familia: `operation`. Fuente prevista: `derived`.
- Campos: `operation.start`, `operation.end`, `operation.status`, `truck_count`, `estimated_tonnes`, `tonnes_assumption`.
- Inclusión automática futura: `product_has_activity`.
- Estado: Regla de negocio confirmada; implementación pendiente.
- Control: Toneladas estimadas = camiones × 30; falta conciliar 185/188 de referencia.

### 21. Mapa R30/R31/R32
- Familia: `route`. Fuente prevista: `static`.
- Campos: `route.label`, `product.label`, `route.steps`.
- Inclusión automática futura: `circuit_has_activity`.
- Estado: Recurso original conservado.

### 22. Tiempos semanales pellet
- Familia: `timing_weekly`. Fuente prevista: `timing`.
- Campos: `segments[].mean_minutes`, `segments[].sample_n`, `sum_segment_means_minutes`, `plants[].sum_segment_means_minutes`, `sample_count`, `sample_unit`, `previous_operation.delta_minutes`.
- Inclusión automática futura: `product_circuit_has_activity`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Control: No confundir suma de medias con media de ciclo; comparar con último operativo.

### 23. Tiempos diarios pellet
- Familia: `timing_daily`. Fuente prevista: `timing`.
- Campos: `segments[].mean_minutes`, `segments[].sample_n`, `sum_segment_means_minutes`, `plants[].sum_segment_means_minutes`, `sample_count`, `sample_unit`, `previous_operation.delta_minutes`, `quarters.Q1`, `quarters.Q2`, `quarters.Q3`, `quarters.Q4`, `day`.
- Inclusión automática futura: `product_circuit_day_has_activity`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Día ilustrado en el ejemplo: 2026-09-14.
- Control: No confundir suma de medias con media de ciclo; comparar con último operativo.

### 24. Tiempos diarios pellet
- Familia: `timing_daily`. Fuente prevista: `timing`.
- Campos: `segments[].mean_minutes`, `segments[].sample_n`, `sum_segment_means_minutes`, `plants[].sum_segment_means_minutes`, `sample_count`, `sample_unit`, `previous_operation.delta_minutes`, `quarters.Q1`, `quarters.Q2`, `quarters.Q3`, `quarters.Q4`, `day`.
- Inclusión automática futura: `product_circuit_day_has_activity`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Día ilustrado en el ejemplo: 2026-09-15.
- Control: No confundir suma de medias con media de ciclo; comparar con último operativo.

### 25. Comparativo diario por planta
- Familia: `plant_comparison`. Fuente prevista: `timing`.
- Campos: `days[].label`, `days[].ricardone_minutes`, `days[].san_lorenzo_minutes`.
- Inclusión automática futura: `always`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Control: Comparación de días del período; no confundir con serie histórica de operativos.

### 26. Conclusiones pellet
- Familia: `conclusions`. Fuente prevista: `derived`.
- Campos: `findings[].statement`, `findings[].metric_refs`.
- Inclusión automática futura: `product_has_activity`.
- Estado: Regla de negocio confirmada; implementación pendiente.
- Control: Redacción basada en indicadores; no inferir causas sin evidencia.

### 27. Contenido girasol
- Familia: `section_index`. Fuente prevista: `static`.
- Campos: `section.items`.
- Inclusión automática futura: `always`.
- Estado: Recurso original conservado.

### 28. Calidad de lectura girasol
- Familia: `lpr`. Fuente prevista: `calibration`.
- Campos: `recognitionDepthBuckets`, `top_missing_step`, `missing_count`, `sample_n`.
- Inclusión automática futura: `always`.
- Estado: Fórmula identificada; falta validar período.
- Control: Conservar cobertura observada; no sumar baja cobertura a TODAS.

### 29. Mapa R5/R6
- Familia: `route`. Fuente prevista: `static`.
- Campos: `route.label`, `product.label`, `route.steps`.
- Inclusión automática futura: `circuit_has_activity`.
- Estado: Recurso original conservado.

### 30. Tiempos semanales girasol
- Familia: `timing_weekly`. Fuente prevista: `timing`.
- Campos: `segments[].mean_minutes`, `segments[].sample_n`, `sum_segment_means_minutes`, `plants[].sum_segment_means_minutes`, `sample_count`, `sample_unit`, `previous_operation.delta_minutes`.
- Inclusión automática futura: `product_circuit_has_activity`.
- Estado: Media y día operativo identificados; falta auditar muestra y filtros.
- Control: No confundir suma de medias con media de ciclo; comparar con último operativo.

### 31. Histórico de operativos
- Familia: `history`. Fuente prevista: `history`.
- Campos: `historical_series[].reported_values`, `historical_series[].periods`, `historical_series[].unit`, `previous_operation.period`.
- Inclusión automática futura: `always`.
- Estado: Histórico reportado preservado en imágenes; transcripción de series pendiente.
- Control: No recalcular el histórico presentado; sustituir imagen solo con transcripción validada.

### 32. Conclusiones girasol
- Familia: `conclusions`. Fuente prevista: `derived`.
- Campos: `findings[].statement`, `findings[].metric_refs`.
- Inclusión automática futura: `product_has_activity`.
- Estado: Regla de negocio confirmada; implementación pendiente.
- Control: Redacción basada en indicadores; no inferir causas sin evidencia.

### 33. Calada
- Familia: `divider`. Fuente prevista: `static`.
- Campos: recurso visual original.
- Inclusión automática futura: `always`.
- Estado: Recurso original conservado.

### 34. Calada semanal por sede y tipo
- Familia: `activity_overview`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Tabla de actividad identificada: `['calada_camera_events', 'calada_ricardone_liquid_events', 'calada_sl_camera_events']`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 35. Calada semanal Ricardone
- Familia: `activity_bars_kpis`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 36. Calada diaria Ricardone
- Familia: `activity_bars`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-10.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 37. Calada diaria Ricardone
- Familia: `activity_line_kpis`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-10.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 38. Calada diaria Ricardone
- Familia: `activity_bars`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-11.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 39. Calada diaria Ricardone
- Familia: `activity_line_kpis`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-11.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 40. Calada diaria Ricardone
- Familia: `activity_bars`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-12.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 41. Calada diaria Ricardone
- Familia: `activity_line_kpis`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-12.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 42. Calada diaria Ricardone
- Familia: `activity_bars`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-13.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 43. Calada diaria Ricardone
- Familia: `activity_line_kpis`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-13.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 44. Calada diaria Ricardone
- Familia: `activity_bars`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-14.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 45. Calada diaria Ricardone
- Familia: `activity_line_kpis`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-14.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 46. Calada diaria Ricardone
- Familia: `activity_bars`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-15.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 47. Calada diaria Ricardone
- Familia: `activity_line_kpis`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-15.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 48. Calada diaria Ricardone
- Familia: `activity_bars`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-16.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 49. Calada diaria Ricardone
- Familia: `activity_line_kpis`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_day_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Día ilustrado en el ejemplo: 2026-09-16.
- Tabla de actividad identificada: `calada_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 50. Calada semanal líquidos Ricardone
- Familia: `activity_combined`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Tabla de actividad identificada: `calada_ricardone_liquid_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 51. Calada semanal San Lorenzo
- Familia: `activity_combined`. Fuente prevista: `calada`.
- Campos: `hourly[].bucket`, `hourly[].trucks`, `hourly[].active_cameras`, `perCamera[].trucks`, `perCamera[].active_hours`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `totals.medianTrucksPerHour`, `periodHours`.
- Inclusión automática futura: `site_has_activity`.
- Estado: Agregaciones identificadas; falta extraer adaptador compartido.
- Tabla de actividad identificada: `calada_sl_camera_events`.
- Control: Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas.

### 52. Volcables
- Familia: `divider`. Fuente prevista: `static`.
- Campos: recurso visual original.
- Inclusión automática futura: `always`.
- Estado: Recurso original conservado.

### 53. Actividad volcables Ricardone
- Familia: `activity_bars`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Tabla de actividad identificada: `ricardone_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 54. Actividad volcables Ricardone
- Familia: `activity_line_kpis`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Tabla de actividad identificada: `ricardone_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 55. Actividad silos Ricardone
- Familia: `activity_bars`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Tabla de actividad identificada: `ricardone_silo_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 56. Actividad silos Ricardone
- Familia: `activity_line_kpis`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Tabla de actividad identificada: `ricardone_silo_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 57. Actividad volcables Puerto
- Familia: `activity_bars_kpis`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 58. Actividad volcables Puerto
- Familia: `activity_bars_narrative`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 59. Actividad volcables Puerto
- Familia: `activity_bars`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-10.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 60. Actividad volcables Puerto
- Familia: `activity_line_kpis`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-10.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 61. Actividad volcables Puerto
- Familia: `activity_bars`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-11.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 62. Actividad volcables Puerto
- Familia: `activity_line_kpis`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-11.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 63. Actividad volcables Puerto
- Familia: `activity_bars`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-12.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 64. Actividad volcables Puerto
- Familia: `activity_line_kpis`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-12.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 65. Actividad volcables Puerto
- Familia: `activity_bars`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-13.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 66. Actividad volcables Puerto
- Familia: `activity_line_kpis`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-13.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 67. Actividad volcables Puerto
- Familia: `activity_bars`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-14.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 68. Actividad volcables Puerto
- Familia: `activity_line_kpis`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-14.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 69. Actividad volcables Puerto
- Familia: `activity_bars`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-15.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 70. Actividad volcables Puerto
- Familia: `activity_line_kpis`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-15.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 71. Actividad volcables Puerto
- Familia: `activity_bars`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-16.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

### 72. Actividad volcables Puerto
- Familia: `activity_line_kpis`. Fuente prevista: `discharge`.
- Campos: `hourly[].trucks`, `perCamera[].trucks`, `totals.trucks`, `totals.peakTrucks`, `totals.peakTrucksLabel`, `totals.avgTrucksPerHour`, `periodHours`, `average_daily`, `distribution_pct`, `totals.medianTrucksPerHour`.
- Inclusión automática futura: `equipment_day_has_activity`.
- Estado: Tablas por sede identificadas; reutilizar modelo de actividad.
- Día ilustrado en el ejemplo: 2026-09-16.
- Tabla de actividad identificada: `san_lorenzo_volcable_events`.
- Control: SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal.

## Fuentes del código

- **executive**: `src/features/real-truckflow/tabs/ExecutiveSummaryTab.tsx`. `executiveProductFilterPlan`, `productCoverage`, `displayClassIndex`. UI identificado; conciliación canónica pendiente.
- **calibration**: `src/features/real-truckflow/etlWorkbench/cameraCalibrationDashboardModel.ts`. `buildCalibrationDashboardModel`, `buildRecognitionDepth`. Fórmula identificada; falta validar período.
- **timing**: `src/features/real-truckflow/tabs/SegmentTimingChartPanel.tsx`. `displayStats.mean`. Media y día operativo identificados; falta auditar muestra y filtros.
- **calada**: `src/features/real-truckflow/tabs/CaladaCamerasPanel.tsx`. `baseRows`, `perCamera`, `concurrency`, `trucksPerHour`, `totals`. Agregaciones identificadas; falta extraer adaptador compartido.
- **discharge**: `src/features/real-truckflow/tabs/DescargasTab.tsx`. `CaladaCamerasPanel`, `splitExcelVsCamera`. Tablas por sede identificadas; reutilizar modelo de actividad.
- **history**: `Reporte de Logistica 18_9.pptx`. . Histórico reportado preservado en imágenes; transcripción de series pendiente.
- **derived**: `docs/CUESTIONARIO_AGENTE_LOGISTICA.md`. `P18`, `P22`, `P27`. Regla de negocio confirmada; implementación pendiente.
- **static**: `Reporte de Logistica 18_9.pptx`. . Recurso original conservado.

## Uso de la plantilla

El JSON enumera identificadores estables de objetos de texto e imagen y sus valores originales. Son candidatos de vinculación, no asignaciones semánticas completas ni conexiones activas. Antes de reemplazarlos, el adaptador deberá resolver cada campo de negocio y conciliar su muestra.

Las páginas diarias son modelos repetibles: el generador posterior las duplicará u omitirá según actividad verificada. La paginación y el índice deberán regenerarse tras esa selección. Los días con fuentes ausentes no se consideran días sin actividad.

Los gráficos pegados como imágenes conservan la referencia original. Todavía no son editables como series de PowerPoint. Textos, formas y mapas mantienen la estructura del PPTX fuente.
