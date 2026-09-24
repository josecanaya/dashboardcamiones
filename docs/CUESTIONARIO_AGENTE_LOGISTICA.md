# Cuestionario para la plantilla y el agente de logística

Referencia: **Reporte de Logistica 18_9.pptx**, 72 diapositivas, comité del 18/09/2026.

Objetivo: definir juntos una plantilla completa que se actualice desde los datos centralizados, diariamente y semanalmente, y después automatizar su generación.

## Lo que ya está confirmado

- Toda la información proviene del **dashboard de camiones** y de los **Excel de movimientos por contrato**. No hay una tercera fuente de negocio.
- Los totales por producto de la **diapositiva 3** salen de **Resumen ejecutivo** del dashboard.
- Google Slides y sus hojas se utilizan para armar gráficos y comparativos; no serán una dependencia del proceso futuro.
- Los gráficos de líneas actuales son capturas del dashboard. El nuevo proceso deberá generarlos automáticamente desde sus datos.
- Primero definimos la plantilla; después construimos el agente que la completa.
- Partimos de las **72 diapositivas**, sin eliminar páginas ni bloques de información. La estética puede simplificarse.
- Deben conservarse los indicadores y su significado; sus valores se actualizarán según el período.
- Queremos actualización diaria y semanal, con posibilidad de ejecución automática.

## Cómo responder

Escribí debajo de cada **Respuesta:**. Podés contestar con los números de pregunta si te resulta más cómodo.

Para ubicar un dato alcanza con algo como: `Dashboard > sección > gráfico o tarjeta > filtros que selecciono`. No necesitás conocer nombres de tablas, fórmulas internas ni código.

Si varias respuestas usan la misma configuración, indicá «igual que Pxx». Si no sabés una definición, escribí **«verificar en el dashboard»**; esa investigación la hago yo. Si aceptás una propuesta, escribí **«de acuerdo»**. Las propuestas de este documento todavía no son decisiones tomadas.

Las preguntas de diferencias numéricas se basan en la presentación, no en una auditoría del ETL. No hace falta que investigues cada cifra para responder: sirve indicar cómo preparaste esas páginas.

## A. Período y actualización

### P01. Corte semanal

El ejemplo abarca jueves 10 a miércoles 16. ¿La semana del informe debe ser siempre jueves–miércoles? Si cambia según el comité, ¿cómo elegís el inicio y el fin?

**Respuesta:** SI DEBE SER SIEMPRE DE JUEVES - A MIERCOLES, SI POR ALGUN MOTIVO CAMBIASE EL PERIODO DEBERIAMOS PODER INFORMARLO PERO SE LE DEBE DAR EL LUGAR DE ATIPICO

### P02. Qué debe mostrar el informe diario

¿Querés el día anterior completo, el acumulado de la semana en curso o ambas vistas? ¿El informe diario debe conservar la estructura completa semanal e ir completando los días, o tener una versión diaria propia que mantenga los mismos tipos de información?

**Respuesta:** IR COMPLETANDO DE MANERA DIARIA EL INFORME SEMANAL A PRIORI, LUEGO ARMAREMOS UNO DIARIO QUE SEA INDEPENDIENTE DE ESTE

### P03. Día calendario y turno nocturno

¿Trabajás con días de 00:00 a 24:00 o con un día operativo que empieza a otra hora? Para Q1, 22:00–04:00, ¿las 22:00 pertenecen a la noche anterior al día rotulado o a la noche de ese mismo día? Si simplemente usás lo que muestra el dashboard, indicámelo.

**Respuesta:** SIMPLEMENTE USO LO QUE MUESTRA EL DASHBOARD, DEBERIA IGUALMETE TRABAJARSE DESDE LAS 22:00 EL COMIENZO DEL DIA

### P04. Datos disponibles y horario de entrega

¿A qué hora suelen estar completos los datos de cámaras y los Excel del día anterior? ¿A qué hora necesitás el informe diario, qué días de la semana, y qué día/hora necesitás el semanal? Asumimos horario de Argentina.

