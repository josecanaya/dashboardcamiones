# Traspaso — modelo de capacidades de circuitos Ricardone / San Lorenzo

**Fecha del traspaso:** 9 de septiembre de 2026  
**Objetivo original:** construir un modelo integral de capacidades para conocer la capacidad individual y conjunta de los circuitos activos, especialmente la capacidad real de R7 cuando comparte recursos con otros flujos.

## 1. Instrucción central para continuar

No tratar los códigos de cámara como capacidades que puedan sumarse entre sí. La matriz describe recorridos detectables. El modelo debe agruparlos por **flujo físico real**, recurso compartido, horario de operación, stock disponible y capacidad observada.

El resultado buscado no es una tabla de tasas teóricas. Debe permitir responder:

1. Cuál es la capacidad real de R7 por día y por semana.
2. Cuánto cambia R7 cuando operan pellet, líquidos, Renova y los demás circuitos que usan recursos compartidos.
3. Qué recurso limita cada combinación de operación.
4. Cuál es la capacidad máxima comprobada, y cuál es una proyección que todavía deba validarse.

## 2. Correcciones y exclusiones obligatorias

- **Silo Australiano no se usa actualmente.** Desestimar R2, R10, R27 y SL9 del modelo operativo vigente.
- R26–R32 no tenían pesaje de egreso marcado en la matriz. El usuario indicó que debe agregarse ese paso de pesaje de egreso en San Lorenzo.
- Los sectores que aparecen en la secuencia de cámaras no siempre representan una operación. Una cámara puede ser solo paso o cobertura. No deducir consumo de capacidad de un recurso solamente porque aparece en una secuencia.
- En particular, los transiles de pellet R30–R32 **no deben descontar capacidad de Líquido OSL** por el paso de cámara. Descargan en volcables de San Lorenzo.
- No multiplicar tasas horarias por 168 horas semanales salvo que exista confirmación de operación continua durante toda la semana.
- No usar como dato válido la frase previa de que R7 podía hacer 600 camiones/día o 4.200/semana. El usuario indicó expresamente que ese no es el número correcto para R7.

## 3. R7 — datos conocidos

### Recorrido

R7 es el circuito de soja Ricardone → San Lorenzo → volcables. La matriz lo identifica como recepción de R7 en SL y el recorrido general es:

`Ingreso RIC → Preingreso → Calada RIC → Salida 2 RIC → traslado interplanta → ingreso SL → playa de volcables → balanza ingreso SL → volcables → balanza egreso SL → egreso`.

### Datos históricos y operativos confirmados

- Histórico usual: **2.500–3.500 camiones por semana**.
- Máximo histórico citado: **3.800 camiones por semana**, el **17/06**, con **338 min** de estadía media.
- Semana más reciente relevada: R7 cerró en **296 min**, una mejora de **71 min** contra la referencia previa de 368 min.
- El usuario consultaba la capacidad posible con metas de **296 min** y **240 min**. No convertir esos tiempos en camiones adicionales por una regla proporcional sin validar el sistema completo.
- Reporte de comité de fines de agosto: valores diarios R7 observados de **378, 582, 492, 488 y 404 camiones** en los días informados. El máximo diario visible en ese reporte fue 582.
- Tramos que se venían identificando como críticos: **Playa 1** y **Playa OSL**.

### Capacidades físicas y datos de recursos R7

- Calada Ricardone: **3 caladores instalados**, habitualmente trabajan 2.
- Cada calador: **30 camiones/h**. Capacidad habitual de calada RIC: **60 camiones/h**.
- Calada RIC: 6 calles; dos turnos, con **20 min** asociados a los cambios de turno.
- Egreso Ricardone: aproximadamente **30 segundos por camión**.
- Traslado Ricardone–San Lorenzo: aproximadamente **15 min** de ida.
- Ingreso San Lorenzo: aproximadamente **1 min por camión**.
- Calada San Lorenzo: 1 calle, **10 camiones/h**; su demanda habitual se informó cerca de 4 camiones/h.
- Balanzas de ingreso y salida de San Lorenzo: aproximadamente **38 camiones/h**, equivalente a **1,5 min por pesaje**.
- Limpieza de cada balanza de SL: **15 min diarios**.
- Volcables de San Lorenzo: 5 plataformas. Referencia: alrededor de **1 camión cada 7 min por plataforma**.
- Limpieza de cintas/volcables: a las 06:00 se detienen todas durante **45 min** y luego existen **3 limpiezas diarias de 30 min**.
- Volcables operativos observados: recientemente suelen funcionar 3–4; en algunos períodos 4 para soja/pellet.
- Playas de Ricardone: 2, capacidad total informada de **450 camiones**.

### Dato crítico pendiente

