# Actualización de logística: 1, 2 y 3 de octubre de 2026

Se reconstruyó la actividad visible en cámaras y se ensayó una estimación agregada de movimientos, **sin crear movimientos Excel ficticios**. Las cifras de octubre son escenarios, no descargas comerciales confirmadas. No se estimaron toneladas, contratos ni patentes.

## Resultado y efecto sobre el acumulado

Para hacer una suma comparable se usa la fecha calendario de ingreso, del 24 al 30 de septiembre, y todos los circuitos de cada producto. Se cuentan identificadores únicos de operación en `excel_operations_with_truckflow`.

| Producto | Movimientos históricos por ingreso | Escenario adicional 1–3/10 | Acumulado condicional 24/9–3/10 | Cambio |
|---|---:|---:|---:|---:|
| Soja | 1.223 | ≈277 | ≈1.500 | +23% |
| Pellet | 350 | ≈86 | ≈436 | +25% |
| Girasol | 230 | ≈29 | ≈259 | +12% |
| Líquidos | 392 | ≈111 | ≈503 | +28% |
| Total | 2.195 | ≈503 | ≈2.698 | +23% |

El aumento corresponde a agregar tres días, no a una mejora de productividad. Los cuatro escenarios se redondean por producto y se suman para obtener el total.

**No se suman estos adicionales a las tarjetas originales de 770 Soja, 307 Pellet, 208 Girasol y 383 Líquidos.** Esas tarjetas tienen otros alcances de circuito y población. Tampoco se mezclan con los totales por `source_date` del paquete ejecutivo (1.267, 350, 306 y 398): `source_date` y la fecha de ingreso no son el mismo corte. Esta diferencia es de definición, no actividad nueva. Se conserva íntegro el deck original y se incorpora un anexo de seis diapositivas.

## Qué tan confiable es

El algoritmo es una razón histórica simple: movimientos del producto / registros de actividad en su punto indicador. Se calibra del 24 al 30/9 y se aplica a los registros del 1–3/10. Los puntos son compartidos: no son clasificadores individuales de producto. La estimación requiere suponer que la relación entre actividad, mezcla de productos y cobertura de cámaras sigue siendo parecida.

| Producto | Punto usado como indicador | Sensibilidad del adicional | Error temporal WAPE |
|---|---|---:|---:|
| Soja | Calada sólida Ricardone | 195–345 | 21% |
| Pellet | Volcables San Lorenzo | 4–190 | 109% |
| Girasol | Volcables Ricardone | 5–84 | 54% |
| Líquidos | Calada calle de líquidos | 7–542 | 70% |

La prueba temporal calibra con 24–27/9 y evalúa contra 28–30/9 sin usar esos tres días para ajustar esa prueba. WAPE es la suma de errores absolutos dividida por la suma de movimientos reales del período de evaluación. No es una probabilidad ni una garantía de error futuro. Las bandas de sensibilidad son el mínimo y máximo de las razones diarias aplicados a octubre; **no son intervalos estadísticos de confianza**. Solo hay siete días de calibración y tres de evaluación temporal; no alcanza para validar un modelo predictivo robusto ni efectos por día de semana.

La señal de Soja es la más consistente, pero sigue siendo provisional. En los otros tres productos el error es demasiado alto para certificar volúmenes. El total de 503 también hereda esa incertidumbre: sirve para ilustrar un escenario, no para un cierre de comité.

## Actividad observada, sin inferir producto

| Punto | 1/10 | 2/10 | 3/10 | Total de registros |
|---|---:|---:|---:|---:|
| Calada sólida Ricardone | 114 | 128 | 96 | 338 |
| Volcables Ricardone | 36 | 19 | 11 | 66 |
| Volcables San Lorenzo | 183 | 80 | 55 | 318 |
| Calada calle de líquidos | 134 | 27 | 7 | 168 |

Cada conteo deduplica la combinación journey, cámara y timestamp dentro de la tabla de actividad del ETL. No se suman los puntos entre sí: un recorrido puede aparecer en varios. No se ha comprobado disponibilidad continua de todas las cámaras. Una baja de registros no demuestra por sí misma una baja de descargas.

## Líquidos: tiempos nuevos

En los R8 de cámara cuyo inicio cae entre el 1 y el 3/10:

- Preingreso → punto líquido: **7,0 minutos de promedio**, 10 recorridos.
- Punto líquido → balanza egreso: **40,6 minutos de promedio**, 2 recorridos.
- Resto de los tramos: sin evidencia suficiente en esa muestra para actualizar el circuito completo.

Las muestras son distintas y faltan tramos: no se suman 7,0 y 40,6 como si fueran el tiempo total. La presentación conserva sus 328 minutos históricos sin recalcularlos con este subconjunto. La clasificación R8 es de cámara; no certifica el producto comercial sin Excel.

## Fuentes y reproducibilidad

- Corridas originales: `2026-09-21_2026-09-27` y `2026-09-28_2026-10-04` en `runs/windows`.
- `rulesVersion`: `etl_transform_v17`.
- Ejecución nueva aislada: `camera-runs/windows/2026-09-28_2026-10-04`, dentro de esta carpeta. Comparte la ventana semanal, pero no es la corrida histórica original y no contiene Excel.
- Archivos de eventos usados: `data/truckflow/2026-09-30/event-list.json` y los de `2026-10-01`, `2026-10-02`, `2026-10-03`. Septiembre 30 aporta contexto; los adicionales y los tiempos nuevos se filtran a 1–3/10.
- Movimientos históricos: `excel_operations_with_truckflow`, con los filtros de producto de `etlProductFilter.ts` y deduplicación por `external_operation_id`.
- Actividad: `calada_camera_events`, `san_lorenzo_volcable_events`, `ricardone_volcable_events`, `calada_ricardone_liquid_events`.
- Tiempos: se inspeccionó `circuit_timing_summary`; como contiene también septiembre 30, el corte de octubre se obtiene del detalle `circuit_timing_journeys` y `segment_timing_legs`. No se traslada el resumen de cuatro días a un período de tres.
- No se usan conteos de `merged_truckflow_movimientos` ni de `movimientos_without_truckflow_match`.
- Cálculo reproducible: ejecutar `npx tsx artifacts/codex/actualizacion-octubre/analyze.mjs` desde la raíz del repositorio. Resultado: `analysis.json`.

## Criterio para el comité

Mostrar primero los datos observados y después el escenario, con su error visible. Mantener el cierre histórico y el desglose por producto. No presentar el adicional como descargas confirmadas ni como mejora de tiempos. Cuando llegue Excel, conciliar producto y plataforma, sustituir las estimaciones y medir su desvío contra lo real.
