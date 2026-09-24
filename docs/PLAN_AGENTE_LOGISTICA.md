# Plan de plantilla y automatización del informe de logística

Estado: planificación consolidada a partir de las respuestas del usuario en `CUESTIONARIO_AGENTE_LOGISTICA.md`. Se preparó una primera base PPTX de revisión y el mapa de las 72 diapositivas en `reportes/logistica/plantilla_v1/`. Los adaptadores de datos, la generación dinámica y la programación todavía no están implementados. Este documento sustituye las propuestas anteriores cuando difieran de estas decisiones.

## 1. Decisiones confirmadas

- Fuente operativa: dashboard local, con extracción Truckflow por API e incorporación de movimientos por contrato. Google Slides no será una dependencia de operación.
- Semana estándar: jueves–miércoles. Otros períodos se admitirán identificados como **atípicos**.
- Primera versión: un informe semanal que se completa diariamente. El informe diario independiente queda para una etapa posterior.
- Actualización: cuando esté incorporado el Excel del día anterior, habitualmente entre 09:00 y 12:00. Si se incorporan varios días juntos, actualizar todo el acumulado pendiente.
- Cierre semanal previsto: jueves a las 12:00, horario de Argentina. Si faltan datos, producir diagnóstico y borrador identificado; no simular un cierre completo.
- El usuario quiere comienzo del día operativo a las 22:00. Falta verificar la asignación de fecha que hoy usa el dashboard antes de fijar los límites exactos del informe.
- Ejecución en esta PC, sin exigir disponibilidad permanente. Recuperar actualizaciones pendientes cuando vuelva a estar disponible.
- Salida inicial: PPTX editable guardado en una carpeta local. PDF y distribución externa quedan fuera de esta primera etapa.
- Todos los informes quedan **para revisión del usuario hasta que indique expresamente que están listos**. No liberar automáticamente por cantidad de ejecuciones exitosas.
- Logos originales sin modificaciones y estética general similar. Los mapas siguen vigentes.
- Conservar todas las familias de contenido de las 72 páginas de referencia. La cantidad final es dinámica: **no crear páginas diarias de productos sin actividad** y agregar días/circuitos cuando corresponda. Esta respuesta reemplaza la propuesta previa de mantener páginas vacías.
- Primera prueba: período 10–16/09/2026.
- Las conclusiones las redactará el asistente, tomando el estilo y contenido del ejemplo, sobre datos identificados y verificables.

## 2. Reglas de contenido

### Resumen, productos y circuitos

La muestra por producto procede de Resumen ejecutivo. Las definiciones, filtros y unidades de cada tarjeta deben verificarse en el software, sin trasladar al usuario preguntas sobre implementación.

El producto no se deduce exclusivamente del código de circuito: el usuario indicó que R3/R4 pueden operar soja o girasol. El generador debe admitir combinaciones producto/circuito presentes en el período y no fijar una asociación única. R3 y R4 deben verificarse antes de agruparlos; la similitud operativa indicada no basta para afirmar identidad técnica.

### Tiempos

La fuente es KPI por tramo, con selección de circuito, detalle diario, cuartos de turno y resumen semanal. El usuario hoy suma manualmente tramos, subtotales y comparaciones. El generador hará esos cálculos de forma reproducible.

La suma de medias por tramo se conservará, si es la métrica buscada, bajo el nombre **suma de tiempos medios por tramo**. No se presentará automáticamente como promedio del ciclo observado: si las muestras de los tramos son distintas, ambas cifras pueden diferir. El paquete de datos debe conservar tamaños de muestra y fórmula.

### Pellet

- Toneladas: estimación de **cantidad de camiones × 30 t/camión**, rotulada como estimación, no pesaje real.
- Operativo: secuencia de días con actividad entre períodos sin actividad. Los 3–5 días descritos son habituales, no un límite fijo.
- Un día sin archivo o sin cobertura no demuestra fin de operativo. Un operativo que atraviesa dos semanas mantiene su identidad y distingue acumulado del operativo de aporte a la semana.
- Hay que conciliar el ejemplo: 5.550 t corresponden a 185 × 30, mientras la portada del operativo indica 188 camiones. No fijar el denominador tomando arbitrariamente uno de los dos.

### Histórico oficial presentado

El usuario eligió como histórico de referencia las cifras ya presentadas y pidió conservarlas. Deben migrarse a un registro central versionado, con indicador, período, valor, unidad y presentación/página de origen. Mantener las mismas series históricas.

