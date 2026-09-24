# Informe de logística: Excel automático al procesar un período

Cuando el dashboard termina de cargar un período, se genera solo el Excel que alimenta el
PPTX del comité. No hay paso manual de descarga ni botón obligatorio.

## Flujo

```
Seleccionar período  →  procesar / componer corridas  →  transformResult en el workbench
                                                              │
                                    useLogisticsReportExport (dispara solo)
                                                              │
                                    buildLogisticsReportPackage  ← MISMOS módulos del dashboard
                                                              │
                                    POST /api/reportes/logistica
                                                              │
                     reportes/logistica/<from>_<to>/revision-NNN/{Datos.xlsx, paquete.json, control.json}
                                                              │
                                    actualizar.py  →  PPTX de 72 diapositivas
```

- **Disparo**: `src/features/real-truckflow/logisticsReport/useLogisticsReportExport.ts`.
  Se ejecuta al quedar cargado un período (procesado o compuesto) y se deduplica por firma
  `período|rulesVersion|tamaño de datos`, así que reabrir la pestaña no crea revisiones.
- **Panel**: `LogisticsReportPanel`, montado en la pestaña *Análisis local*. Muestra la ruta
  del Excel, la cobertura y los pendientes.
- **Fallo aislado**: si la exportación falla, el panel lo informa y ofrece reintentar; el
  procesamiento del período **no** se invalida ni se borra.

## Dónde queda el archivo

```
reportes/logistica/2026-09-10_2026-09-16/
  revision-001/
    Datos.xlsx      ← entrada de actualizar.py
    paquete.json    ← datos calculados, con procedencia
    control.json    ← período, corridas, rulesVersion, cobertura, pendientes
  revision-002/     ← cada corrida agrega una revisión; no se pisa ninguna
  ULTIMA.txt
```

La plantilla (`reportes/logistica/prueba_manual/Datos_MANUAL.xlsx` y `vinculos.json`) se lee,
nunca se modifica.

Para producir el PPTX:

```bash
python reportes/logistica/prueba_manual/actualizar.py --excel "reportes/logistica/2026-09-10_2026-09-16/revision-001/Datos.xlsx"
```

## Período exacto, no la semana de la corrida

Las corridas se guardan como semanas **lunes→domingo**; el informe es **jueves→miércoles**.
El paquete usa siempre el período seleccionado y descarta lo que sobra.

Esto no era automático: hay dos fugas reales que el exportador corrige.

1. **`segment_timing_legs` no tiene columna de fecha.** `etlComposeRuns.filterRowsByDay`
   devuelve la tabla **entera** cuando no encuentra columna de día, así que un rango compuesto
   arrastra los legs de toda la semana. Medido sobre las dos semanas que cubren el 10–16/09,
   los legs abarcan del 06/09 al 21/09. El exportador **no usa los legs para el corte por
   día**: fecha cada recorrido con `circuit_timing_journeys.start_time`, que sí está fechado
   (99,97 % y 96,5 % de join en esas dos semanas).
2. **El día de borde llega por dos corridas.** Cada corrida incluye el día anterior (arrastre
   nocturno), así que al componer dos semanas el día del borde viene duplicado. Las secciones
   de actividad deduplican por `journey_id|cámara|timestamp`.

### Semana en curso vs. período atípico

La rutina real es procesar la semana por partes (P07: «el viernes hago solo jueves, el martes
hago del jueves al lunes») y **completar el informe semanal día a día** (P02). Por eso hay
tres casos, no dos:

| Caso | Condición | Qué pasa |
|---|---|---|
| Semana completa | jueves→miércoles, 7 días | todo se ubica |
| **Semana en curso** | arranca jueves, todavía no llega al miércoles | los días cargados se ubican en su lugar; solo los gráficos que necesitan el día faltante quedan pendientes |
| Atípico | no arranca jueves (p. ej. la ventana lunes→domingo de la corrida) | sin mapa de días: los gráficos rotulados por día quedan pendientes |

Medido sobre el período real 17–22/09 (jueves a martes, falta el miércoles): tratarlo como
semana en curso lleva la cobertura de **3 a 16 gráficos completados**. Los 15 pendientes son
los que necesitan el miércoles, más los adaptadores que faltan. Ningún día ausente se rellena
con cero.

