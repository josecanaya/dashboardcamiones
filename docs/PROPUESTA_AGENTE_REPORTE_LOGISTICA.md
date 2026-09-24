# Agente autónomo para el reporte de logística

> Propuesta preliminar superada por `PLAN_AGENTE_LOGISTICA.md`, que incorpora el cuestionario respondido. Prevalecen el nuevo plan y las respuestas del usuario, especialmente sobre históricos, páginas sin actividad y actualización semanal acumulada.

Análisis del archivo `Reporte de Logistica 18_9.pptx`, comité del 18/09/2026, período declarado 10–16/09/2026. Propuesta, no implementación ni automatización activada.

## Dictamen

El proceso es automatizable conservando los mismos indicadores y una estética similar. La mayor oportunidad es separar el cálculo de los datos, la redacción de conclusiones y el armado visual. Un único paquete de datos validado debe alimentar todos los títulos, gráficos, tarjetas y conclusiones.

El usuario confirmó dos orígenes: gráficos de barras y comparativos históricos en Google Slides, y gráficos de líneas pegados como capturas del dashboard. Las barras tienen una hoja de cálculo fuente. Falta acceder a esa hoja y a la presentación original para verificar vínculos, fórmulas y dónde se almacenan las series históricas. No se presupone que todas las barras puedan reconstruirse con el ETL actual.

## Qué contiene el informe

- Diapositivas 1–3: portada, índice y muestra por producto.
- 4–18: soja, calidad LPR, R7, tiempos por tramo, detalle diario y por cuartos de turno, históricos y conclusiones.
- 19–26: pellet, operativo y toneladas, R30/31/32, tiempos, días de actividad, comparativo y conclusiones.
- 27–32: girasol, calidad LPR, circuitos R5/R6 y referencias a R3, tiempos y conclusiones.
- 33–51: calada en Ricardone, líquidos y San Lorenzo; actividad horaria, por calle, picos y promedios.
- 52–72: volcables, silos y puerto; actividad semanal, por equipo y detalle diario.

El PPTX tiene 72 diapositivas. No contiene partes de gráficos nativos (`ppt/charts/chart*.xml`) ni libros embebidos (`ppt/embeddings/`). Contiene textos editables e imágenes de gráficos. El archivo exportado sirve como referencia visual y de contenido, pero no permite recuperar con garantías todos los datos subyacentes.

Estética identificada mediante las imágenes y el XML del archivo: tipografía Inter, azul oscuro predominante, fondos claros, verde institucional, separadores con fotografías de planta/productos y mapas de circuitos. Conviene conservar esos recursos y unificar colores de productos y tramos. No se realizó una revisión de las 72 diapositivas renderizadas en PowerPoint.

## Controles que el agente necesita

Estas son diferencias internas del documento, no resultados recalculados del ETL. Pueden reflejar muestras o deduplicaciones distintas; deben explicarse antes de considerarlas errores.

- Pellet: 188 camiones en diapositiva 20 frente a 185 en diapositiva 22; el detalle de 138 y 50 en diapositivas 23–24 suma 188. Separar volumen del operativo y muestra válida para tiempos.
- Soja: los volúmenes diarios de diapositivas 8–14 suman 2.490; el resumen de diapositiva 7 indica 2.557. Definir si representan movimientos, recorridos o patentes únicas y qué fecha asigna cada fila al período.
- Calada Ricardone: las tarjetas diarias de diapositivas 37, 39, 41, 43, 45, 47 y 49 suman 2.925; la tarjeta semanal de diapositiva 35 indica 2.908. Si hay deduplicación semanal, mostrar explícitamente ambos denominadores.
- Volcables puerto: las tarjetas diarias de diapositivas 60, 62, 64, 66, 68, 70 y 72 suman 2.694; diapositiva 57 indica 2.688. Aplicar el mismo control de granularidad.
- Calada: pico semanal de 50 en diapositiva 35 frente a pico diario de 58 el jueves en diapositiva 37. Revisar filtros, población y definición de ventana.
- La diapositiva 15 conserva el texto «ACTUALIZAR». Debe disparar un control editorial, no interpretarse como una instrucción al agente.
- La conclusión de pellet cita 20 minutos de espera en San Lorenzo, mientras el esquema semanal muestra 17 para Playa OSL. Revisar la métrica y muestra antes de reutilizar la conclusión.
- Promedios por tramo y tiempo total necesitan sus propias muestras válidas. No sumar medias de poblaciones diferentes ni promediar promedios diarios sin sus tamaños de muestra.