Este registro es una excepción explícita al recálculo de datos operativos: no es una nueva integración permanente con Slides. Una vez recuperado, vive junto a los datos del informe. Una lectura ambigua de una imagen queda pendiente de verificación, no se completa por aproximación silenciosa.

Comparar con el **último operativo con actividad**, identificando sus fechas. No rotular «semana anterior» cuando el referente corresponda a otro período. No mezclar acumulados parciales con operativos cerrados sin mostrar esa condición.

### Ajustes de presentación y cobertura LPR

El usuario informó que a veces selecciona entre cifras de distintas vistas y que suma casos de baja cobertura a la categoría de cobertura completa.

El agente conservará mediciones originales y, si hay selección editorial, registrará fuente, filtro y motivo. No elegirá automáticamente el número más conveniente ni modificará el dato original.

La categoría **todas las cámaras** debe representar lecturas observadas en todas las cámaras esperadas. Los casos con menos de cuatro lecturas no se reclasificarán como cobertura completa. Si se necesita un agrupamiento editorial, tendrá una denominación distinta y una explicación visible. Los valores antiguos se conservarán como **histórico reportado**, sin certificarlos como medición observada.

## 3. Verificaciones iniciales realizadas

- Se leyó el cuestionario completado. P39 no contiene una meta: no se inventarán límites de desempeño.
- Se abrió `http://localhost:5173/estadisticas/indicadores/calada`. La página muestra Ricardone, Líquidos Ric y San Lorenzo, pero la sesión abierta no tiene período cargado. No se validaron cifras de una corrida en esa vista.
- Existen los directorios `data/movimientos`, `data/truckflow` y `runs/windows`. En movimientos también existe un archivo de resúmenes semanales. Se deben inspeccionar formatos y rutas exactas de los originales antes de implementar la ingesta.
- `src/features/real-truckflow/tabs/DescargasTab.tsx` usa `CaladaCamerasPanel` para mostrar actividad de descargas, seleccionando tablas por sede y equipo. La implementación debe reutilizar esas transformaciones.
- `src/features/real-truckflow/etlWorkbench/useExecutiveProductBreakdown.ts` describe conteos de recorridos por producto y resolución de producto desde Excel. Se debe comprobar su conexión exacta con las tarjetas elegidas de Resumen ejecutivo antes de fijar el contrato del reporte.
- `src/features/real-truckflow/tabs/SegmentTimingChartPanel.tsx` muestra `displayStats.mean` y documenta exclusión de demorados. Queda por seguir cómo se construye esa estadística y su configuración efectiva.

Estas verificaciones identifican puntos de integración; no equivalen a una conciliación de los indicadores. No se ejecutó ETL ni se validó un run_id/rulesVersion para este plan.

## 4. Orden de trabajo

### Etapa 1 — Especificación de la plantilla y mapa de datos

Entregables:

- Inventario de las 72 páginas de referencia, con identificador estable para cada familia de diapositiva.
- Por indicador: pantalla de origen, fórmula real, unidad, denominador, filtros, fecha de asignación, muestra válida y regla de redondeo.
- Identificación de logos y mapas originales que se reutilizarán sin alteraciones.
- Reglas de inclusión de páginas por actividad real; datos pendientes no equivalen a ausencia de actividad.
- Registro de series históricas oficiales con sus fuentes de presentación.

Trabajo técnico: revisar Resumen ejecutivo, calibración de cámaras, KPI por tramo, Calada y Descargas; verificar las rutas de importación y procesamiento actuales. Resolver la discrepancia entre instrucciones de tablas canónicas y documentación del modelo C/D/E antes de implementar lecturas alternativas.

Criterio de cierre: cada indicador tiene una fuente y significado definidos; toda familia de contenido de la referencia tiene destino en la plantilla. Las diferencias conocidas quedan registradas.

### Etapa 2 — Plantilla PPTX para revisión

Construir portada, índice automático, resumen, calidad LPR, mapas, tiempos semanales, páginas diarias, históricos, actividad de calada/descargas y conclusiones. Los mismos tipos de página se repiten por día, producto, circuito o equipo.

Usar logos originales y estilo semejante, priorizando legibilidad. Los datos que aún no estén conciliados se identifican como pendientes en el borrador; no inventar cifras para completar la maqueta. La muestra del 10–16/09 permite probar todas las familias presentes en la referencia.

Criterio de cierre: el usuario revisa la plantilla completa. No hay pérdida de indicadores; las páginas ausentes se explican por actividad, no por comodidad del diseño.

### Etapa 3 — Paquete central de datos y generador

