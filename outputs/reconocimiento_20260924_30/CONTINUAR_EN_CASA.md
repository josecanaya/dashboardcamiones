# Continuidad — reconocimiento multiseñal de camiones

Fecha de preparación: 2 de octubre de 2026. Período analizado: **24 al 30 de septiembre de 2026**, hora argentina. El usuario corrigió el mes: no es octubre.

## Pedido y lógica correcta

Reconstruir las capturas intermedias donde la patente se lee mal o no se reconoce, **entre dos lecturas confiables de la misma patente**. Usar cualidades, tiempo, cámaras, grafo del recorrido y contexto operativo. Completar retroactivamente la identidad sólo cuando la evidencia lo permita y mostrar los casos pendientes en todos los puntos.

Ejemplo: patente reconocida en punto 1 → captura ilegible en punto 2 → otra captura en punto 3 → misma patente reconocida en punto 4. El problema es encontrar una cadena compatible que conecte ambos extremos; no buscar libremente un camión parecido en toda la planta.

El usuario pidió expresamente cruzar muchos datos. **No volver al método de exigir igualdad exacta de color/marca/categoría**, ni presentar el 37% de la primera prueba como evaluación de esta hipótesis.

## Estado real del trabajo

Se construyó un **prototipo offline de análisis**, separado del ETL de producción. No se modificó el Excel original ni se aplicaron correcciones automáticamente al dashboard. No se alcanzó ni se demostró el 100% global de reconocimiento.

Resultado vigente: cruce multiseñal, contexto de contrato y comprobación de la ruta completa. Las pruebas anteriores de `analizar.py`, `probar_recorrido.py` y `reconstruir_entre_anclas.py` quedan como antecedentes, no como conclusión vigente.

## Datos usados

- Fuente original: `VehicleCaptureRecord202610021644394118890.xlsx`, hoja `Vehicle Search`, filas 2–44968.
- Copia durable incluida: `inputs/VehicleCaptureRecord202610021644394118890.xlsx`.
- **44.967 capturas de 58 cámaras**, entre 24/9 00:00:10 y 30/9 23:59:49.
- Patente, confianza OCR, cámara, timestamp, organización/planta, color, marca, categoría, velocidad, carril y lugar de emisión.
- No hay modelo de vehículo. Las columnas de imágenes están vacías.
- `Direction` es siempre `Unknown` y carril siempre `1`: no discriminan.
- Falta marca en 25.363 capturas; categoría en 9.163; color en 696.
- No hay patentes vacías en este archivo. Hay lecturas parciales, extrañas o fuera de los formatos usados para seleccionar anclas; **formato no habitual no demuestra patente inválida**.

### Fuentes de contexto ETL

API local: `http://127.0.0.1:8787`. Corridas cacheadas consultadas, ambas `stale:false`:

- `2026-09-21_2026-09-27`
- `2026-09-28_2026-10-04`
- `rulesVersion: etl_transform_v17`

Tablas: `excel_operations_with_truckflow`, `final_circuits`, `circuit_timing_summary`, `circuit_timing_journeys`; también se guardaron `segment_timing_legs` para contexto del grafo.

`contexto_enriquecido.json` contiene operaciones por patente, producto, plataforma, contrato, CTG, ingreso/calado/salida, balanzas SL, circuito esperado, calidad del vínculo y fuentes. El contexto por patente se utiliza **sólo para contrastar propuestas reales**, excluyéndolo de entrenamiento y prueba para no revelar la identidad ocultada.

El cruce contractual usa horarios externos y tolerancia explícita de **30 minutos**. Puede haber varias operaciones compatibles: se conserva la ambigüedad. El circuito esperado se toma de resolución `EXCEL_PLATFORM_PRODUCT`; una coincidencia contractual no confirma por sí sola identidad de cámara.

## Implementación vigente

### `multisenal.py`