## Día operativo a las 22:00 — verificado, y hay una diferencia real

Se pidió comprobar la asignación del día operativo a las 22:00. El resultado:

| Bloque | Regla vigente en el dashboard | Dónde |
|---|---|---|
| KPI tiempos, cuartos Q1–Q4 | **día operativo**: un ingreso ≥ 22:00 pertenece al día siguiente | `etlSegmentScatterByDay.buildQuarterCircuitSummary`, `operationalDayOfIso` |
| Calada y descargas | **día calendario** Argentina | `CaladaCamerasPanel.localDayOf` |

**No se unificó**, y es deliberado. El informe debe coincidir con lo que el usuario ve y
cotejará en pantalla; cambiar calada a las 22:00 haría que el Excel difiera del dashboard.
La diferencia queda declarada en cada informe, en `control.json → politicaDia`, con la
advertencia de no comparar rótulos de día entre bloques como si midieran el mismo intervalo.
Si se decide unificar, el punto único de cambio es `ActivitySourceSpec.dayRule`.

## La contradicción de tablas canónicas: qué se investigó y qué se resolvió

`AGENTS.md` (regla 6) y `CLAUDE.md` mandan usar `docs/RUNS_TABLAS_CANONICAS.md`, pero ese
documento **se declara a sí mismo superseded** por `docs/NIVELES_ABCD.md` (modelo v14) desde
su primera línea. Lo que se encontró en el código efectivo:

- El **front no lee los niveles A–E**. Hidrata `transformResult` desde las tablas v13 del run
  (`loadTransformOutputFromRun`) y calcula en el cliente. Los niveles los escribe
  `persistLevels()` *después* de persistir las tablas, y los consume la capa de agentes/MCP.
- **`E_kpi_circuito` no sirve para este informe**: es un agregado por corrida entera, sin
  fecha. Un informe jueves→miércoles armado con dos semanas lunes→domingo no se puede recortar
  desde ahí. Por eso el exportador no usa E.

**Resolución aplicada:** el informe debe reproducir el dashboard, así que usa exactamente las
tablas que usa el front, y lo declara en `control.json → fuentes.tablesUsed`:

| Para | Tabla | Coherente con |
|---|---|---|
| Operaciones, producto, plataforma, cuartos, puerta a puerta | `excel_operations_with_truckflow` | la regla canónica v13 (es la tabla obligatoria para contar movimientos) |
| Patas por planta y fecha del recorrido | `circuit_timing_journeys` | insumo de E; se usa por operación porque E no tiene fecha |
| Actividad de calada y volcables | `calada_*_events`, `*_volcable_events`, `ricardone_silo_events` | las mismas que dibujan los paneles |

No se usa `merged_truckflow_movimientos` ni `movimientos_without_truckflow_match` para ningún
conteo, que es la prohibición concreta de ambos documentos. **No se eligió una tabla
alternativa en silencio**: se eligió la fuente del front, y queda registrada en cada informe.

Pendiente de decisión del usuario: actualizar `AGENTS.md`/`CLAUDE.md` para que apunten a
`NIVELES_ABCD.md` y aclaren que el front y los agentes leen capas distintas. No se tocaron
esos archivos en este trabajo.

## Cómo se evita que una cifra vieja pase por actual

`actualizar.py` conserva el contenido de la plantilla cuando una celda queda vacía. Eso es
correcto para títulos e históricos, pero peligroso para un indicador del período. Cada gráfico
tiene política explícita en `server/logisticsReport/reportWorkbook.mjs`:

| Política | Qué hace |
|---|---|
| `current` | escribe los valores; si falta **uno solo**, borra todas las filas del gráfico y lo declara pendiente |
| `historical` | no toca la plantilla (serie ya presentada) |
| `pending` | borra las filas y lo declara pendiente |

Borrar es lo que impide el arrastre: la celda vacía hace que `actualizar.py` conserve el
gráfico base **y lo informe como incompleto**, y `control.json` lo lista. Nunca se rellena con
cero para completar.

