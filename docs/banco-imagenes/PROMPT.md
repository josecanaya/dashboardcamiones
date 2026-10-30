# Proyecto: banco de imágenes y modelo propio de reconocimiento de vehículos

## Objetivo

Armar un banco con **todas las capturas de cámara desde el 1 de junio de 2026** (Ricardone y San Lorenzo, cámaras frontales y traseras) y entrenar con él un modelo de redes neuronales propio que, mirando la foto, diga automáticamente:

1. **Qué es lo que pasó por la cámara:** camión, acoplado (vista trasera), tractor o maquinaria, auto o camioneta, moto, persona, o nada (lectura falsa).
2. **Si es un camión, cuál es:** reconocerlo por sus cualidades (forma de cabina, color, marca, calcos, caja, acoplado), no solo por la patente. Cada foto se convierte en un vector («huella» del camión) y el modelo busca la huella más parecida entre los camiones conocidos.

El modelo es una capa más del reconocedor: cuando la cámara lee mal la patente, la huella dice qué camión es, y esa patente vuelve a la capa 2 (carta de porte / Vehículos Permitidos) a confirmarse.

## 1. El banco de imágenes

- **Fuente:** las capturas del DSS desde el 1 de junio de 2026 (foto de escena + recorte de patente + atributos marca/color/tipo), de todas las cámaras de las dos plantas.
- **Una carpeta por etiqueta única.** Para camiones, la etiqueta es la patente del **chasis**; todas las fotos de ese camión van juntas: frente, trasera (acoplado), de día, de noche, en cada cámara.
- **Cámara frontal → chasis; cámara trasera → acoplado → se asigna al chasis** según la carta de porte (`plates[0]` = chasis, el resto = acoplado). Nunca mezclar los dos lados.
- **Clases que no son camión,** cada una con su carpeta: tractor/maquinaria (pala cargadora, minicargadora, autoelevador), auto/camioneta, moto, persona, colectivo, sin vehículo.
- **Cada foto con su ficha:** cámara, planta, nodo, hora, lado (frontal/trasera), patente leída, etiqueta final, de dónde salió la etiqueta y qué tan segura es.

### Volumen y espacio

- Del 1 de junio al 30 de octubre hay unas **4.500 capturas por día entre las dos plantas, cerca de 700.000**.
- **Cada captura del DSS trae dos fotos:** `Scene Image` (el vehículo entero, unos 500 KB) y `Plate Image` (el recorte de la patente, unos 8 KB). El nombre del archivo ya dice la patente leída, la hora y la cámara: `<patente>_Plate Image_<AAAAMMDDhhmmss>_<cámara>_0001.jpg`.
- **Las exportaciones a mano del DSS Client no sirven para el banco** (`C:\Users\Public\DSS Client\*.zip`, revisadas el 30/10):
  - Cada exportación corta en **1.000 capturas**, así que cada zip trae solo las últimas horas del último día del mes. Junio trae el 30/06 de 21:31 a 23:59; julio, el 31/07 de 19:47 a 23:59.
  - «AGOSTO FOTOS.zip» tiene **las mismas fotos que julio** (31/07): agosto no está.
  - «septiembre.zip» y «octubre.zip» están rotos o incompletos y no se pueden abrir.
- **El banco se baja por la API del DSS,** por cámara y por día, como ya hace `scripts/dss-capturas-camaras.mjs`, guardando las dos fotos de cada captura y su ficha. Así no hay límite de 1.000.
- **Espacio:** con la escena a 500 KB, las 700.000 capturas serían unos 350 GB, y la PC tiene 28 GB libres. Guardar la escena achicada (el vehículo a unos 640 px, 50 a 80 KB) y el recorte de patente original: unos 40 a 60 GB en total, en un disco externo o en AWS. Los originales quedan en el DSS.
- **Alcance (30/10): se elige por camión, no por semana.** Para la huella sirve tener al mismo camión en **muchas visitas distintas** (días, cámaras, luz, clima), no muchas fotos de la misma pasada. Conteo con los registros de cámaras del 1/6 al 30/10 (patentes válidas, visitas por viaje):

  | Camiones | Capturas |
  |---|---|
  | con 5 visitas o más: 2.882 | 185.100 |
  | con 10 o más: 819 | 118.002 |
  | con 20 o más: 347 | 85.216 |

  Hay 1.830 camiones con 5 visitas o más en 3 meses distintos o más. La cuenta incluye algunas lecturas malas y vehículos que no son camiones; el número real de camiones es algo menor.
- **Qué se baja:**
  1. **Huellas:** todos los camiones con 5 visitas o más, hasta 20 visitas cada uno, repartidas en todo el período. Son unas **133.000 capturas**. A los que vienen todos los días (IMH787 tiene 521 visitas) se les toman 20 visitas repartidas, no todas.
  2. **Prueba:** la última semana de octubre completa, unas 32.000 capturas. Se usa solo para medir.
  3. **Clases que no son camión** (tractor, moto, persona, auto, colectivo, nada): todas las del período que figuren en la base de no camiones, en alertas o en los veredictos de la IA.