1. Normaliza lecturas y conserva `excel_row`, fila original del Excel.
2. Selecciona anclas con confianza OCR ≥80 y uno de tres formatos habituales. Es un filtro del ensayo, no garantía de lectura verdadera.
3. Separa vistas delanteras/traseras; no asume que patente de remolque y tractor sean la misma.
4. Aprende un grafo dirigido de transiciones, tiempos y consistencia de atributos entre cámaras del **24–25/9**. Resultado actual: **92 transiciones** con al menos tres ejemplos.
5. Usa el catálogo para comprobar secuencias, distinguiendo planta y sector. La calificación de sitio en secuencias se infiere con prefijos SL/R y cambios S3→S0 / S7→S0: revisar contra el modelo oficial antes de producción.
6. Busca todas las capturas del punto intermedio dentro de las dos anclas, sin filtro duro de igualdad de atributos ni de patente intermedia.
7. Produce **46 señales derivadas**, no 46 campos independientes:
   - Coincidencia y disponibilidad de color, marca y categoría con ambos extremos.
   - Consistencia histórica de esos atributos entre cámaras.
   - Tiempo desde/hasta anclas, duración y posición dentro del intervalo.
   - Alcanzabilidad, tiempos esperados, factibilidad y frecuencia de transición del grafo.
   - Velocidad, comparación de carril/lugar de emisión, planta y cantidad de rutas posibles.
   - Confianza OCR, distancia de edición, longitud, prefijo, sufijo, caracteres confundibles y lectura parcial.
8. Entrena rankings logísticos regularizados con NumPy. No requiere scikit-learn. Los puntajes sirven para ordenar; **no son certeza calibrada de identidad**.
9. Compara cinco combinaciones de señales y guarda la evaluación completa.
10. Genera propuestas reales y bloquea contradicciones OCR fuertes y capturas reclamadas por diferentes patentes ancla.

El algoritmo real sigue siendo una propuesta por punto entre anclas; no resuelve una optimización global de todas las rutas. La revisión posterior comprueba que las propuestas seleccionadas de un intervalo formen una secuencia completa compatible.

### `enriquecer_multisenal.py`

Agrega operaciones, horarios, producto, plataforma, contrato, CTG y circuito esperado; comprueba la secuencia simultánea de los puntos propuestos. Usa `candidatos_exploratorios.csv` para recuperar la cámara de cada fila ancla: este archivo viene incluido y es una dependencia real del script.

### `finalizar_entrega.py`

Exporta las propuestas coherentes, verifica totales y recalcula el respaldo del circuito Excel contra **la cadena completa**, no sólo el segmento. Actualiza el detalle de las 58 cámaras.

## Validación y resultados vigentes

- Entrenamiento: 24–25/9.
- Selección de filtros/calibración: 26/9.
- Evaluación separada: 27–30/9.
- 1.277 consultas de entrenamiento y 36.201 comparaciones etiquetadas, incluyendo simulaciones.
- **2.688 consultas de evaluación**, de las cuales **2.028 tienen candidatos** y 660 no.
- Una captura puede participar en más de una consulta: no son camiones únicos ni ensayos independientes.
- Referencia de identidad: patente OCR fuerte, **no imagen auditada**.

| Combinación / escenario | Coincide OCR / consultas con candidatos | Precisión top-1 | Coincide OCR / propuestas filtradas |
|---|---:|---:|---:|
| Color, marca y categoría | 686 / 2.028 | 33,8% | Sin filtro que cumpla el criterio en calibración |
| Atributos + grafo + tiempos, sin patente | 992 / 2.028 | 48,9% | 141 / 146 |
| Multiseñal con patente totalmente oculta | 1.028 / 2.028 | 50,7% | 131 / 133 |
| Multiseñal con 1–2 caracteres alterados | 1.989 / 2.028 | 98,1% | 1.771 / 1.789 |
| Multiseñal conservando primera mitad de patente | 2.018 / 2.028 | 99,5% | 1.809 / 1.809 |