Para los textos, un indicador conectado que no se pueda calcular se escribe como `s/d`, no se
deja vacío: vacío conservaría la cifra del informe de referencia.

**Cero válido vs. faltante**: si la sección tiene datos del período, una calle que no aparece
operó cero y el gráfico se publica. Solo cuando falta la sección entera el valor es
desconocido. Sin esa distinción, un domingo sin actividad en la calle 5 invalidaba el gráfico
del día.

## Cobertura actual (período de prueba 10–16/09/2026)

Sobre las corridas `2026-09-07_2026-09-13` + `2026-09-14_2026-09-20`, `etl_transform_v16`:

| Bloque | Estado |
|---|---|
| Gráficos completados | **29 / 35** |
| Series históricas conservadas | 4 (D17_G1, D17_G2, D31_G1, D31_G2) |
| Gráficos pendientes | 2 (solo cobertura LPR) |
| Textos conectados | 10 de 782 (+11 marcados «FALTAN DATOS», 761 rótulos estáticos) |

Muestra por producto calculada, contra la del informe de referencia:

| Producto | Calculado (período exacto, v16) | Referencia 18/9 |
|---|---|---|
| Soja | 2.323 | 2.557 |
| Girasol | 464 | 523 |
| Líquidos (ACEITE) | 146 | 155 |
| Pellet | 211 | 188 |

Las diferencias son esperables y **no se ajustan**: el informe de referencia no estaba recortado
al período exacto, corrió con reglas anteriores a v16 e incluía los ajustes editoriales que el
usuario hacía a mano. El denominador se declara en la propia diapositiva: `sample.unit` pasa a
decir «camiones · recorridos de cámara clasificados».

### Lo que NO quedó conectado

| Id | Motivo |
|---|---|
| `D05_G1`, `D28_G1` | cobertura LPR: `buildExcelCameraComparativaReport` necesita los **eventos crudos**, que no están en las tablas de la corrida (harían falta por `ensureWindowEventsLoaded`, y un rango compuesto abarca varias corridas). **No se sustituyó** por `final_circuits.matched_points_count`: es una métrica parecida pero de otra población, y cambiar de fuente en silencio es justamente lo que hay que evitar. Aparte, el usuario declaró que hoy agranda «todas las cámaras» sumándole los de menos de 4 lecturas; el plan decidió no replicar ese ajuste editorial |
| `tiempos.girasol` · puerta a puerta | el medio da 864 min, sobre el umbral de verosimilitud. Afecta **solo** esa métrica: los tiempos por tramo de girasol sí se publican |
| Textos de tarjetas de tiempos, totales y conclusiones | de los 492 candidatos del mapa de diapositivas se conectan hoy período, índice y muestra por producto |
| Capturas de curvas de calada y volcables | quedan como espacios vacíos para carga manual, por decisión del usuario |

Nada de esto se rellenó con cero ni se dejó pasar del informe de referencia.

### Un bloque pendiente se ve en la diapositiva

Vaciar las celdas evita escribir una cifra vieja, pero no alcanza: `actualizar.py` conserva el
gráfico **y las cifras de texto** de la plantilla, así que la diapositiva seguía mostrando los
números del informe de referencia. Por eso cada gráfico pendiente tiene celdas de texto
asociadas (`CHART_TEXT_MARKERS`) que se escriben con **`FALTAN DATOS`**: en la cobertura LPR
eso tapa las 11 cifras de las diapositivas 5 y 28, y queda a la vista qué falta atacar.

## Tiempos por planta = suma de medias por tramo

El tiempo de Ricardone es la **suma de los tiempos medios de los tramos de Ricardone**, y el de
San Lorenzo la suma de los suyos. Lo que separa a las dos plantas es el **tránsito
interplanta**, que no suma a ninguna.

La clasificación sale de los extremos del tramo: los puntos de San Lorenzo llevan prefijo
`SL_`, así que un tramo con los dos extremos `SL_*` es de San Lorenzo, uno sin ninguno es de
Ricardone, y el salto de uno a otro es el interplanta.