- **Espacio:** unas 165.000 capturas, de **10 a 15 GB** con la escena achicada y el recorte de patente original. Entra en la PC.
- **Prueba de descarga:** bajar primero una semana para medir cuánto tarda el DSS por foto y cuánto ocupa, y después el resto de a una semana por noche.
- **La ficha de cada captura se guarda siempre:** hora, cámara, patente, atributos y etiqueta.

### De dónde salen las etiquetas (de más a menos confiable)

1. Decisiones de operaciones: confirmaciones y correcciones del log de identificación, y descartes con motivo.
2. Lectura válida que coincide con una carta de porte vigente o con Vehículos Permitidos.
3. Banco de corregidas y base de no camiones.
4. Veredictos de la IA por imagen. Solo como etiqueta débil, marcada aparte, nunca para evaluar.

Lo que no tenga etiqueta confiable queda **sin etiquetar**, para revisarlo con una pantalla de etiquetado rápido: foto grande, la clase y la patente propuestas, y un clic para confirmar o corregir. La revisa el responsable del proyecto, así que la pantalla tiene que mostrar primero las fotos que más le enseñan al modelo (clases con pocos ejemplos, camiones con pocas fotos, casos donde el modelo duda) y llevar la cuenta de cuántas faltan para la meta.

### Volumen objetivo

- **Clasificador de tipo:** unas 300 fotos verificadas por clase para arrancar (tractor, moto, persona, auto, colectivo, nada; de camiones sobran). La mayoría sale sola de las etiquetas automáticas; a mano, solo lo que falte.
- **Huella de camión:** camiones con al menos 5 fotos verificadas desde cámaras distintas (frente, trasera, día, noche). Apuntar a 1.000 camiones distintos o más.
- **Prueba:** un conjunto aparte de 500 fotos de las semanas más nuevas, revisado a mano, que nunca se usa para entrenar.
- El script del banco tiene que informar, antes de entrenar, cuántas fotos con etiqueta confiable hay por clase y cuántos camiones llegan a 5 fotos, para saber cuánto falta etiquetar.

**Personas:** solo se etiqueta la clase «persona» para que el modelo no las confunda con vehículos. No se identifica a nadie, y las caras no se usan.

## 2. El modelo

Dos tareas sobre la misma foto:

- **Clasificador de tipo:** camión / acoplado / tractor-maquinaria / auto-camioneta / moto / persona / colectivo / nada.
- **Huella de cada camión** (re-identificación): una red que convierte la foto en un vector, entrenada para que dos fotos del mismo camión queden cerca y las de camiones distintos queden lejos. Proponer el enfoque (red preentrenada ajustada con aprendizaje métrico o similar) y justificarlo con los datos que tenemos.

Requisitos:

- Corre **local** (por ahora en la PC, después en la VM de AWS). Las fotos no salen de nuestra infraestructura.
- Al buscar, compara solo contra los camiones **que están en planta** en ese momento (el lote), no contra todo el histórico.
- Trabaja con fotos de noche, a contraluz y con patentes ilegibles.

## 3. Cómo medirlo (antes de usarlo)

- **Separar por fecha:** entrenar con las semanas más viejas y evaluar con las más nuevas, nunca mezclando fotos del mismo día en entrenamiento y prueba.
- **Clasificador:** aciertos y errores por clase, en especial tractor, moto y persona contra camión.
- **Huella:** de cada foto de prueba, en qué porcentaje el camión correcto aparece primero entre los que estaban en planta, y en qué porcentaje aparece entre los 5 primeros.
- **Contra el reconocedor actual:** replay de una semana con las decisiones de operaciones como verdad. Medir cuántas lecturas que hoy terminan en alerta identifica el modelo, y cuántas asigna mal.
- Recién con esos números se decide si entra como capa y con qué umbral.

## Entregables

1. Script que arma el banco (descarga de fotos, carpetas por etiqueta, fichas).
2. Pantalla de etiquetado rápido para lo que quede sin etiqueta.
3. Script de entrenamiento del clasificador y de la huella.
4. Informe de medición con los números de la sección 3 y ejemplos con foto de aciertos y errores.
5. Propuesta de integración al reconocedor (en qué capa entra y con qué umbral), sin tocar el reconocedor hasta aprobarla.

## Datos para completar antes de arrancar

- Equipo para entrenar: la PC tiene una **NVIDIA GeForce GTX 1660 SUPER de 6 GB** (Ryzen 5 5600G, 16 GB de RAM). Alcanza para ajustar una red preentrenada mediana con fotos reducidas y lotes chicos; elegir modelos y tamaños que entren en 6 GB. Si un entrenamiento no entra o tarda demasiado, usar una máquina con GPU dentro de nuestra cuenta de AWS solo para entrenar y correr el modelo en la PC.
- Si el DSS guarda las capturas desde el 1 de junio y si se pueden bajar completas.