**Respuesta:** LOS EXCEL SUELEN ESTAR DISPONIBLES ENTRE LAS 09 Y LAS 12 HS DEL DIA PROXIMO, O SEA EL DIA 02 ESTAN DISPONIBLES LOS DEL DIA 01. EL INFORME DIARIO DEBERIA PODER REALIZARSE UNA VEZ QUE LLEGA EL EXCEL EL SEMANAL DEBE HACERSE EL JUEVES AL MEDIODIA

### P05. Correcciones y datos que llegan tarde

¿Se corrigen o completan días anteriores? ¿Hasta cuántos días después suele pasar? Propuesta: conservar el informe ya emitido y crear una revisión identificada cuando cambien sus datos.

**Respuesta:**  SE CORRIGE

## B. Dashboard y archivos de entrada

### P06. Dashboard de referencia

¿Qué dirección o acceso usás para abrir el dashboard con el que preparás el informe? ¿Es este proyecto local o hay otra instalación publicada que considerás la versión correcta?

**Respuesta:** EN ESTA INSTANCIA LOCAL

### P07. Preparación previa del dashboard

Antes de copiar los datos, ¿qué hacés normalmente: seleccionar fechas, cargar Excel, actualizar, procesar, elegir plantas u otra acción? Describí la secuencia habitual y los filtros que siempre dejás activos.

**Respuesta:**  SELECCIONE FECHA, CARGA DATOS DESDE TRUCKFLOW, ESO ES VIA API, SE HACE UNA EXTRACCION QUE SE GUARDA EN DAA LUEGO CARGO MANUAL  LOS EXCEL QUE ME ENVIAN POR CORREO, LUEGO SELECCIONO EL PERIODO A ANALIZAR SUELO HACERLO DESDE EL DIA QUE EMPIEZA EL JUEVES Y EL VIERNES HAGO SOLO JUEVES EL LUNES HAGO TOD EL FINDE, EL MARTES HAGO DESDE EL JUEVES AL LUNES ETC ETC.
LUEGO REVISO LOS KPI POR TIEMPO QUE ES UN PROCESAMIENTO MAS DENTRO DEL DASHBOARD Y DESDE AHI COPIO DATOS DE LOS CIRCUITOS Y DE LA CALADA Y DESCARGAS.

### P08. Llegada de los Excel

¿En qué carpeta quedan los archivos de movimientos por contrato y cómo llegan allí? ¿Hay un archivo por día, por planta, por contrato o un archivo acumulado? Indicá la ruta y un nombre de archivo de ejemplo; no hace falta incluir credenciales.

**Respuesta:** BUSCALO EN EL REPO EN DATA AHI ESTAN LOS EXCEL TRUCKFLOW EN RUNS CREO QUE SE GUARDAN LAS CORRIDA REVISA POR AHI

### P09. Reemplazos y versiones de Excel

Cuando llega un Excel corregido, ¿reemplaza al anterior o contiene solo novedades? ¿Cómo reconocés cuál es el definitivo? ¿Hacés modificaciones antes de cargarlo al dashboard?

**Respuesta:** NUNCA TIENE CORRECCIONES

### P10. Datos que obtenés directamente del Excel

Además de lo que ves en el dashboard, ¿qué cifras de la presentación buscás directamente en el Excel? Para cada una, indicá el bloque o diapositiva, la hoja/columna si la recordás y cualquier filtro o suma manual que hagas.

**Respuesta:**  ESA DATOS ESTAN EN EL DASHBOARD CAMIONES, DE AHI SE CONSULTAN ALGUNAS COSAS ES UN SOFTWARE COMPLEJO

### P11. Ajustes manuales y prioridad de fuentes

¿Corregís alguna cifra, excluís registros o cambias productos/circuitos al preparar el informe? Si dashboard y Excel no coinciden, ¿cómo decidís hoy qué mostrar? Propuesta: registrar la diferencia y su motivo, sin reemplazar silenciosamente un valor por otro.