Estas son **simulaciones**: se alteran las lecturas de todas las capturas candidatas, incluidas las competidoras, para evitar usar las patentes originales como features. Confianza cero para lectura ausente; para lectura dañada/parcial, confianza baja tomada de la distribución de cada cámara. Esa distribución usa contexto sin etiquetas de toda la semana: no demuestra generalización a semanas futuras. Los restantes atributos de las capturas se conservan.

Los filtros se eligieron en el día 26 entre umbrales de puntaje/margen, exigiendo al menos 20 propuestas y ≥99% de coincidencia OCR en esa calibración. Se reporta su resultado separado posterior, que puede ser menor. El 1.809/1.809 parcial **no significa 100% global**.

### Propuestas sobre capturas reales

- **2.304 capturas** con alguna propuesta.
- **928 capturas** con propuestas de distintas identidades ancla: ambiguas.
- **237 capturas** con contradicción frente a OCR fuerte.
- **105 capturas candidatas** sin esos conflictos y con cadena completa compatible.
- **43 de las 105** también coinciden con circuito Excel contra cadena completa.
- 1.866 capturas propuestas tienen alguna operación compatible en horario, sin afirmar identidad.

Estos controles se solapan: no sumarlos. Las 105 son candidatas para revisión, no identidades confirmadas.

Ejemplos del archivo final: `MV332 → EMV332`, `S056 → GES056`, `CNG50 → CNG506`. Conservar originales y evidencia de anclas.

## Archivos importantes

- `105_propuestas_reconstruidas.csv`: entrega original de las 105 candidatas, con cruces y respaldo de cadena completa.
- `propuestas_reconstruidas.csv`: misma clase de entrega regenerable por `finalizar_entrega.py`.
- `cruces_multisenal_enriquecidos.csv`: todas las propuestas con contexto, evidencias y motivos de bloqueo.
- `comparacion_multisenal.csv`: consultas de evaluación de los cinco métodos.
- `multisenal_todos_los_puntos.csv`: detalle de las 58 cámaras.
- `multisenal_resultado_enriquecido.json`: resumen vigente, cifras, métodos y limitaciones.
- `multisenal_modelos.json`: señales y coeficientes de los rankings.
- `mapping.json`, `circuit_catalog.json`, `contexto_enriquecido.json`: contexto necesario para reproducir offline.
- `candidatos_exploratorios.csv`: dependencia de enriquecimiento; contiene las filas originales y cámaras de las anclas.
- `reconocimiento-camiones-septiembre.canvas.tsx`: copia de la vista revisable. Requiere entorno Canvas compatible; los CSV/JSON funcionan sin él.

## Cómo retomarlo en casa

**Llevar la carpeta completa o descargarla del repo**, no sólo este MD. El documento explica el trabajo pero no contiene los datos ni los scripts. La carpeta contiene el Excel, los contextos cacheados y las salidas; el prototipo puede reproducirse sin levantar el ETL.

Repo: `https://github.com/josecanaya/dashboardcamiones`. Rama utilizada: **`automatizacion`**. Carpeta versionada: `outputs/reconocimiento_20260924_30/`.

Si todavía no tenés el repo en casa:

```powershell
git clone --branch automatizacion https://github.com/josecanaya/dashboardcamiones.git
cd dashboardcamiones/outputs/reconocimiento_20260924_30
```

Si ya lo tenés, actualizar la rama `automatizacion` y abrir esa carpeta.

