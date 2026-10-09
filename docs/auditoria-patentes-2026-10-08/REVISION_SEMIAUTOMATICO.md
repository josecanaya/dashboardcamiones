# Reconocimiento semiautomático: universo por nodo y relevancia logística

Fecha: 8 de octubre de 2026. Alcance: reconocimiento de patentes y flujo de revisión en vivo. Código inspeccionado: `plateIdentification.mjs`, `identificationEvidence.mjs`, `dssPhotoLookup.mjs`, `service.mjs`, `sectorProfiles.mjs`, `CandidateOdds.tsx`, `PlateVerification.tsx` y `ReviewCandidates.tsx`. Evidencia reproducible: `resultados.json`, generado con `node scripts/audit-plate-semi-auto.mjs`. El registro de decisiones sigue creciendo; estas cifras corresponden a la instantánea de las 15:30:45 UTC.

## Conclusión operativa

El sistema ya utiliza secuencias de circuitos, tiempos y un universo preferente. Es una base útil, pero todavía combina identificación, relevancia del vehículo y confianza automática. Conviene separar esas decisiones: primero identificar los camiones que podrían estar llegando al nodo; después determinar si la captura es relevante; finalmente resolver la identidad mediante patente, recorrido y fotos. Un vehículo nuevo o una cámara perdida debe seguir teniendo una vía de revisión.

El 42% de CFK006 no demuestra que CFK008 sea correcta. El modelo penaliza una diferencia de un carácter y dos atributos de cámara que visualmente parecen incorrectos. Tampoco es una probabilidad de acierto certificada.

## El caso CFK008 / CFK006, reproducido

La similitud es 5/6 = 83,33%. El par 6↔8 no recibe el costo reducido de las confusiones especiales. El peso de patente resulta `exp(8 × (0,8333 − 1)) = 0,263597`.

El paso esperado aporta 1. La discrepancia de color aporta 0,728 y la de tamaño de camión 0,759; la marca desconocida aporta 1. El producto es `0,263597 × 1 × 0,728 × 0,759 = 0,145651`. La alternativa residual tiene un peso fijo de 0,20. Normalizando: `0,145651 / (0,145651 + 0,20) = 42,14%`; el resto es 57,86%.

Esto reproduce el porcentaje de la imagen bajo esas evidencias y un candidato. Con otros candidatos el denominador cambia. El residual agrupa “lectura correcta”, “otro vehículo” y “candidato ausente”; no identifica cuál de esas explicaciones ocurrió. Las dos fotos son compatibles visualmente con el mismo vehículo, pero esa inspección no permite medir una precisión global.

Agregar 6↔8 a confusiones baratas elevaría el apoyo, pero también podría fusionar patentes reales parecidas. No se cambió ese costo ni se bajaron umbrales por un solo ejemplo.

## Qué existe hoy y qué falla

- El universo usa circuitos compatibles por subsecuencia, último nodo, probabilidad de próximo nodo o alcanzabilidad y tiempo de tránsito. Tolera cámaras perdidas. Prioriza candidatos dentro del universo y mantiene alternativas externas para revisión.
- La alcanzabilidad permite nodos posteriores aunque haya pasos intermedios. No equivale a un inventario exacto de camiones pendientes de pasar por una balanza. El mismo nodo se trata como compatible durante 30 minutos y las lecturas gemelas durante 3 minutos; proximidad temporal no demuestra identidad, especialmente con carriles distintos.
- El catálogo lógico colapsa las balanzas de Ricardone en S4. Así se pierde información de dirección, carril y fase ingreso/egreso. La identidad del dispositivo está disponible y debe formar parte de la validación de transición.
- Hay referencias futuras, hasta tres horas después. Sirven para reconstruir históricos. Antes de esta revisión podían participar en el universo y completar el número mínimo de lecturas que habilita automatismos. Se corrigió ese uso de evidencia posterior.
- El puntaje de candidatos y el de evidencia no expresan el mismo criterio. El ranking inicial prioriza universo; la evidencia usa un piso de recorrido de 0,7 cuando existe circuito. Incluso una probabilidad de nodo de 0,05 puede recibir 0,7. Al ordenar nuevamente por evidencia, la interfaz puede devolver protagonismo a un candidato ajeno al universo.
- La evidencia DSS calcula sobre hasta tres candidatos y la salida del reconocedor conserva cinco. “Ver todos” agrega candidatos sin porcentajes equivalentes. No existe un denominador estable para comparar porcentajes entre distintas listas o momentos.
- Color, marca y tipo se multiplican como si fueran evidencia independiente. No se modela su dependencia, fiabilidad por cámara, iluminación ni los errores marcados por operaciones. La confianza OCR se consulta y muestra, pero no entra en `scoreCandidates`.
- La caché de evidencia dura diez minutos y se indexa por planta/caso. Una actualización de candidatos puede seguir recibiendo evidencia antigua; debe incluir una huella de candidatos, fotos y versión del modelo.
- El aprendizaje automático todavía no está conectado: guardar una corrección no implica entrenar ni validar una nueva versión.