**Respuesta:**  A VECES DECIDO LO QUE ME CONVIENE MOSTRAR DE LAS DOS COSAS

## C. Muestra y calidad de lectura — diapositivas 3, 5 y 28

### P12. Configuración del Resumen ejecutivo

Ya sabemos que la diapositiva 3 sale de Resumen ejecutivo. ¿Qué filtros usás allí y qué tarjeta o cifra copiás para cada producto? ¿Incluís todas las plantas, todos los movimientos y todos los estados, o seleccionás un subconjunto?

**Respuesta:**  REVISA BIEN LO QUE SE VE AHI NO ME PREGUNTES OBVIEDADES

### P13. Productos y grupos

¿Los grupos del informe deben seguir siendo soja, girasol, líquidos y pellet? ¿Qué nombres del Excel agrupás bajo líquidos y pellet? ¿Qué debe pasar si aparece un producto nuevo o sin clasificar? Propuesta: mostrarlo explícitamente y mantener los grupos habituales aunque no tengan actividad.

**Respuesta:**   REVISA BIEN LO QUE SE VE AHI NO ME PREGUNTES OBVIEDADES ESA INFORMACION ESTA EN EL SOFTWARE DASHBOARD

### P14. Qué significa «camiones»

¿Usás siempre el conteo tal como lo muestra cada pantalla, o hacés algún ajuste para contar patentes distintas? Por ejemplo, si una patente hace dos viajes, ¿querés mostrar dos operaciones, un camión único o ambos indicadores identificados? Si depende del bloque, indicá dónde.

**Respuesta:** REVISA BIEN LO QUE SE VE AHI NO ME PREGUNTES OBVIEDADES ESA INFORMACION ESTA EN EL SOFTWARE DASHBOARD

### P15. Calidad LPR

¿En qué sección obtenés «todas las cámaras», «7 cámaras», «6 cámaras», etc., y la cámara con más fallas de lectura? ¿Qué filtros aplicás para soja y girasol? ¿«Patentes no leídas» es el nombre exacto del indicador o una descripción que agregás vos?

**Respuesta:**  ESO SE HACE EN LA CALIBRACION DE CAMARAS DENTRO DEL DASHBOARD DEL SOFTWARE, LO QUE SI HAGO ACA ES AGRANDAR UN POCO EL NUMERO DE LAS QUE TOMAN TODAS LAS PATENTES Y LOS QUE TOMAN MENOS DE CUATRO SE LO SUMO A TODAS LAS PATENTES

## D. Circuitos, tiempos y turnos — diapositivas 4–32

### P16. Pantalla de tiempos

¿En qué sección y gráfico obtenés los tiempos por tramo, el tiempo total y los subtotales de Ricardone/San Lorenzo? Indicá cómo seleccionás circuito, producto y período. ¿Copiás todo de una misma vista o combinás varias?

**Respuesta:** COMBINO VARIAS, VEO LAS KPI POR TRAMO VOY VIENDO EL CIRCUITO , Y DE AHI COPIO DIA POR DIA Y LUEGO EL SEMANAL DE TODOS LOS DIAS.

### P17. Indicador y filtros de tiempos

¿Copiás la media, mediana u otro valor del dashboard? ¿Activás filtros de duración, exclusión de casos extremos, calidad de recorrido o cualquier otro? Si no tocás nada, respondé «configuración predeterminada».

**Respuesta:**  REVISA BIEN LO QUE SE VE AHI NO ME PREGUNTES OBVIEDADES ESA INFORMACION ESTA EN EL SOFTWARE DASHBOARD

### P18. Total y subtotales

¿El tiempo total y los subtotales por planta los copiás del dashboard o sumás los tramos manualmente? ¿Los cambios frente a la semana anterior y las conversiones a horas/minutos también los calculás vos?

**Respuesta:**     SUMO LOS TRAMOS MANUALMENTE  SI LO CALCULO YO

