# NVA · Revisión de recorridos desde imágenes

Esta revisión reemplaza los recorridos calculados sobre los pisos. NO usar las rutas del paquete anterior.

## Ver el resultado

Abrir `visor.html`. Seleccionar planta, circuito e imagen. `Comparar original` muestra la imagen de origen junto al modelo. La franja verde translúcida procede de la imagen seleccionada; la línea más intensa es el eje disponible para la combinación de circuito e imágenes de referencia. Cambiar la imagen compara otra franja; no cambia silenciosamente el circuito seleccionado ni sus ejes. El camión es una simulación en vista superior de un semirremolque. Se anima solo el tramo continuo más largo, sin saltar discontinuidades.

El visor es autónomo. Las 35 vistas de referencia se incluyen embebidas para abrir por doble clic, y como JPEG independientes en `referencias`. La aplicación no recibe datos reales de cámaras, ocupación o GPS.

## Qué se corrigió

Se procesaron las 35 imágenes: 22 de Ricardone y 13 de San Lorenzo. Las franjas rosa, azul y amarilla se extrajeron de las imágenes y se transformaron al sistema local de cada IFC. El registro usa 32 alineaciones por puntos característicos y 3 por correspondencias manuales del plano del terreno para las vistas con cámara diferente. Se incluyen matrices de transformación y nombres originales en `datos/trazados_imagenes.json`.

Las franjas conservan sus huecos con regla de relleno `evenodd`; no rellenar cada contorno por separado porque convertiría un circuito alrededor de edificios en un polígono sobre ellos. Las franjas son evidencia gráfica digitalizada, no una certificación topográfica. Los anchos y curvas están muestreados a 2,5 m. Para centros de franja se cierran pequeños cortes hasta tres píxeles, producidos por objetos/etiquetas/compresión de la imagen. La mayor distancia medida entre los vértices de ejes generados y la banda original fue 5,59 m.

Los ejes se calculan exclusivamente dentro de la red de franjas de las imágenes seleccionadas, nunca completando por los pisos del IFC. Para fases posteriores a operaciones de recepción o despacho se priorizan respectivamente las bandas azul o amarilla; esta interpretación cromática es una propuesta, pues la carpeta no trae una leyenda formal. Se preservan `trace_color_phase` y las imágenes de origen para revisar esa interpretación.

## Codificación y estado de las uniones

Los nombres históricos A/B/C/etc. NO se declararon equivalentes a R/SL. Las correspondencias se proponen por operación y destino y están registradas en `source_images_by_plant` y `source_correspondence_status`. Algunas combinaciones de matriz requieren más de una imagen. Validar estas asociaciones antes del uso operativo.

Se conservan 49 circuitos de ambas plantas y 32 nodos (21 Ricardone, 11 San Lorenzo). `matrix_sequence` conserva la matriz; `display_sequence` incorpora Playa 1 entre preingreso y calada de Ricardone. Playa 1 es la franja larga junto a Celda 16 indicada por el usuario y se vincula al piso `1RHKOXwoH8zwUhJC83xUEx`; el piso completo es una aproximación a su perímetro.

Ahora hay 533 instancias de unión por circuito, en lugar de una única ruta por par de nodos que ignoraba variantes. 347 cuentan con eje extraído de franjas. Las restantes quedan explícitamente pendientes: 108 por discontinuidades en la fuente, 47 por nodos sin posición y 13 porque el acceso no coincide con la imagen elegida. Hay además 18 instancias de enlaces lógicos entre plantas, sin traza externa inventada. No confundir estos recuentos por circuito con conexiones únicas.

Los nodos todavía sin posición son Silo Australiano de Ricardone e Ingreso y Cargadero de San Lorenzo. No se les asignan coordenadas supuestas. Los centros de geometrías asignados por el usuario se proyectan a accesos de franjas; `anchor_distance_m` documenta el desplazamiento de cada extremo. Si ese desplazamiento supera 65 m, la unión queda pendiente en vez de dibujar un enlace recto a través de instalaciones.

## IFC para frontend

`modelos/NVA_ricardone_trafico.ifc` y `modelos/NVA_san_lorenzo_trafico.ifc` conservan productos y GlobalIds originales y los grupos de nodos. Se eliminaron las anotaciones `edge_*` calculadas anteriormente sobre pisos.

Cada nodo es un `IfcGroup`, ObjectType `NVA_TRAFFIC_NODE`. Recorrer sus `IfcRelAssignsToGroup` para reunir todas las geometrías; una misma geometría puede pertenecer a varios nodos. `NVA_TrafficNode` identifica NodeId, planta, código de cámara/sector, tipo, fuente y estado. Las relaciones de grupo son la autoridad para pertenencia múltiple; no depender solo de propiedades auxiliares del producto.

Los ejes nuevos son `IfcAnnotation` con nombre `trace_*`. Las bandas de cada imagen se incluyen como anotaciones `image_*`, con varios contornos/polilíneas. `NVA_ImageTrace` conserva ImageId, SourceFilename o ImageIds, FromNode, ToNode, CircuitIds y estado, según el tipo de anotación. Habilitar curvas/anotaciones en el cargador IFC. No mostrar simultáneamente todas las anotaciones: filtrar por circuito y/o ImageId.

## Datos y coordenadas

`datos/trafico.json` incluye nodos, secuencias, imágenes y variantes por circuito. Una unión se selecciona por `from`, `to` y `circuits`, no solo por el par de nodos. `datos/modelos.json` incluye mallas locales y `datos/vista-simplificada.json` sus polígonos para el prototipo. Las envolventes simplificadas del visor no sirven para mediciones técnicas.

Unidades: metros. Cada planta tiene un origen propio en `model_origins`. Para transformar puntos locales del JSON al IFC: `world = local + model_origins[plant]`. Las anotaciones IFC ya están en coordenadas originales. No mezclar los orígenes ni interpretarlos como latitud/longitud. No usar longitudes de esta digitalización como distancias operativas certificadas.

## Seguimiento real

`frontend-adapter.js` resuelve pertenencia de geometrías y eventos por node_id. S0/S1/etc. no son claves globales; se repiten. El backend debe enviar vehicle_id, node_id, detected_at ISO 8601 y, opcionalmente, next_node_id. Mostrar última detección confirmada y tramo estimado por separado. La animación de demostración no es una regla de ubicación entre cámaras.

El selector de cámara permite probar video web compatible. RTSP requiere gateway y algunos formatos necesitan reproductor adicional. No hay credenciales incluidas.

Para modificar y regenerar: editar `visor.js`, plantilla o datos y ejecutar `python build_viewer.py` (requiere Pillow para embeber imágenes). Las imágenes originales de alta resolución no se modificaron; los JPEG del paquete son copias reducidas para consulta.

## Verificación

Los IFC se reabrieron y se comprobó que sus curvas pueden leerse con anotaciones habilitadas. No quedan anotaciones de rutas `edge_*`. Se verificó procedencia de ejes respecto de las bandas digitalizadas. En Chromium se probaron cambio de planta, selección de nodos, animación, comparación, 35 imágenes y 67 combinaciones circuito/planta sin errores JavaScript; también ancho móvil de 390 px sin desborde horizontal. Resultados en `datos/validacion.json`. Esto verifica estructura y funcionamiento del prototipo; las correspondencias históricas, sentidos y accesos pendientes no se declaran aprobados por Operaciones.