## Qué dice el registro humano

Se leyeron 286 entradas y se conservó la última acción por planta/caso: 226 casos, con 194 confirmados, 31 rechazados y uno diferido. De los confirmados, 183 tienen patente leída y final: 102 cambian la patente y 81 mantienen la lectura.

En 101 correcciones con sugerencia registrada, la sugerencia coincide con la decisión en 76 (75,25%). Eso mide recuperación de la sugerencia entre casos que el operador corrigió, no precisión automática: excluye muchos vehículos correctamente leídos, conserva sesgo de selección y no representa una evaluación independiente.

Solo 44 correcciones conservan una lista de candidatos; en esas 44 la decisión aparece entre los tres primeros. Quince de las 44 referencias elegidas son posteriores al evento. El resultado retrospectivo no debe presentarse como rendimiento en tiempo real.

Hay 72 confirmaciones con contexto en las cámaras frontales Egreso C1/C2 y siete en TK400. Son decisiones, no todos los vehículos observados. De los 31 rechazos, 22 carecen de motivo. Este registro no permite cuantificar qué porcentaje del tráfico son particulares ni afirmar que una regla ya eliminaría “la mayoría”. Se necesita etiquetar una muestra del feed completo, incluyendo capturas que nunca llegaron a la bandeja.

Los comentarios actuales del modelo mencionan 7/7 o 5/5 aciertos para justificar umbrales. Aun suponiendo ensayos representativos e independientes, el límite inferior exacto unilateral al 95% sería aproximadamente 65,18% y 54,93%, respectivamente. Para un límite inferior de 98% harían falta al menos 149 éxitos independientes sin errores. Las repeticiones de un viaje no son ensayos independientes; además, hace falta cubrir cámaras y condiciones distintas.

## Universo que necesita cada nodo

Mantener estado por **visita**, no solo por patente: planta, cámara/dirección, pasos confirmados, último paso, hora y estado de salida. Comparar exclusivamente contra lo que se conocía al producirse la captura.

1. **Ingreso inicial:** admitir un vehículo nuevo; no forzar asociación con el inventario interno. El formato de patente por sí solo no distingue camión de particular.
2. **Calada:** priorizar visitas con ingreso/preingreso previo y transición compatible. Si falta esa cámara, ofrecer una excepción explícita con fotos, sin corregir automáticamente por parecido.
3. **Balanza ingreso:** candidatos pendientes de ingreso por el circuito y la dirección real de esa cámara. No mezclar automáticamente con visitas que ya terminaron el egreso.
4. **Volcable:** candidatos con paso previo compatible de balanza/espera; quitar del inventario de pendientes al confirmar la descarga. Mantener una excepción por lectura faltante o repetición legítima.
5. **Balanza salida:** visitas descargadas/cargadas que siguen dentro de la planta; considerar las excepciones previstas por circuito.
6. **Egreso San Lorenzo:** prioridad a visitas internas aún abiertas. Un vehículo sin recorrido logístico y con apariencia de particular pasa a revisión de relevancia, no a comparación intensiva de patentes de camiones.
7. **TK400 / Ingreso Renova:** es una cámara de acceso compartido, no prueba de descarga. Separar camiones con una visita logística compatible de camionetas/servicio que solo pasan por ese acceso. Validar con operación cuáles son las transiciones legales; no deducir dirección solo del nombre TK400.
8. **Entre plantas:** admitir cruces únicamente con circuito compatible, salida anterior y tiempo plausible. Otra lectura con patente parecida en la otra planta no basta.

Mostrar dos grupos: “Esperados en este punto” y “Excepciones / referencia posterior”. Una excepción puede ser confirmada por el operador, pero no habilita corrección automática. El estado debe explicar por qué entra o sale del universo.

## Estrategia para particulares y camionetas

Crear una clasificación de relevancia separada de la identidad, con estados `camión operativo`, `posible particular/servicio` e `indeterminado`. No eliminar automáticamente una visita por una única etiqueta DSS.

Dar prioridad operativa si la visita tiene evidencia de balanza/descarga/carga compatible o una confirmación humana de camión. Para un posible particular exigir concurrencia de evidencia: cámara compartida, ausencia de recorrido logístico conocido y categoría no camión corroborada en capturas independientes. Si esas señales se contradicen, conservar el caso como indeterminado.