El usuario afirma que ya informó el número correcto que limita R7, pero la transcripción disponible de esta conversación no permite recuperarlo con certeza. No reemplazarlo por 600/día, 4.200/semana, 6.317/semana ni ninguna cifra derivada. Recuperar ese dato directamente del historial completo o consultarlo antes de cerrar el modelo.

## 4. Capacidad y reglas de los demás flujos activos

| Flujo / sector | Dato confirmado | Regla de modelado |
|---|---:|---|
| Celda 16 — recepción | 2 plataformas, **11 camiones/h entre ambas** | Camión estándar: 30 t. Recibe solamente si hay espacio. |
| Celda 16 — almacenamiento | **100.000 t** | Equivale a ~3.333 camiones de 30 t. Cuando está llena, la recepción es 0. |
| Celda 16 — carga | 2 puntos, **5 camiones/h entre ambos** | No puede recibir y cargar simultáneamente. |
| Líquidos RIC — descarga | **4 camiones/h** | Sector de bajo uso, con tanques; no hay cámara. Capacidad de tanques no conocida. |
| Playa 3 RIC | 30 camiones físicos | Solo espera y clasificación por destino; calles por producto. Nunca debe llenarse porque bloquea circulación. |
| Carga SP | **4 camiones/h** | Carga pellets de girasol/pellets. Opera por operativos, no de modo continuo. Limpiezas entre operativos. |
| Volcables 1 y 2 RIC | **4–5 camiones/h entre ambas** | Reciben girasol. Limpieza: 1 h diaria. Pueden operar junto con Carga SP. No asignar 4–5/h a cada plataforma simultáneamente. |
| Silo Keppler | **1 punto de descarga, 4–5 camiones/h** | Recibe soja/girasol; limpieza diaria de 1 h y paradas habituales semanales. |
| Silo Chief | **1 punto de descarga, 4–5 camiones/h** | Mismas condiciones declaradas para los silos. |
| Carga desde silos | 3 puntos de carga, **4–5 camiones/h cada uno** | Total indicado: 12–15/h. No puede ocurrir simultáneamente con la recepción de silos. |
| Silos — paradas | 1 h diaria + **8 h semanales** | El usuario no confirmó si detienen todo el sistema o solo el punto intervenido. |
| Líquido OSL | 2 puestos, carga/descarga, **6 camiones/h entre ambos** | Aceites/líquidos. Opera permanentemente. Limpieza 2 h/día. Puede cargar en un puesto y descargar en otro, pero el total conjunto no supera 6/h. Tiene tanques y puede bloquearse cuando se llenan. |
| Líquido Puerto | Igual que Líquido OSL | Mismas condiciones: 2 puestos, 6/h total, carga y descarga simultáneas, 2 h/día limpieza, tanques. |
| Renova | Descarga externa | Vicentin presta servicios de ingreso/controles/balanzas; descarga dentro de Renova. Solo hay cámara de ingreso. No inventar capacidad de descarga. |

## 5. Circuitos prioritarios indicados por el usuario

El usuario pidió concentrarse en:

`R1, R3, R4, R5, R6, R7, R8, R13, R14, R15, R30–R35, SL1, SL2 y SL3`.

Aclaración: la matriz cargada llega hasta **R34**. R35 no está definido en esa matriz y debe mantenerse como pendiente hasta contar con su secuencia real.

## 6. Cómo agrupar los circuitos para no duplicar volúmenes

Esta es una hipótesis de trabajo que debe validarse contra la operación, no un hecho cerrado:

1. R13–R15 representan las cargas desde Tolvas 9, 10 y 11.
2. R30–R32 parecen representar los transiles de ese pellet desde Ricardone hacia San Lorenzo.
3. Si son el mismo viaje físico en distintos tramos, no se suman como dos demandas independientes: se modelan como un único flujo de pellet Ricardone → San Lorenzo.
4. R8 representa líquidos en Ricardone y R33/R34 los movimientos de líquidos hacia SL. Revisar si también son etapas de un mismo flujo físico antes de sumar.
5. R5 y R6 comparten los dos volcables de Ricardone: el conjunto no supera 4–5 camiones/h.
6. Los transiles y retornos deben modelarse por viajes, no por patentes únicas.

## 7. Capacidad de flota para el pellet

Para Carga SP y transiles Ricardone–San Lorenzo:

`capacidad de flota = (cantidad de camiones × 60) / minutos de vuelta completa`

La vuelta completa debe incluir: carga en Ricardone, viaje a SL, descarga en SL, salida/retorno y reingreso a Ricardone. Solo se conoce aproximadamente la ida Ricardone–SL: 15 min. Faltan retorno y demoras de carga/descarga para calcular el límite real de flota.

## 8. Recursos compartidos a modelar

### Ricardone

