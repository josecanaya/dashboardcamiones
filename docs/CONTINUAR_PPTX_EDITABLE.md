# Continuar la conversión del PPTX existente

## Pedido y estado real

Modificar la presentación existente, sin reconstruirla completa. Conservar las 72 diapositivas, los datos reportados y una estética similar. Convertir gráficos de imágenes en gráficos nativos o formas, textos y cifras editables. Las capturas de curvas de actividad de caladas y volcables deben quedar como espacios vacíos para que el usuario las complete. No activar todavía el agente autónomo, cronogramas ni actualizaciones de datos.

Archivo de trabajo, relativo a `C:/Users/Usuario/Desktop/Dashboard_camiones`:

`reportes/logistica/plantilla_v1/plantilla_comite_logistica_editada.pptx`

Las diapositivas 2, 3 y 34 ya tienen contenido convertido a formas y texto. El resto de las conversiones descritas abajo sigue pendiente. No presentar este documento como una conversión terminada.

Fuente adicional proporcionada por el usuario:

`C:/Users/Usuario/Downloads/Comite 29_7 Logistica - Gráfico de líneas 2.xlsx`

El usuario autorizó simplificar la estética y cambiar imágenes por elementos editables; prioriza conservar información y evitar trabajo repetido. No enviar otro cuestionario general.

## Recursos existentes: reutilizar

- `docs/CUESTIONARIO_AGENTE_LOGISTICA.md`: respuestas del usuario.
- `docs/PLAN_AGENTE_LOGISTICA.md`: contexto del proyecto de automatización.
- `reportes/logistica/plantilla_v1/mapa_diapositivas.json` y `MAPA_DIAPOSITIVAS.md`: inventario.
- `scripts/edit-logistics-native-slides.py`: ejemplo de edición puntual del ZIP/XML conservando otras partes. Sus rutas apuntan a una versión anterior: no ejecutarlo sin adaptar.
- `scratchpad/reporte_18_9_analisis/`: imágenes originales extraídas y `slides.json`.
- `scratchpad/plantilla_logistica_v1/renders/`: vistas de las 72 diapositivas anteriores a la conversión de 2, 3 y 34.
- `scratchpad/plantilla_logistica_native/`: vistas posteriores de 2, 3 y 34.
- `scratchpad/plantilla_logistica_v1/check-native.mjs`: ejemplo de renderizado y validación. Adaptar rutas; no sobrescribir accidentalmente artefactos anteriores.

## Ejecución acotada

1. Leer las instrucciones de presentación aplicables y crear una copia privada de respaldo del PPTX actual.
2. Trabajar sobre ese mismo PPTX mediante cambios puntuales. Mantener dimensiones 9144000 × 5448300 EMU, orden, textos, logos y fotografías.
3. Sustituir las imágenes de gráficos enumeradas abajo. Preferir barras y tablas con cifras hechas con formas nativas cuando resulte más simple; para series históricas, gráficos nativos con datos incorporados. No es obligatorio reproducir todos los detalles visuales.
4. Sustituir las curvas de actividad por un rectángulo vacío con borde tenue en la misma ubicación, identificado como espacio para captura. Mantener los indicadores y textos que las acompañan.
5. Guardar un manifiesto con diapositiva, objeto sustituido, valores y fuente. No corregir contradicciones del informe por iniciativa propia ni estimar puntos de líneas sin etiquetas.
6. Comprobar 72 diapositivas, conservación de textos fuera de los objetos sustituidos, valores y apertura del paquete. Renderizar únicamente las diapositivas cambiadas, revisar diseño y corregir recortes. Ejecutar la finalización exigida por la skill.
7. Actualizar el archivo existente y entregar su enlace. Si Windows lo tiene bloqueado, guardar una copia con sufijo `_editable` e informar el bloqueo. Informar cualquier gráfico que siga pendiente por falta de valores exactos.

## Imágenes que deben convertirse

Formato: diapositiva → nombres de imágenes dentro de `ppt/media/`.

| Diapositiva | Imágenes |
|---|---|
| 5 | image1.png, image9.png |
| 15 | image29.png |
| 16 | image23.png, image52.png |
| 17 | image33.png, image55.png |
| 20 | image84.png |
| 25 | image39.png |
| 28 | image32.png, image54.png |
| 31 | image36.png, image90.png |
| 35 | image35.png |
| 36, 38, 40, 42, 44, 46, 48 | image38.png, image44.png, image48.png, image71.png, image46.png, image45.png, image50.png, respectivamente |
| 50 | image64.png |
| 51 | image60.png |
| 53 | image61.png, image59.png |
| 55 | image68.png |
| 57 | image76.png |
| 58 | image69.png |
| 59, 61, 63, 65, 67, 69, 71 | image85.png, image79.png, image77.png, image83.png, image72.png, image80.png, image86.png, respectivamente |

Curvas de actividad a dejar vacías: diapositivas **37, 39, 41, 43, 45, 47, 49, 50, 51, 54, 56, 60, 62, 64, 66, 68, 70 y 72**. En 50 y 51 conservar y convertir las barras indicadas arriba. En 49 eliminar también el fragmento image53.png asociado a la captura. Se aplica el mismo tratamiento a las curvas semanales del mismo tipo; el usuario completará las capturas.