Los tramos que se suman son los del **template canónico** del circuito
(`getCircuitSegmentTemplate`), no toda transición observada: `INGRESO→PREINGRESO` e
`INGRESO→CALADA` son caminos alternativos, sumarlos duplicaría el tiempo.

Es una **suma de medias**, no la media del ciclo: cada tramo tiene su muestra, así que el
paquete conserva `n` por tramo y publica como `ricN`/`slN` el **eslabón más débil** (la muestra
mínima de los tramos sumados).

Verificación contra el informe de referencia (soja, 10–16/09): los tramos de San Lorenzo dan
**42,7** y **18,8** min contra **42** y **19** de la presentación; Preingreso→Calada da **128,4**
contra **126**. El método reproduce la cifra que el usuario venía sumando a mano.

| Circuito | Ricardone | Interplanta | San Lorenzo |
|---|---|---|---|
| Soja R7 | 144,6 (3 tramos) | 12,4 | 199,0 (3 tramos) |
| Girasol R5+R6 | 278,7 (6 tramos) | — | — (no va a San Lorenzo) |
| Pellet | 131,1 | 22,6 | 77,7 |

Girasol da `—` en San Lorenzo porque su template no tiene puntos `SL_`: es **null**, no cero.

### Publicabilidad por métrica, no por sección

Los tiempos por tramo (cámara) y el puerta a puerta (salida Excel − ingreso) son métricas
distintas y se evalúan por separado. Girasol tiene un puerta a puerta de 864 min que no se
publica, pero sus tiempos por tramo son sanos y sí salen. Antes un solo indicador dudoso
bloqueaba toda la sección.

## El período que se exporta es el de los datos, no el del formulario

El formulario de arriba se puede cambiar sin recargar datos. Si el informe usara ese rótulo,
produciría un archivo con cifras de un período y el nombre de otro. Por eso:

- el período sale de `composedRange` (rango compuesto) o, si no hay, del período cargado;
- el panel muestra cuál de los dos está usando;
- si el período no tiene **ningún** dato cargado (`controles.sinDatos`), no se escribe informe:
  sería un archivo entero de pendientes rotulado con un período que nunca se procesó.

## Recorte al período en la sección ejecutiva

El recorte se hace **sobre el CSV, antes** de construir el índice de clasificación, no filtrando
las entries después. `buildCircuitClassificationIndex` canonicaliza el uid del journey (los tres
formatos de `NIVELES_ABCD` — crudo, fusionado y de ciclo — se normalizan y las partes de un
fusionado se ordenan), así que `entry.journeyId` ya no coincide con el `journey_id` crudo de la
tabla. Filtrando después se perdían **2.600 de 3.056** recorridos en silencio.

## Pruebas

```bash
npx vitest run src/features/real-truckflow/logisticsReport server/logisticsReport src/features/real-truckflow/etlWorkbench/etlCameraActivityModel.test.ts
```

Cubren: período exacto y atípico, recorte y deduplicación del día de borde, cero válido frente
a faltante, corrida incompleta declarada como pendiente, mapeo de celdas contra
`vinculos.json`, conservación de históricos, borrado de un gráfico que no se pudo calcular, y
fallo de exportación.

## Reutilización, no duplicación

Para que el informe use las reglas del dashboard sin copiarlas, se extrajeron dos módulos que
antes vivían dentro de componentes React. El panel y el exportador consumen la misma
implementación:

- `etlCameraActivityModel.ts` — conteos por calle, por hora, pico, promedio y cuartos de
  turno. Salió de `CaladaCamerasPanel.tsx` (que ahora lo importa).
- `etlOperationalDay.ts` — día operativo 22:00 y mapa journey → día. Salió de
  `KpiTiemposTab.tsx` (que ahora lo importa).

Se agregó además `tiempoMedioMin`/`tiempoMedioN` a `buildQuarterCircuitSummary`: el medio del
conjunto no es el promedio de los cuatro cuartos, y calcularlo aparte habría duplicado la
regla puerta a puerta.

## Lo que este trabajo no hace

- No programa tareas ni envíos.
- No libera informes: todos quedan para revisión del usuario (`estado:
  para_revision_del_usuario`).
- No recalcula históricos ya presentados.
- No modifica la plantilla ni `actualizar.py`.