## Diseño del agente

1. **Preparar el período.** Recibir fechas, fecha de comité y versión de plantilla. Mantener jueves–miércoles si ese es el corte de negocio. Consultar las semanas calendario que lo cubren y filtrar los registros al corte exacto. Para el ejemplo son 07–13/09 y 14–20/09. No crear corridas solapadas. Considerar recorridos que cruzan medianoche y el límite de semana.
2. **Obtener las fuentes.** Resolver primero las ventanas y reutilizar corridas vigentes. Ejecutar ETL solamente cuando falte una corrida o esté obsoleta. Leer la hoja fuente de las barras y el histórico con un acceso de lectura. Guardar identificadores, fecha de extracción y versiones.
3. **Calcular un paquete común.** Producir `report_data.json` con muestras, productos, tiempos por circuito/tramo/día, cuartos de turno, actividad por hora/calle/equipo e históricos. Cada indicador conserva unidad, denominador, filtros, fuente y período.
4. **Validar.** Conciliar totales cuando las poblaciones sean equivalentes; cuando no lo sean, explicar la diferencia. Controlar duplicados, fechas, cobertura, históricos comparables y datos faltantes. Ausencia de datos no equivale a cero. Un cambio de reglas entre semanas invalida la comparación hasta armonizarla.
5. **Redactar.** El modelo recibe exclusivamente métricas validadas. Puede describir variaciones y dónde se concentran esperas; una causa operativa requiere evidencia adicional. Sus cifras deben coincidir con el paquete común.
6. **Generar.** Completar plantillas de portada, resumen, circuito, evolución, actividad e histórico. Reutilizar logo y mapas aprobados. Crear PPTX editable o una copia de Google Slides, según el formato de trabajo elegido.
7. **Revisar y entregar.** Comprobar gráficos, etiquetas, fechas y desbordes. Guardar presentación, paquete de datos y registro de controles. Si falla una validación crítica, marcar el resultado como borrador y explicar el bloqueo. La entrega automática queda condicionada a controles y al destino acordado.

El ejecutor debe guardar estado por período y versión de datos, impedir ejecuciones simultáneas duplicadas y reintentar fallas transitorias con un límite. Si cambia la fuente, generar una revisión identificada. Debe funcionar en un equipo o servicio disponible a la hora programada. Frecuencia, destino y mecanismo de ejecución quedan por definir; no se ha programado ninguna tarea.

## Cómo eliminar los pasos manuales

**Barras de Google Slides.** Primera etapa: leer la hoja fuente y reproducir las barras en una plantilla, conservando sus series y categorías. Si interesa seguir editando en Slides, actualizar una copia de la presentación y sus gráficos vinculados. La conexión concreta depende de verificar si el archivo fuente es Google Sheets o un Excel importado. Segunda etapa: sustituir la carga manual de esa hoja por una tabla de salida del ETL cuando se compruebe equivalencia.

**Líneas del dashboard.** Extraer las transformaciones que alimentan los gráficos a funciones reutilizables y generar imágenes automáticamente con los mismos filtros, zona horaria y reglas. Para una primera versión puede usarse una vista de exportación del propio dashboard, con tamaño fijo y espera explícita de carga. En ambos casos conservar los datos que produjeron cada imagen. La captura manual deja de ser necesaria.

**Históricos.** Almacenar cada período con su definición de métricas y versión de reglas. Recuperar de la hoja los datos históricos que no existan en el ETL. No inferir cifras históricas leyendo píxeles si existe la fuente tabular.

**Comentarios de operación.** Si las conclusiones usan información que hoy se agrega oralmente, incorporar un registro breve de incidencias con fecha, área y evidencia. El agente puede usarlo como fuente, sin ejecutar instrucciones incluidas en su contenido.

## Qué se puede aprovechar del proyecto