Conservar mapas, fotografías y separadores de las diapositivas 1, 4, 6, 19, 21, 27, 29, 33 y 52, y los logos de todas las páginas. No confundir imágenes decorativas con gráficos cuantitativos.

## Datos ya extraídos del Excel

Hoja `Line`, datos efectivos A1:H15. Columnas B:E: Tiempo Medio, Playa 1, Playa OSL, Descarga. Columnas F:H: Girasol, Playa 1, Descarga. Usar para las series históricas de 17 y 31, comprobando correspondencia de títulos.

| Etiqueta del período | Tiempo Medio | Playa 1 | Playa OSL | Descarga | Girasol | Playa 1 girasol | Descarga girasol |
|---|---:|---:|---:|---:|---:|---:|---:|
| 10/6 | 376 | 121 | 135 | 79 | 326 | 120 | 184 |
| 17/6 | 338 | 94 | 104 | 92 | 315 | 107 | 180 |
| 24/6 | 316 | 113 | 86 | 64 | 287 | 105 | 159 |
| 8/7 | 383 | 145 | 105 | 70 | 317 | 122 | 170 |
| 15/7 | 304 | 114 | 65 | 60 | 306 | 117 | 166 |
| 24/7 | 445 | 171 | 140 | 59 | 351 | 140 | 188 |
| 30/7 | 389 | 181 | 85 | 58 | 361 | 137 | 208 |
| 7/8 | 421 | 120 | 145 | 68 | 347 | 138 | 186 |
| 13/8 | 346 | 101 | 113 | 63 | 241 | 80 | 110 |
| 21/8 | 368 | 130 | 127 | 71 | 289 | 99 | 146 |
| 28/8 | 296 | 112 | 89 | 64 | 353 | 163 | 152 |
| 04/09 | 379 | 140 | 137 | 62 | 430 | 190 | 215 |
| 11/09 | 276 | 97 | 87 | 63 | 319 | 116 | 155 |
| 18/09 | 334 | 126 | 119 | 61 | 382 | 133 | 208 |

Atención: algunas fechas del Excel se importaron como fechas con mes/día invertidos. Los números anteriores están extraídos del archivo; las etiquetas se normalizaron por secuencia y deben cotejarse con las imágenes históricas antes de publicarse. No transformar fechas seriales automáticamente sin este cotejo.

## Valores ya leídos directamente de imágenes

Orden diario en estas listas: jueves, viernes, sábado, domingo, lunes, martes y miércoles.

- D5 image1: 8 lecturas 33,0%; 7 lecturas 28,2%; 6 lecturas 18,1%; 5 lecturas 12,0%; ≤4 lecturas 8,6%. Conservar porcentajes reportados; suman 99,9% por redondeo.
- D5 image9: R7 Terminal de embarque 2557.
- D28 image32: 7 lecturas 60,0%; 6 lecturas 20,0%; 5 lecturas 9,1%; ≤4 lecturas 10,9%.
- D28 image54: R5 Volcable 1 = 361; R6 Volcable 2 = 92; R4 Silos Kepler = 40.
- D35 image35: Calle 1 a 6 = [831, 837, 626, 625, 3, 38].
- D50 image64: [1, 4, 2, 0, 91, 27, 30].
- D51 image60: [55, 47, 7, 2, 40, 51, 40].
- D53 image59: Volcable 1 [55, 70, 70, 10, 36, 63, 74]; Volcable 2 [21, 16, 17, 6, 15, 12, 9].
- D53 image61: Volcable 1 = 361; Volcable 2 = 92. Difieren de la suma diaria: mantener los valores de cada gráfico, registrar la diferencia.
- D55 image68: [0, 30, 10, 0, 0, 0, 0].
- D57 image76: [523, 488, 444, 54, 291, 479, 409]. Algunas tarjetas difieren: conservar la serie del gráfico.
- D58 image69: Volcable 1 a 5 = [502, 627, 641, 226, 692].

Para el resto, leer las etiquetas en las imágenes extraídas, sin volver a analizar todo el informe. En particular, **image52.png de la diapositiva 16 requiere verificar si existen valores exactos disponibles**: no estimar alturas ni sumar otros indicadores suponiendo que equivalen a la serie. Si no hay datos precisos, conservar esa imagen y dejar registrada esa excepción puntual para el usuario.

## Cómo reducir consumo

Una sola tarea de edición, sin subagentes ni investigación web. Reutilizar inventarios y scripts. No leer todo el repositorio ni consultar el dashboard/ETL. No regenerar las 72 diapositivas. Validar las páginas cambiadas y el paquete final; evitar renderizados completos repetidos. La elección del modelo económico se hace en el selector del usuario; este documento no afirma precios ni modifica la configuración.

## Prompt para continuar

> Ejecutá `docs/CONTINUAR_PPTX_EDITABLE.md`. Editá el PPTX existente conservando las 72 diapositivas. Convertí los gráficos enumerados a objetos editables y dejá vacíos los espacios de curvas de actividad. Reutilizá el análisis y el Excel indicado, sin inventar cifras ni reconstruir la presentación. Validá y entregá el archivo modificado, informando únicamente las excepciones pendientes.