- Ingreso, preingreso y calada: recepción de sólidos y movimientos que pasan por estos controles.
- Balanza de ingreso/egreso RIC: aplica a circuitos que efectivamente pesan allí; R7 no tiene marcado el paso por balanza RIC en la matriz.
- Playa 3: buffer de 30 camiones; se llena por destino/calle, no solo por total.
- Volcables 1–2: comparten 4–5/h.
- Keppler y Chief: cada uno tiene su punto de descarga.
- Carga SP: única para Tolvas 9–11.
- Celda 16: comparte tiempo entre recibir y cargar; depende de stock.
- Líquidos: tanque y operación limitan la recepción.

### San Lorenzo

- Balanza de ingreso y egreso: recursos centrales para los circuitos que realmente pesan.
- Volcables: R7 y transiles de pellet compiten si descargan allí.
- Playa OSL / espera de volcables: puede trasladar la congestión hacia atrás.
- Líquido OSL y Líquido Puerto: tienen sus propios límites de 6 movimientos/h cada uno.
- Renova: consume servicios previos/posteriores de Vicentin, pero la descarga externa es una caja negra.

## 9. Ecuaciones correctas para el modelo

Para cada día y recurso compartido:

`uso del recurso = suma de viajes reales de cada flujo que requiere el recurso`

`uso del recurso ≤ capacidad real observada/programada de ese día`

Para R7, una vez confirmado el límite diario correcto y los movimientos diarios reales de cada flujo que usa los mismos recursos:

`R7 disponible = capacidad diaria del recurso limitante − consumo real de los otros flujos compartidos`

No usar una ecuación proporcional del tipo `camiones nuevos = camiones históricos × tiempo histórico / tiempo objetivo` como resultado final. Reducir la estadía puede permitir mayor rotación, pero no crea capacidad si se saturan balanzas, volcables, playas, stock o flota.

Para depósitos donde no se puede cargar y recibir a la vez:

`horas de recepción + horas de carga ≤ horas realmente disponibles`

Para stock:

`stock siguiente = stock actual + toneladas recibidas − toneladas retiradas`

Restricciones de stock necesarias:

- Celda 16: 0 a 100.000 t.
- Silos y tanques: capacidades aún no relevadas.

## 10. Errores previos que deben descartarse

No usar como conclusiones válidas:

- 6.317,5 camiones/semana para R7 por balanzas SL.
- 6.525 camiones/semana por volcables SL.
- 950 camiones/día para R7.
- 4.200 camiones/semana como capacidad real de R7.
- 4.339 camiones/semana para R7 a 296 min por regla proporcional.
- 5.352 camiones/semana para R7 a 240 min por regla proporcional.
- Capacidad semanal de otros circuitos calculada como tasa/h × 168 h sin validar horas reales de operación.
- Restar a R7 por cada código de cámara sin determinar si representa un servicio real ni si los códigos son etapas del mismo viaje.

## 11. Archivos disponibles en el proyecto

- `Matriz de circuitos (1).xlsx`: matriz principal de circuitos y secuencias por cámara en Ricardone, San Lorenzo y Avellaneda.
- `circuitos_camaras_tabla_ricardone.xlsx`: secuencias detalladas de Ricardone.
- `circuitos_camaras_tabla_SL.xlsx` y `san_lorenzo_circuitos_camaras.xlsx`: secuencias detalladas de San Lorenzo.
- `SECUENCIA_CAMARAS_RICARDO.md` y `SECUENCIA_CAMARAS_san-lorenzo.md`: documentación textual de secuencias.
- `DENSIDAD CAMARAS.txt`: capacidad espacial estimada de áreas y playas. San Lorenzo: ~231/234 camiones; Ricardone: ~803/804 camiones. Es capacidad de ocupación, no tasa de procesamiento.
- `circuitos_ricardone.pdf`, `circuitos_avellaneda.pdf` y `Circuitos_ricardone.pptx`: soportes gráficos.
- `Template Comite - Informe`: plantilla de presentación/informe.

## 12. Próximo trabajo recomendado para el nuevo agente

1. Recuperar el número correcto de R7 que el usuario informó y reemplazar cualquier interpretación previa.
2. Revisar la matriz junto con el usuario para identificar qué códigos son etapas de un mismo viaje físico.
3. Elegir una semana real de movimientos por contrato y clasificar cada viaje en los flujos físicos activos.
4. Armar una tabla diaria: R7, pellet a SL, líquidos, Renova y otros movimientos que usan cada balanza/volcable.
5. Contrastar cada día con las capacidades y paradas realmente ocurridas, no con 168 h teóricas.
6. Validar los resultados contra semanas históricas de R7, especialmente la de 3.800 camiones y 338 min.
7. Recién después simular escenarios: R7 solo, R7 + pellet, R7 + líquidos, R7 + pellet + líquidos y R7 + todos los flujos activos.