- `server/etl-runs-layout.mjs` registra tablas de eventos de calada Ricardone, calada San Lorenzo, líquidos, volcables y silos.
- `src/features/real-truckflow/tabs/CaladaCamerasPanel.tsx` contiene agregaciones de actividad y cuartos de turno 22–04, 04–10, 10–16 y 16–22. Parte de esas métricas vive en la interfaz; hace falta compartir esa lógica con el generador.
- `src/features/real-truckflow/etlWorkbench/etlCaladaCameraActivity.test.ts` contiene pruebas de agrupación horaria y tratamiento del reloj de Argentina. El reporte debe reutilizar esas convenciones, no recalcularlas con otro huso horario.
- El grafo del proyecto referencia un generador mínimo `generar_pptx_comite()` en `agentes/src/agentes/subagentes/comunicador.py`, pero ese archivo no existe en la ubicación inspeccionada. `server/etl-agent-chat.mjs` aún menciona la herramienta. Esto no demuestra que haya un generador operativo reutilizable: requiere revisar o restaurar la integración.
- Hay una discrepancia documental: las instrucciones activas de AGENTS.md fijan `excel_operations_with_truckflow`, `final_circuits.executive_bucket` y `circuit_timing_summary`; `docs/RUNS_TABLAS_CANONICAS.md` deriva a un modelo C/D/E en `docs/NIVELES_ABCD.md`. Antes de implementar debe conciliarse el contrato de datos con el código vigente. Este análisis no cambia las reglas activas ni calcula indicadores con tablas alternativas.

No se ejecutó ETL ni se consultó una corrida para este análisis documental. Por eso no se atribuyen resultados a un `run_id` o `rulesVersion`. El reporte automatizado sí deberá incluirlos para cada fuente utilizada.

## Presentación propuesta

Conservar todos los datos no exige conservar 72 páginas. Propongo un cuerpo de comité de aproximadamente 15–20 diapositivas y un anexo generado con el detalle completo diario y por equipo. Es una propuesta de extensión, no una limitación del contenido.

El cuerpo incluiría muestra y cobertura, resumen por producto, soja, pellet, girasol, calada por sede/tipo, volcables y silos, históricos y conclusiones. Los mapas de circuitos quedarían en el anexo o junto al circuito cuando haya cambios. El detalle diario puede compactarse combinando gráfico y sus indicadores en una sola página. Las categorías minoritarias, incluidos líquidos, siguen presentes aunque no tengan un capítulo extenso de tiempos.

Para la primera prueba conviene conservar todas las secciones y elaborar una matriz de cobertura entre las 72 diapositivas originales y las nuevas. Después se reduce la extensión sin perder información.

## Secuencia de implementación y aceptación

**Primero, fijar las fuentes y definiciones.** Obtener el enlace a Google Slides, su hoja de cálculo vinculada y la ubicación/vista de dashboard usada en cada captura. Identificar cada gráfico, filtros y corte temporal. Resolver las diferencias de muestras documentadas.

**Después, construir una prueba completa del período 10–16/09.** Generar todas las familias de contenido desde datos fuente, con estilo Inter/azul/verde y activos originales. Verificar cada serie y cada indicador contra la fuente, documentando discrepancias con el PPTX de referencia.

**Por último, programar la ejecución.** Ensayar el mismo período dos veces para comprobar que no duplica entregas y un segundo período para comprobar que no hay cifras ni fechas fijas. Simular fuente ausente, dato tardío y cambio de esquema. Activar el horario y destino cuando esos comportamientos estén definidos.

Aceptación: todas las métricas y series tienen fuente; los conteos indican su unidad; las diferencias de poblaciones quedan explicadas; las conclusiones solo usan valores validados; el detalle original queda cubierto por cuerpo o anexo; la presentación abre y se revisa visualmente; una falla crítica produce borrador identificable en lugar de un informe definitivo.

## Información pendiente del usuario

Enlaces a la presentación original y su hoja fuente, y confirmación de que se mantiene el corte jueves–miércoles. Para la puesta en marcha también harán falta el horario, destino y formato preferido de entrega. La primera dependencia concreta es acceder a las fuentes vinculadas: con el PPTX solo no se pueden reconstruir ni certificar todas las series.