1. Descargar o copiar la carpeta completa, incluyendo `inputs/`.
2. Abrir PowerShell en esa carpeta. Se necesita Python 3.10+.
3. Crear un entorno e instalar dependencias si no están disponibles:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install pandas numpy openpyxl rapidfuzz
```

4. Reproducir el cruce, el enriquecimiento y la entrega:

```powershell
.\.venv\Scripts\python.exe multisenal.py inputs/VehicleCaptureRecord202610021644394118890.xlsx
.\.venv\Scripts\python.exe enriquecer_multisenal.py
.\.venv\Scripts\python.exe finalizar_entrega.py
```

Esto regenera salidas en la misma carpeta y puede sobrescribir CSV/JSON de resultados; trabajar sobre una copia si se quiere conservar una ejecución anterior. Los scripts antiguos `analizar.py` y `probar_recorrido.py` tienen rutas absolutas de esta PC: no son necesarios para la reproducción vigente.

La vista Canvas incluida es una instantánea; ejecutar los scripts no la refresca automáticamente. Los resultados reproducidos quedan en CSV/JSON.

### Si se retoma dentro del proyecto Dashboard_camiones

Respetar AGENTS.md. Ante una ventana, resolver primero las semanas calendario que la cubren. Si están vigentes, no ejecutar ETL. No crear ventana solapada ad hoc 24–30.

```powershell
node server/truckflow-local-server.mjs
```

Endpoints de lectura verificados:

- `/api/etl/resolve-window?from=2026-09-21&to=2026-09-27`
- `/api/etl/resolve-window?from=2026-09-28&to=2026-10-04`
- `/api/etl/catalog/circuits`
- `/api/etl/runs/{runId}/tables/{table}?limit=1000&offset=0`

Hay que paginar tablas completas y filtrar fechas en hora argentina. Para conteos de movimientos/productos/plataformas usar `excel_operations_with_truckflow`; clasificación ejecutiva `final_circuits.executive_bucket`; tiempos `circuit_timing_summary`. No contar con `merged_truckflow_movimientos` ni `movimientos_without_truckflow_match`.

## Próximos pasos prioritarios

1. Auditar las 105 propuestas con capturas originales cuando se consigan imágenes; empezar por las 43 con respaldo del circuito Excel.
2. Resolver empates considerando conjuntamente todos los camiones del intervalo, no sólo cada punto. Impedir que una captura se asigne a dos identidades y exigir continuidad de ruta entre cada pareja de puntos.
3. Revisar el mapa de sentido por cámara y normalización de sitios/sectores contra el grafo oficial, especialmente cámaras de balanza y traseras.
4. Calibrar una probabilidad de identidad sobre casos auditados. Los puntajes actuales y las frecuencias de transición no alcanzan para afirmarla.
5. Evaluar errores reales de OCR, parciales en otras posiciones y fallos simultáneos de atributos, no sólo sustituciones o prefijos sintéticos.
6. Deduplicar evaluación por captura/journey/camión y validar en otra semana; extender a huecos nocturnos y mayores de seis horas.
7. Integrar al ETL sólo después de revisión, conservando `plate_original`, `plate_deduced`, estado, motivos, anclas y versión de reglas. Reprocesar evidencia sin convertir inferencia en observación real.

## Prompt para continuar en otro chat

> Continuá el análisis de reconocimiento multiseñal de camiones del 24 al 30 de septiembre de 2026. Leé primero CONTINUAR_EN_CASA.md, multisenal_resultado_enriquecido.json y los scripts multisenal.py, enriquecer_multisenal.py y finalizar_entrega.py de esta carpeta. El usuario quiere reconstruir hacia atrás capturas con patente mala entre dos lecturas confiables de la misma patente, usando el grafo, muchos atributos y contexto operativo. Ya hay 105 capturas candidatas con ruta completa compatible, 43 con respaldo del circuito Excel. No reinicies con igualdad rígida de color/marca/categoría ni uses el 37% del primer ensayo. Priorizá resolver globalmente las asignaciones ambiguas y auditar las candidatas, manteniendo originales y evidencia. No afirmes 100% global ni probabilidades de identidad a partir de puntajes sin calibrar. Si usás el proyecto original, respetá las semanas cacheadas y las tablas canónicas de AGENTS.md.