### P19. Agrupación de circuitos

La presentación usa R7 para soja, R30/31/32 para pellet y R5+R6 con referencias a R3 para girasol. ¿Esas agrupaciones deben mantenerse? ¿Incluís otros circuitos cuando aparecen, y dónde los mostrás? No necesitás explicar las reglas técnicas de clasificación.

**Respuesta:**  SI CUANDO APARECEN OTROS CIRCUITOS LOS INCLUYO O SI CAMBIAN DE PRODUCTO POR EJEMPLO R3 R4 A VECES HACEN SOJA A VECES HACEN GIRASOL

### P20. Mapas y nombres de tramos

¿Los mapas y recorridos de las diapositivas 6, 21 y 29 siguen vigentes? ¿Hay nombres de tramos o equipos que debamos corregir? Propuesta: reutilizar los mapas como imágenes estáticas y actualizar los indicadores a su alrededor.

**Respuesta:** SIGUEN VIGENTES TODOS

### P21. Volúmenes por día y por Q1–Q4

¿De qué pantalla sacás los camiones diarios y los cuatro cuartos de turno? ¿Es la misma vista de tiempos o una de actividad? ¿Hacés algún filtro adicional? La asignación temporal de Q1 se responde en P03.

**Respuesta:**  ES LA MISMA VISTA DE TIEMPOS

### P22. Operativo de pellet

Para la diapositiva 20, ¿cómo obtenés las toneladas y las fechas de inicio/fin? ¿Qué identifica un operativo: contrato, producto, rango de fechas u otra selección? ¿Qué hacemos cuando hay varios operativos o uno atraviesa dos semanas?

**Respuesta:**  MULTIPLICO LA CANTIDAD DE CAMIONES X 30 PARA CALCULAR LAS TONELADAS.  LOS OPERATIVOS SE IDENTIFICAN PORQUE DURAN VARIOS DIAS Y DESPUES Y ANTES NO HAY NADA POR EJEMPLO SI HAY ELLET LUNES MARTES Y MIERCOLES Y LUEGO NO HAY MAS DURO ESO TRES DIAS, SUELEN DURAR ENTRE 3 Y 5 DIAS

### P23. Girasol y R3

La conclusión de la diapositiva 32 compara R5+R6 con R3. ¿De qué vista obtenés R3 y cómo querés conservar esa comparación en la plantilla? ¿La diapositiva 31 tiene todo el detalle que necesitás o hoy falta una página específica?

**Respuesta:**  R3 DE LOS KPI R4 ES SIMILAR A R3 ES LO MISMO, NO SE COMO FIGURA EN LOS KPI POR TIEMPO

### P24. Semanas con diferente actividad

En el ejemplo hay siete páginas diarias de soja y dos de pellet. ¿El detalle de pellet debe crecer según los días con actividad? Si no hay actividad de un producto, propongo conservar sus páginas habituales con «sin actividad», diferenciándolo de «datos pendientes».

**Respuesta:**  NO NO SI NO HAY ESOS DIAS NI MUESTRES PAGINA NO HAY ACTIVIDAD DE todos LOS PRODUCTOS TODOS LOS DIAS.

## E. Históricos — diapositivas 15–17, 25 y 31

### P25. Reconstrucción de históricos

Sabiendo que todo se origina en dashboard y Excel: ¿los valores que fuiste cargando en los gráficos históricos se pueden consultar otra vez para esas fechas? ¿Desde qué fecha están disponibles? ¿Hay valores antiguos que hoy solo queden copiados en las presentaciones?

**Respuesta:** ESOS VALORES SON LOS QUE VAMOS A TOMAR COMO FUENTE DE LA VERDAD LOS QUE ESTAN EN LA PRESENTACION SON LOS QUE QUEDARON DE LOS INFORMES QUE FUI PRESENTANDO

### P26. Series y extensión del histórico