Al principio, “posible particular” debe ir a una cola secundaria recuperable, con revisión visual rápida y motivos claros: particular, camioneta de servicio, tractor/maquinaria, falsa detección o camión con lectura mala. Conservar las fotos y permitir devolverlo a operación. La decisión afecta esa visita; no debe convertirse automáticamente en una prohibición permanente de esa patente.

Agrupar capturas repetidas solo después de comprobar misma visita/vehículo. Egreso C1/C2 pueden ver camiones diferentes casi simultáneamente. El agrupado por parecido de patente o cercanía temporal puede ocultar un camión real.

Medir por nodo: capturas totales, particulares confirmados, casos enviados a cada cola, minutos de revisión, camiones recuperados de la cola secundaria y descartes erróneos. Evaluar una muestra aleatoria de las capturas filtradas; si solo se revisa la cola visible, se ocultan los falsos descartes.

## Cómo aprender sin automatizar errores

Guardar en cada decisión: visita, cámara, tiempo de captura y decisión, candidatos completos disponibles en ese instante, motivo, fotos, versión del modelo, huella de evidencias y atributos corregidos. Separar “misma identidad” de “cuál patente es correcta”.

Entrenar confusiones OCR por posición/formato y cámara con regularización; modelar fiabilidad de atributos por cámara y condición. No aprender una regla permanente CFK008→CFK006 por una sola visita. El costo 6↔8 debe validarse contra positivos y negativos parecidos, incluyendo vehículos diferentes con matrículas válidas.

Validar por bloques temporales futuros, agrupando por visita y vehículo para evitar contaminación entre entrenamiento y evaluación. Usar solo evidencia anterior para el resultado online y publicar otro resultado separado para revisión retrospectiva. Comparar contra el modelo actual en modo sombra, sin aplicar cambios al feed.

Medir recuperación del candidato correcto, precisión de correcciones automáticas, cobertura automatizada, abstenciones, falsos descartes de camiones y carga del operador. Reportar tamaño de muestra e incertidumbre por cámara/nodo. Promover reglas automáticas solamente con evidencia representativa y seguimiento de errores; mantener revisión humana para las patentes válidas parecidas sin corroboración suficiente.

## Cambios ejecutados en esta revisión

- Las referencias posteriores permanecen visibles, pero salen del universo automático y no habilitan correcciones por gemelas futuras.
- El mínimo de lecturas del candidato cuenta solo capturas anteriores al evento. Las decisiones humanas siguen pudiendo usar una referencia posterior.
- El residual dejó de titularse “La cámara leyó bien” en el gráfico. Ahora se llama “Ningún candidato listado”, sin atribuir su porcentaje a la certeza de la patente original.
- La bandeja explica que los porcentajes expresan apoyo relativo y no una tasa de acierto certificada; el diálogo diferencia porcentaje residual de confirmación explícita del operador.
- Se agregó un script de auditoría reproducible y cinco pruebas de regresión temporal. Pasaron 36 pruebas en cuatro archivos del reconocedor, evidencia y búsqueda de predecesores.

## Trabajo siguiente, todavía no implementado

La cola secundaria de relevancia, el inventario por visita/dirección, la calibración por cámara, la huella de caché y el modelo de confusiones aprendido requieren implementación y validación. En esta revisión no se descartaron particulares automáticamente ni se cambió el cálculo del 42%, los costos OCR o los umbrales de aplicación. Los cambios anteriores corrigen problemas concretos sin afirmar una precisión que todavía no se demostró.

## Verificación final

`npx vitest run server/plantState/plateIdentificationCausality.test.mjs server/plantState/plateIdentification.test.mjs server/plantState/identificationEvidence.test.mjs server/plantState/predecessors.test.mjs --maxWorkers=2`: 36/36 pruebas. `npx vite build`: compilación de la aplicación exitosa, con advertencias de tamaño de bundle. Esto no equivale a haber resuelto la deuda global de TypeScript del proyecto.

Backend reiniciado con el cambio; consulta HTTP de identificaciones de San Lorenzo: 200. Se comprobó la bandeja mediante la extensión Chrome: evidencia DSS disponible, residual identificado como Ningún candidato listado y referencia posterior marcada solo revisión humana / fuera del universo. La captura `verificacion-chrome.png` registra el resultado. No se confirmaron ni descartaron casos reales durante estas pruebas.

Al separar gemelas anteriores y posteriores, la prueba de navegador descubrió un acceso a un rival inexistente. Se corrigió antes de entregar y se añadió una prueba específica con ambos tipos de referencia. La pantalla también mostró datos de planta demorados durante el reinicio; esa observación no acredita la frescura del feed de cámaras.
