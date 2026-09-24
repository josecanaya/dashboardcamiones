# Plantilla v1: reglas verificadas y conexión pendiente

La presentación de revisión conserva el contenido reportado del 10–16/09/2026. No es un informe nuevo ni contiene datos recalculados. El pie de cada página lo identifica. La numeración de referencia permite discutir páginas concretas sin perder cobertura.

## Qué se preparó

- Base PPTX de 72 diapositivas, con texto y formas de PowerPoint conservados.
- Logos y mapas originales; todos los archivos de imagen mantienen sus bytes originales. Se omitieron instancias de la línea decorativa de los títulos para mejorar legibilidad.
- Encabezados normalizados y pie de revisión separado del contenido original.
- Mapa de fuentes y campos de cada página en Markdown y JSON.
- Identificadores estables para objetos de texto y de imagen y notas de fuente por diapositiva. Son candidatos de vinculación: la correspondencia final campo–objeto sigue pendiente.
- Script reproducible `scripts/build-logistics-template.py`. Genera la base de revisión; no consulta fuentes ni programa tareas.

## Diferencias temporales verificadas en código

En `etlSegmentScatterByDay.ts`, `buildQuarterCircuitSummary` asigna los ingresos desde las 22:00 al día siguiente. Un día rotulado 10/09 corresponde, con esa convención, al intervalo del 09/09 a las 22:00 al 10/09 a las 22:00.

En `CaladaCamerasPanel.tsx`, `localDayOf` filtra por fecha calendario de Argentina. Por tanto, un mismo rótulo diario no representa hoy el mismo intervalo en todos los bloques. El nuevo informe debe usar una política temporal explícita, siguiendo el comienzo a las 22:00 pedido por el usuario. Esa política todavía no se implementó ni se aplicó a las cifras de referencia.

## Conteos y promedios de actividad

Código revisado: `CaladaCamerasPanel.tsx`.

- Total del período: tamaño del conjunto de `journey_id` de `baseRows`.
- Conteo por equipo: conjunto de identificadores dentro de cada cámara/equipo. Un identificador puede estar en más de un equipo; no forzar que su suma sea igual al total deduplicado.
- Serie por hora: conjunto de identificadores por ventana horaria.
- Promedio horario de las tarjetas: suma de los conteos horarios dividida por cantidad de horas con actividad. No equivale necesariamente a total deduplicado dividido por horas.
- Mediana: valor central de los conteos horarios. Es distinta de la media. En la referencia hay tarjetas rotuladas «Promedio» cuyos valores parecen corresponder a medianas de las curvas; esto requiere conciliación, no un cambio automático de rótulo por intuición.
- Calada Ricardone puede excluir recorridos que tocaron `RicCalLiq` de la serie horaria específica, mientras tarjetas de `concurrency` parten de otra población. El adaptador debe conservar o reconciliar esa diferencia con evidencia.
- Puerto: `DescargasTab.tsx` activa `splitExcelVsCamera` en volcables San Lorenzo. Los conteos principales usan filas Excel; los registros vistos solo por cámaras se muestran por separado.
- La implementación de `dayPeaks` elige el primer máximo diario; su comentario menciona empates múltiples. Debe probarse el comportamiento y no usar el comentario como fórmula.

## Tiempos y calibración

- `SegmentTimingChartPanel.tsx` muestra `displayStats.mean` y aplica filtros de demora y duración máxima visual. Falta seguir la construcción completa de muestras para copiar la misma métrica.
- `buildRecognitionDepth`, en `cameraCalibrationDashboardModel.ts`, agrupa por cantidad de hitos faltantes. «TODAS» corresponde a cero hitos faltantes. Baja cobertura no se suma a cobertura completa observada.
- Los cuartos por circuito provienen de operaciones distintas con ingreso de cámara y respaldo de ingreso Excel. No asumir que coinciden con el universo deduplicado de actividad por cámara.
- Los subtotales que el usuario calculaba sumando tramos deben identificarse como suma de medias si las muestras no son idénticas.

## Comparativos e históricos

La inspección visual precisa el inventario anterior:

- Página 15: comparación por día de Ricardone y San Lorenzo para soja.
- Página 16: tiempos diarios y volúmenes por cuarto de turno de soja.
- Página 17: series históricas de operativos de soja, total y tramos.
- Página 25: comparación por día de Ricardone y San Lorenzo para pellet.
- Página 31: series históricas de girasol, total y tramos.
- Página 34: resumen conjunto de calada por sede/tipo, no una curva horaria.

Solo las series históricas presentadas se conservan como registro reportado inmutable. Las comparaciones entre días del período corriente deben generarse desde su paquete actual. Las imágenes históricas se preservaron; su transcripción numérica exacta todavía está pendiente.

## Qué falta antes de actualizar valores automáticamente

1. Resolver las corridas semanales que cubren el período con las herramientas del ETL; no crear ventanas solapadas.
2. Conciliar el contrato de tablas con las reglas activas y las definiciones de las vistas. La inspección del código no autoriza contar movimientos con tablas de journeys.
3. Implementar y probar los adaptadores que reutilicen cálculos del dashboard y registren muestras, filtros y procedencia.
4. Aplicar el día operativo de manera coherente y verificar los bordes de semana.
5. Transcribir y validar las series históricas que solo existen como imágenes de referencia.
6. Sustituir los gráficos de referencia por gráficos generados. Actualmente siguen siendo imágenes y no son series editables de PowerPoint.
7. Vincular campos a objetos de la plantilla, regenerar índice/páginas y redactar conclusiones desde métricas validadas.
8. Probar la actualización del 10–16/09 antes de configurar la ejecución local supervisada.

Ninguna tarea programada quedó activada. El usuario mantiene la revisión de cada informe. No hay un run_id o rulesVersion aplicable a esta copia de referencia: el futuro paquete de datos deberá incluirlos.