Para cada comparativo, ¿qué indicadores querés conservar y cuántas semanas o meses mostrar? Podés responder por página: 15, 16, 17, 25 y 31. ¿La selección cambia cada semana o siempre mostrás las mismas series?

**Respuesta:**   SIEMPR EMUESTRO LAS MISMAS SERIES

### P27. Base de comparación diaria y semanal

Para el semanal, ¿se compara contra la semana inmediatamente anterior aunque no haya actividad del producto, o contra el último operativo con actividad? Para el diario, ¿contra el día anterior, el mismo día de la semana anterior o el acumulado equivalente?

**Respuesta:** EL ULTIMO OPERATIVO

### P28. Histórico corregido

Si encontramos un error antiguo o cambia una regla del dashboard, ¿querés recalcular los comparativos con una misma regla o conservar las cifras tal como se presentaron? Propuesta: conservar los informes emitidos y distinguir un histórico recalculado cuando corresponda.

**Respuesta:** CONSERVAR LAS CIFRAS

## F. Calada — diapositivas 33–51

### P29. Vistas de calada y filtros

Indicá la pantalla, selección de cámaras/calles y filtros para: **Ricardone sólidos**, **Ricardone líquidos** y **San Lorenzo**. ¿Los gráficos horarios, barras por calle y tarjetas salen todos de esas mismas vistas?

**Respuesta:**   <http://localhost:5173/estadisticas/indicadores/calada>  SI REVISA BIEN LO QUE SE VE AHI NO ME PREGUNTES OBVIEDADES ESA INFORMACION ESTA EN EL SOFTWARE DASHBOARD

### P30. Gráficos de líneas

¿Qué representa cada línea y cada franja o sombreado de los gráficos de calada? ¿Usás alguna selección especial de intervalo, suavizado o rango del eje antes de capturar? Si es la vista predeterminada, alcanza con identificarla para que lo verifique.

**Respuesta:** REVISA BIEN LO QUE SE VE AHI NO ME PREGUNTES OBVIEDADES ESA INFORMACION ESTA EN EL SOFTWARE DASHBOARDREVISA BIEN LO QUE SE VE AHI NO ME PREGUNTES OBVIEDADES ESA INFORMACION ESTA EN EL SOFTWARE DASHBOARD

### P31. Tarjetas de actividad

Los totales, pico, hora del pico y promedio por hora: ¿los copiás de las tarjetas del dashboard o calculás alguno aparte? Las «148 horas», «49 horas» y «85 horas» del ejemplo, ¿de dónde las tomás? Si hay varios máximos iguales, ¿te interesa mostrar todos o el primero?

**Respuesta:**   DASHBOARD DEL DASHBOARD TODO SALE DE AHI DE ESAS ARJETAS

### P32. Calles, productos y lecturas repetidas

¿Excluís alguna calle, cámara o producto en estos resúmenes? Si el mismo camión pasa más de una vez por calada, ¿aplicás algún ajuste manual o mantenés el conteo del dashboard? ¿Querés conservar siempre las mismas calles en las barras aunque tengan cero actividad?

**Respuesta:**  REVISA BIEN LO QUE SE VE AHI NO ME PREGUNTES OBVIEDADES ESA INFORMACION ESTA EN EL SOFTWARE DASHBOARD

## G. Volcables y silos — diapositivas 52–72

### P33. Vistas y equipos

Indicá la pantalla y filtros para **Volcable 1/2**, **Volcable Silos** y **Volcables Puerto**. ¿Qué equipos incluye cada grupo? ¿Son los mismos para los gráficos de líneas, barras y tarjetas?

**Respuesta:** <http://localhost:5173/estadisticas/indicadores/descargas>  REVISA BIEN LO QUE SE VE AHI NO ME PREGUNTES OBVIEDADES ESA INFORMACION ESTA EN EL SOFTWARE DASHBOARD

### P34. Productos y operaciones incluidos

¿La actividad de volcables incluye todos los productos y movimientos que muestra el dashboard, o excluís alguno, por ejemplo transiles o movimientos internos? ¿La separación por producto/equipo sale del dashboard o la armás cruzando el Excel?