Crear un paquete por período con métricas calculadas mediante la misma lógica que el dashboard, histórico reportado y procedencia de cada cifra. Propuesta de estructura:

- `periodo`: intervalo, corte disponible, huso horario y condición estándar/atípica.
- `fuentes`: archivos/corridas usados, versiones, fechas de carga y días faltantes.
- `resumen`, `calibracion`, `tiempos`, `actividad_calada`, `actividad_descargas`.
- `operativos`: continuidad y estado abierto/cerrado.
- `historico_reportado`: cifras preservadas de informes emitidos.
- `controles`: discrepancias, estimaciones, cobertura y estado de revisión.

El generador consume este paquete; la IA redacta conclusiones con referencias a sus métricas. El armado no dependerá de copiar pantallas o editar celdas en varias hojas.

Propuesta de carpeta local: `reportes/logistica/<inicio>_<fin>/revision-XXX/`, con PPTX, paquete de datos y controles. Es una ruta propuesta, todavía no utilizada por un generador.

### Etapa 4 — Prueba completa y conciliación

Generar el 10–16/09 y comparar cada cifra con su fuente correspondiente. Para métricas actuales, fuente operativa verificada; para histórico, valores reportados preservados.

Pruebas necesarias:

- Dos ejecuciones con los mismos datos producen los mismos indicadores y no duplican versiones sin motivo.
- La llegada de nuevos días actualiza el acumulado semanal.
- Un día realmente sin actividad no genera página diaria; uno sin datos genera un pendiente.
- Recorridos nocturnos y operativos entre semanas no se pierden ni se duplican.
- El producto de R3/R4 no queda fijado por el circuito.
- La estimación de toneladas conserva el denominador y se identifica como estimación.
- Los históricos no se reescriben durante el procesamiento.
- Las conclusiones coinciden con las métricas y señalan el período comparado.
- El PPTX abre correctamente y se revisan gráficas, texto, logos y todas las páginas generadas.

### Etapa 5 — Automatización local supervisada

Detectar la incorporación efectiva del Excel mediante el mecanismo de carga existente y actualizar las fuentes necesarias. La descarga desde correo no forma parte de esta etapa: hoy el usuario recibe y carga los archivos manualmente.

Al disponer de nuevos datos completos, actualizar el informe semanal acumulado. El jueves a las 12:00 intentar el cierre. Si la PC está apagada, registrar y recuperar la ejecución pendiente al iniciarse el proceso, sin prometer entrega mientras está apagada.

Mantener estados de ejecución: esperando datos, procesando, borrador con observaciones y pendiente de revisión. La aprobación editorial pertenece al usuario. Guardar registros de fallos y limitar reintentos. Los horarios se programarán cuando el generador esté validado; este plan no instala ni activa tareas.

## 5. Pendientes que no requieren otro cuestionario

- **Día a las 22:00:** verificar el comportamiento existente. Documentar qué fecha rotula el intervalo nocturno antes de fijar el período de la prueba.
- **Correcciones:** P05 indica que hay correcciones y P09 que los Excel no se corrigen. Interpretación provisional: puede cambiar el procesamiento o el informe, aunque el archivo de entrada no se reemplace. Guardar versiones de ambos y verificar el flujo real.
- **Históricos:** recuperar exactamente las series y períodos de la presentación. Si una etiqueta o cifra no es legible, señalar el elemento concreto a revisar.
- **Metas:** no suministradas; describir cambios sin crear semáforos arbitrarios.
- **Retención:** «semanal» no define un plazo de eliminación. Organizar por semana y conservar los archivos; no implementar borrado automático.
- **Validación visual y de datos:** cargar una corrida disponible siguiendo el procedimiento de resolución de ventanas antes de verificar indicadores. Esta inspección inicial no carga ni reprocesa datos.

## Próximo entregable

Se entregó una **base PPTX de revisión con el mapa de fuentes y campos por diapositiva**. Archivo vigente: `reportes/logistica/plantilla_v1/plantilla_comite_logistica_v1_revision3.pptx`. Conserva cifras e imágenes reportadas, no recalculadas. `MAPA_DIAPOSITIVAS.md` y `mapa_diapositivas.json` documentan las 72 páginas; `REGLAS_Y_PENDIENTES.md` registra las fórmulas investigadas y los límites de esta versión.

Próxima etapa: completar la conciliación de muestras, enlazar campos con cálculos compartidos y sustituir los gráficos de referencia por gráficos generados. No hace falta otro cuestionario general: las dudas técnicas restantes se investigan en el dashboard y el repositorio.