**Respuesta:** REVISA BIEN LO QUE SE VE AHI NO ME PREGUNTES OBVIEDADES ESA INFORMACION ESTA EN EL SOFTWARE DASHBOARD  

### P35. Promedios y distribución por equipo

¿De dónde copiás el promedio diario, los camiones por hora operativa y el reparto por volcable? ¿Realizás cálculos aparte, como el porcentaje concentrado en las volcables 5, 3 y 2 de la diapositiva 58? ¿Las líneas usan la misma configuración que las de calada o una distinta?

**Respuesta:**   REVISA BIEN LO QUE SE VE AHI NO ME PREGUNTES OBVIEDADES ESA INFORMACION ESTA EN EL SOFTWARE DASHBOARD

## H. Diferencias observadas en el ejemplo

### P36. Cómo se prepararon los conteos diferentes

¿Recordás si estos casos se deben a filtros diferentes, actualizaciones en distintos momentos, patentes únicas frente a viajes o ajustes manuales? Podés responder «verificar en dashboard» en todos los que no recuerdes.

- **Soja:** resumen de 2.557 frente a suma de páginas diarias de 2.490 (págs. 7–14).
- **Pellet:** operativo de 188 frente a 185 en la página de tiempos (págs. 20 y 22); los días suman 188.
- **Girasol:** muestra general de 523, grupos de cobertura LPR que suman 493 y 488 en R5+R6 (págs. 3, 28 y 30).
- **Calada Ricardone:** semanal de 2.908 frente a suma de tarjetas diarias de 2.925 (págs. 35–49).
- **Volcables puerto:** semanal de 2.688 frente a suma de tarjetas diarias de 2.694 (págs. 57–72).
- **Líquidos:** muestra general de 155 y actividad de calada líquida de 157 (págs. 3 y 50), que podrían medir poblaciones distintas.

**Respuesta:** REVISA BIEN LO QUE SE VE AHI NO ME PREGUNTES OBVIEDADES ESA INFORMACION ESTA EN EL SOFTWARE DASHBOARD

### P37. Valores de tiempos y picos

¿Los textos y tarjetas se actualizaron al mismo tiempo que los gráficos? En el ejemplo, el pico semanal de calada dice 50 y el jueves dice 58; la conclusión de pellet habla de 20 minutos de espera en San Lorenzo y el esquema semanal muestra 17 para Playa OSL. ¿Hay una explicación conocida o los revisamos desde los datos?

**Respuesta:**   REVISAMOS DESDE LOS DATOS

## I. Conclusiones, plantilla y validación

### P38. Redacción de conclusiones

¿Cómo elaborás hoy las conclusiones: las escribís vos, usás un asistente o seguís un texto anterior? ¿Qué debe comentar siempre el agente? Propuesta: volumen, cambios de tiempos, tramos con mayor permanencia, días destacados y cobertura; causas solamente cuando estén respaldadas por los datos disponibles.

**Respuesta:** ASISTENTE IA, REDACTALO VOS TOMANDO ESO DE EJEMPLO

### P39. Objetivos y alertas

¿Tenés metas o límites acordados para tiempos, actividad o calidad de lectura? Indicá valor y a qué circuito/equipo aplica. Si no existen, el agente puede describir variaciones sin inventar umbrales ni calificar resultados como buenos o malos.

**Respuesta:**

### P40. Requisitos de la plantilla

Mantendremos las 72 páginas iniciales y una estética similar simplificada. ¿Hay logos, nombres, mapas, títulos, orden de páginas o leyendas que deban quedar exactamente como están? ¿Hay algún contenido que el ejemplo no tenga pero que siempre incluís en otras semanas?

**Respuesta:**  LOGOS DEBE QUEDAR EXACTAMENTE IGUAL, ESTETICA GENERAL SIMILAR

### P41. Formatos y posibilidad de edición

Propuesta: generar **PPTX editable y PDF**, sin depender de Google Slides. ¿Te sirve? ¿Necesitás editar los datos de los gráficos dentro de PowerPoint, o alcanza con que títulos/textos sean editables y los gráficos se regeneren desde el sistema?

**Respuesta:**  PPTX EDITABLE ME SIRVE A PRIORI

### P42. Primera prueba y criterio de aceptación

¿Usamos el período 10–16/09/2026 para comparar la primera generación? ¿Qué pantalla o archivo considerás la referencia correcta si difiere de la presentación? ¿Quién revisará con nosotros el primer informe completo?

**Respuesta:**  SISI USEMOS ESO

## J. Funcionamiento automático

### P43. Lugar de ejecución

¿Hay una computadora que quede encendida y tenga acceso al dashboard y los Excel en los horarios de P04? ¿O necesitás que funcione aunque tu PC esté apagada? Con esa respuesta propondré dónde ejecutar el proceso.

**Respuesta:**  LO HACEMOS DESDE ESTA PC NO HACE FLATA QUE SEA TODO EL TIEMPO

### P44. Guardado y aviso

¿En qué carpeta o ubicación querés recibir los informes? ¿Querés solo que se guarden o también un aviso? Indicá el medio preferido y quién necesita acceso. Esta respuesta define el plan; todavía no activa envíos.

**Respuesta:**    PRIMERO EN UNA CARPETA ACA DESPUES VEMOS COMO AVANZAMOS

### P45. Entrega automática o revisión

¿El diario y el semanal deben quedar disponibles automáticamente al pasar los controles, o alguno necesita tu revisión antes de considerarse definitivo? Propuesta inicial: las primeras generaciones quedan para revisión; después acordamos qué controles permiten liberar cada informe.

**Respuesta:**   REVISION MIA HASTA QUE YO DIGA QUE ESTA LISTO

### P46. Qué hacer ante problemas

Si falta un Excel, el dashboard no actualiza o una cifra no concilia, ¿preferís recibir un borrador con las secciones afectadas marcadas o esperar el informe completo? Propuesta: guardar el diagnóstico, avisar el problema y no reutilizar cifras de otro día como si fueran actuales.

**Respuesta:**   LO QUE PROPUSISTE VOS

### P47. Versiones y cambios manuales posteriores

Propuesta: conservar archivos por fecha/período y número de revisión, con un acceso a «último informe». ¿Hacés cambios manuales después de generar la presentación que debamos proteger en la siguiente actualización? ¿Durante cuánto tiempo necesitás conservar los informes?

**Respuesta:**  SEMANAL

## Qué voy a investigar yo, sin pedirte trabajo técnico

- Vincular las pantallas que identifiques con sus datos y cálculos reales.
- Verificar cómo cuentan movimientos, patentes, recorridos y actividad por equipo.
- Revisar medias, muestras válidas, filtros, redondeo y tratamiento de datos faltantes.
- Resolver la relación entre semanas guardadas y el corte del informe, incluyendo medianoche y recorridos entre períodos.
- Verificar reglas de clasificación, versiones y compatibilidad de los históricos.
- Diseñar la carga centralizada, el registro de versiones y la prevención de entregas duplicadas.
- Construir la plantilla y comprobar la cobertura de las 72 páginas, incluidos gráficos que están pegados como imágenes.
- Probar generación diaria, semanal, datos tardíos y fuentes no disponibles.

## Resultado que armaremos con tus respuestas

1. Inventario de las 72 diapositivas con sus indicadores y fuentes.
2. Definición de filtros, períodos y significado de cada dato.
3. Plantilla completa para revisar juntos.
4. Plan de integración centralizada y recuperación del histórico.
5. Plan del agente diario/semanal, con controles, horarios y entregas.

Este cuestionario reemplaza las suposiciones anteriores sobre conectar Google Slides como fuente o reducir el número de diapositivas. Todavía no se modificó el dashboard ni se activó ninguna automatización.
