# TruckFlow v3.0 — Plan de migración a núcleo puro + capa agéntica

> Fecha: 2026-07-28 · Estado: **propuesta para aprobación** (no se tocó código)
> Rama actual: `automatizacion` · Carpeta destino nueva: `truckflow-v3/`
> Antecedentes: `PLAN_REFACTOR_ETL_AGENTES.md` (v2, 2026-07-13) y `HANDOFF-limpieza-arquitectura.md`

---

## 0. Resumen ejecutivo en 10 líneas

El v2 intentó **estrangular en el lugar** un ETL de 42k LOC que vive dentro de una feature
de React. Llegó lejos (etl-core existe, runs persistidos, MCP funcionando) pero quedó
**a mitad de camino de forma estable**: dos formatos de salida en paralelo, 4 catálogos,
4 archivos-dios, 174 errores `tsc`. Estrangular no cerró porque el corazón del pipeline es
**una sola función de 2.952 LOC** — no se puede partir por la mitad y quedar verde.

v3 cambia el método: **carpeta nueva, contrato de datos primero, port fijado por paridad**.
No se reescriben las reglas de negocio (están calibradas contra datos reales); se reescribe
**la plomería**: orquestación, IO y serialización. Lo que hoy es "servicios enredados" pasa a
ser **funciones puras + un DAG declarativo de steps**. Y ese DAG, por declarar qué lee y qué
escribe cada paso, **es** el índice de linaje que la capa agéntica necesita para recorrer la
información sin leer 539 MB de JSON.

---

## 1. Diagnóstico medido (2026-07-28, verificado en el repo)

### 1.1 Tamaños reales

| Ubicación | Archivos | LOC | Qué es |
|---|---|---|---|
| `src/**` total | 306 | 83.914 | — |
| `src/features/real-truckflow/etlWorkbench` | 118 | ~42.000 | **el backend de verdad**, dentro de React |
| `src/etl-core` | 40 | ~6.000 | el núcleo puro que el v2 alcanzó a extraer |
| `src/services` | 38 | ~10.000 | segunda capa de lógica, cruzada con la anterior |
| `server/*.mjs` | 12 | 3.545 | Express: 34 endpoints |
| `agentes/**/*.py` (sin venv) | 11 | 881 | MCP + tools + subagentes |
| `runs/` | — | **539 MB** | 10 ventanas × 28 tablas JSON (58 MB por semana) |

### 1.2 Los cinco problemas estructurales

**(a) El pipeline es una función de 2.952 LOC.**
`runEtlTransform()` en [etlTransformPipeline.ts:600](../../src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts) tiene 10 etapas
identificables sólo por marcas de profiler:

```
plateRegistryFilter(650) → splitFrontRear(753) → cameraAggregates(899)
→ reconstructJourneys(1153) → executiveJourneyMerge(1365) → operationalAlertsMatch(1554)
→ classifyCircuits(2052) → contractFirst(~2105) → lprMerge(2413) → exportCsv(2949)
```

Ninguna etapa tiene firma propia, contrato de entrada/salida, ni test aislado. Todo es
`const` de ámbito compartido dentro de un `async function`. **No hay dónde cortar sin romper.**

**(b) Dos formatos de salida en paralelo (deuda del paso 2.6, diferida).**
`EtlTransformOutput` emite `csv: Record<string,string>` (~40 claves) **y** `tables`
(TypedTable) simultáneamente. Los consumidores re-parsean strings: ~50 `parseCsvToRecords`,
~107 `recordsToCsv`. El dato nace tipado → se serializa → se re-parsea → se re-tipa a mano
en cada panel.

**(c) Cuatro catálogos de circuitos vivos, en cuatro formas distintas.**
El plan v2 (B1) concluyó — correctamente — que **no son duplicados triviales**:
`CIRCUIT_CATALOG` (canónico, S-codes), `DEFAULT_CIRCUIT_MATRIX` (puntos lógicos
INGRESO/PREINGRESO, otra granularidad), `EXECUTIVE_CIRCUIT_MATRIX` (derivado, ya OK),
`MASTER_CIRCUIT_CATALOG` (taxonomía de negocio A1V0/B1V0). El problema no es la duplicación:
es que **falta un modelo que exprese las dos granularidades en un solo lugar**. B1 se cerró
sin resolverlo.

**(d) Acoplamiento al navegador en el núcleo.**
10 archivos de `etlWorkbench`/`services` tocan `document`/`window`; 15 usan `yieldToBrowser()`.
Existe además maquinaria de corrida parcial (`phaseStore`, `onlyTramo`, `buildPartialOutputTramo1`)
que sólo tiene sentido para no congelar una pestaña.

**(e) El gate de arquitectura es una lista de excepciones congelada.**
[check-arch-rules.mjs:27](../../scripts/check-arch-rules.mjs) mantiene un
`ETLWORKBENCH_IMPORT_BASELINE` con ~20 archivos permitidos "hasta que las fases 1-3 los
migren". Las fases 1-3 se cerraron y la baseline sigue ahí. Es la evidencia de que el
estrangulamiento no convergió.

### 1.3 Lo que está bien y hay que preservar intacto

- **La mayoría de los módulos de reglas ya son funciones puras con test espejo**
  (`buildXReport(input) → {rows, summary}`). Transiles interno/externo, `circuitCatalog`,
  `finalCircuitScoring`, `committeeClassification`, `anomalyClassifier`: 72 archivos de test.
- **El layout de runs por ventana estable funciona** (`runs/windows/<from>_<to>/`,
  `_index/by-window.json`, manifest con `inputHash` + `rulesVersion`). Es el acierto de
  diseño más grande del v2 — v3 lo hereda tal cual.
- **La capa agéntica es delgada y correcta**: MCP Python (881 LOC) → HTTP → Express → disco.
  Cero reglas duplicadas. v3 la mantiene y la potencia; no la reescribe.
- **Hay golden master con fixture real** (`tests/fixtures/etl/s-events-slice.json`) y
  **10 ventanas reales persistidas** — o sea, hay con qué fijar paridad sobre datos de verdad.

### 1.4 Por qué esto bloquea al agente hoy

Un agente de IA que quiera responder *"¿cuántos transiles externos con pellet hubo en junio?"*
hoy debe: elegir ventana → `resolve_window` → `query_table` → recibir un slice de un JSON de
58 MB → repetir **por cada una de las 4 semanas de junio** → sumar a mano. No hay consulta
cruzada de ventanas, no hay índice semántico, y no hay forma de que el agente sepa **cómo se
derivó** una columna sin leer 3k LOC. Las reglas 6 y 7 del `CLAUDE.md` (tablas canónicas,
denominadores, ventanas semanales) existen precisamente porque el modelo de datos no las
expresa por sí mismo: **son documentación compensando la falta de contrato**.

---

## 2. Tesis de v3

> **El problema nunca fue la cantidad de archivos. Fue la ausencia de un contrato.**

Tres decisiones fundacionales, en orden de importancia:

1. **El contrato de datos se declara primero y es la fuente de todo lo demás**: tipos, JSON
   Schema, diccionario de datos, descripciones de tools MCP y validación en runtime salen del
   mismo registro de tablas.
2. **El pipeline es un DAG declarativo de steps, no una función.** Cada step declara
   `reads`/`writes`. El orquestador es genérico (~150 LOC) y deriva el orden topológicamente.
3. **Las reglas de negocio se copian verbatim, no se reescriben.** Se reescribe la plomería.
   Es la única forma de que la paridad sea alcanzable, y la paridad es el único gate real.

Corolario para el pedido de la capa agéntica: **el DAG y el registro de tablas son, por
construcción, el mapa que el agente recorre.** No hay que construir un índice aparte y
mantenerlo sincronizado — se genera del código.

---

## 3. Arquitectura objetivo

### 3.1 Carpeta nueva

```
Dashboard_camiones/            ← repo actual (v2 sigue vivo y sirviendo el dashboard)
└── truckflow-v3/              ← LA CARPETA NUEVA
    ├── package.json           ← workspace propio, deps propias (sin React, sin Vite)
    ├── tsconfig.json          ← strict: true, 0 errores desde el día 1
    ├── packages/
    │   ├── contracts/         ← tipos + registro de tablas + catálogo. CERO dependencias.
    │   ├── core/              ← funciones puras. Depende SOLO de contracts.
    │   ├── pipeline/          ← DAG de steps + orquestador genérico.
    │   ├── io/                ← ÚNICA capa impura: readers, writers, parquet, clock, log.
    │   ├── store/             ← runs: layout, índice, índice semántico.
    │   ├── api/               ← HTTP fino = superficie de tools del agente.
    │   └── agent/             ← catálogo de tools + linaje (el MCP Python lo consume).
    ├── apps/cli/              ← `tf run`, `tf query`, `tf explain`, `tf parity`
    └── parity/                ← arnés de paridad v2 ↔ v3 (el gate)
```

**Recomendación sobre "otra carpeta":** que sea **carpeta top-level dentro de este repo**,
no un repo aparte. Razón concreta: el arnés de paridad necesita importar `runEtlTransform`
de v2 y `runPipeline` de v3 **en el mismo proceso** para comparar tabla por tabla, y necesita
las 10 ventanas de `runs/` y el fixture de `tests/fixtures/`. Separar repos ahora convierte
el gate de paridad en un problema de infraestructura. Al cerrar el cutover:
`git subtree split --prefix=truckflow-v3` y se va a su propio repo con historia.

### 3.2 Las cuatro capas y su regla de dependencia

```
contracts  ←  core  ←  pipeline  ←  io/store  ←  api  ←  agent
   (0 deps)   (puro)   (puro)      (impuro)     (http)   (mcp)
```

Se hace cumplir con **`dependency-cruiser`** (no con una allowlist congelada a mano):

| Regla | Efecto |
|---|---|
| `core/**` no puede importar `io`, `store`, `api`, `node:*` | garantiza pureza |
| `core/**` no puede usar `Date.now()`, `Math.random()`, `document`, `window` | determinismo |
| `pipeline/**` sólo importa `core` + `contracts` | steps testeables sin IO |
| sólo `io/**` puede importar `node:fs`, `node:path`, `duckdb` | frontera de efectos |
| 0 ciclos, en cualquier capa | sin excepciones ni baseline |

**Diferencia clave con v2:** cero baseline de excepciones. Una violación es un build roto,
no una entrada nueva en una lista.

### 3.3 `contracts/` — el registro de tablas

Cada tabla canónica se declara **una vez**, y de ahí sale todo:

```ts
// packages/contracts/tables/finalCircuits.ts
export const finalCircuits = defineTable({
  name: 'final_circuits',
  grain: 'journey',                     // 1 fila = 1 recorrido de cámara
  primaryKey: ['journey_uid'],
  producedBy: 'classifyCircuits',       // step del DAG que la escribe
  description:
    'Clasificación final por journey. Fuente única para clasificación ejecutiva ' +
    'y de comité (executive_bucket).',
  denominator: 'recorridos de cámara — NO equivale a movimientos de Excel',
  columns: {
    journey_uid:      col.string({ desc: 'UID del journey Truckflow' }),
    plate:            col.plate(),
    circuit_code:     col.enum(CIRCUIT_CODES, { desc: 'R1..R32, SL1..SL5' }),
    executive_bucket: col.enum(EXECUTIVE_BUCKETS),
    match_rank:       col.int({ desc: 'EXCEL_FIRST_MATCH_RANK; menor = más confiable' }),
    is_differentiable: col.bool({
      desc: 'false ⇒ NO_DIFERENCIABLE: secuencia ambigua (R5≡R6, R26/27/28, R7↔SL1)',
    }),
  },
})
```

Artefactos **generados** de ese registro (nunca escritos a mano):

- `TypedRow<'final_circuits'>` — tipos de fila para todo consumidor
- JSON Schema por tabla — validación en el borde del pipeline
- `DATA_DICTIONARY.md` — el documento que hoy es `RUNS_TABLAS_CANONICAS.md`, pero derivado
- Esquema Parquet — tipos columnares
- **Descripciones de tools MCP** — el agente recibe `denominator` y `grain` en el prompt de
  la tool, o sea las reglas 6 y 7 del `CLAUDE.md` dejan de depender de que alguien las lea

> Esto es lo que convierte "no contar con `merged_truckflow_movimientos`" de una regla
> escrita en un `CLAUDE.md` a una propiedad del sistema: esa tabla se declara
> `grain: 'journey'` + `countable: false` y la tool de query lo dice sola.

### 3.4 `core/` — funciones puras, ni un servicio

La firma de todo módulo de reglas, sin excepción:

```ts
type Kernel<I, O> = (input: I, cfg: Config) => { rows: O[]; diagnostics: Diagnostic[] }
```

Sin clases, sin estado, sin `async`, sin inyección de dependencias, sin reloj. Si un cálculo
necesita "ahora", el `ahora` entra por `cfg`. Cada kernel tiene un test de tabla
(entrada → salida esperada), y **los tests de v2 se migran tal cual** — son el activo más
valioso del repo.

La mayoría del contenido de `core/` es **código copiado de v2 sin tocar** (`finalCircuitScoring`,
`committeeClassification`, `transileExternoCiclo`, `anomalyClassifier`, `circuitCatalog`…).
Lo que se reescribe es sólo lo que hoy vive **suelto dentro** de `runEtlTransform`.

### 3.5 `pipeline/` — el DAG que reemplaza la función de 2.952 LOC

```ts
// packages/pipeline/steps/classifyCircuits.ts
export const classifyCircuits = defineStep({
  id: 'classifyCircuits',
  reads:  ['clean_journeys_for_analysis', 'excel_operations_with_truckflow'],
  writes: ['final_circuits', 'debug_matrix_classification'],
  rulesVersion: 'v13',
  run: (ctx) => {
    const journeys = ctx.read('clean_journeys_for_analysis')
    const excel    = ctx.read('excel_operations_with_truckflow')
    const technical = classifyAgainstMatrix(journeys, ctx.cfg)      // kernel puro (v2 verbatim)
    const executive = reconcileExcelFirst(technical, excel, ctx.cfg) // kernel puro (v2 verbatim)
    return { final_circuits: executive.rows, debug_matrix_classification: technical.rows }
  },
})
```

Las 10 etapas del profiler se vuelven **~25 steps de 100-300 LOC**, cada uno con contrato,
test propio y linaje declarado. El orquestador:

```ts
runPipeline(steps, input, io)   // ~150 LOC: orden topológico, validación de esquema
                               // entre steps, timing, diagnósticos, escritura de artefactos
```

Beneficios inmediatos y concretos:

- **Ejecución incremental gratis**: si `movimientos` no cambió, se saltan los steps que no lo
  leen. Hoy `onlyTramo`/`phaseStore` intenta esto a mano y sólo para el tramo 1.
- **Paralelismo gratis**: los steps sin dependencia mutua corren en paralelo (reemplaza
  `yieldToBrowser()`, que existía sólo para no congelar la pestaña).
- **Linaje gratis**: `reads`/`writes` **es** el grafo de linaje. `explain('final_circuits')`
  no requiere código nuevo.
- **Un step roto no tumba el run**: se marca degradado y el resto sigue.

### 3.6 `io/` + `store/` — Parquet y DuckDB en lugar de 539 MB de JSON

| Hoy | v3 |
|---|---|
| 28 tablas JSON por ventana, 58 MB/semana, 539 MB total | Parquet columnar, estimado 8-12× menor |
| Una ventana por consulta, sin cruce | `read_parquet('runs/windows/*/tables/final_circuits.parquet')` |
| El agente pide slices y suma a mano | El agente escribe **una** SQL |
| Filtro por query-string (`?filter=`) | SQL completa, sólo lectura |

DuckDB va embebido (proceso único, cero servidor — el `PLAN` v2 ya decidió "no microservicios"
y sigue valiendo). **Se mantiene export JSON/CSV** para Power BI y para los consumidores
actuales: es una salida más del writer, no el formato interno.

`store/` conserva el layout de ventana estable de v2 (es el acierto que se hereda) y agrega
un tercer artefacto:

```
runs/windows/<from>_<to>/
  manifest.json     ← igual que hoy (inputHash, rulesVersion, timing)
  tables/*.parquet  ← reemplaza *.json como formato interno
  export/*.json     ← compat Power BI / consumidores v2
  semantic.json     ← NUEVO: ver §4.1
  lineage.json      ← NUEVO: el DAG ejecutado, con timing y filas por step
```

---

## 4. La capa agéntica — tres niveles de granularidad

El pedido literal fue *"que un agente de IA recorra rápido la información"*. Rápido significa
**pocos tokens y pocos round-trips**, y eso se logra con tres niveles, no con una tool más.

### 4.1 L1 — Índice semántico (barato, casi siempre suficiente)

Un `semantic.json` por ventana, de ~5-10 KB, que el agente carga **completo** sin costo:

```json
{
  "window": "2026-07-13..2026-07-19",
  "rulesVersion": "etl_transform_v13",
  "inputHash": "a765d0c281d4",
  "denominators": { "movimientos_excel": 4215, "journeys_camara": 3891, "eventos": 24077 },
  "kpi": { "tiempo_total_p50_min": 143, "tiempo_total_p90_min": 312 },
  "circuitos": { "R7": 2367, "R26": 148, "SL1": 402, "NO_DIFERENCIABLE": 87 },
  "anomalias": { "total": 213, "top": ["circuito_incompleto", "salida_sin_ingreso"] },
  "tables": { "final_circuits": { "rows": 3891, "grain": "journey" } },
  "avisos": ["87 journeys NO_DIFERENCIABLE (R5≡R6, R7↔SL1)"]
}
```

Más un `runs/_index/semantic-all.json` que agrega las 10+ ventanas. **Estimación: ~60% de
las preguntas de negocio se responden acá, sin abrir una sola tabla.** Hoy esas preguntas
cuestan un `resolve_window` + N `query_table` + aritmética del modelo (donde se cometen errores).

### 4.2 L2 — SQL sobre DuckDB (para el 35% que sí necesita datos)

```
query(sql: string) → { columns, rows, rowCount, truncated }
```

Con tres salvaguardas: sólo lectura, `LIMIT` implícito, y **el diccionario de datos generado
(§3.3) inyectado en la descripción de la tool** — el agente ve `grain`, `denominator` y
`countable` de cada tabla antes de escribir la query. Sustituye a `query_table(runId, table,
filter, limit)`, que forzaba un round-trip por ventana.

*"¿Cuántos transiles externos con pellet hubo en junio?"* pasa de 6 llamadas + suma manual a:

```sql
SELECT count(*) FROM transile_externo_operaciones
WHERE producto = 'PELLET' AND fecha BETWEEN '2026-06-01' AND '2026-06-30'
```

### 4.3 L3 — Linaje y explicación (el 5% difícil, y el más valioso)

```
explain(target) → cómo se derivó
```

- `explain('final_circuits.executive_bucket')` → steps que la produjeron, kernels que
  corrieron, entradas del catálogo aplicadas, tabla de origen.
- `explain(journeyUid)` → traza completa: eventos → journey reconstruido → clasificación
  técnica → reconciliación excel-first (con el `match_rank` que ganó) → bucket de comité.
- `explain('R26')` → definición del catálogo, secuencia esperada, con quién solapa, cómo se
  desambigua.

**Costo de construcción: bajo**, porque `reads`/`writes` de cada step ya declaran el grafo.
Ésta es la tool que hoy no existe y que convierte al agente de "consultor de tablas" en algo
que puede auditar una clasificación — que es el uso real (`NO_DIFERENCIABLE`, R26/R27,
líquidos de 5 vs 6 puntos).

### 4.4 Superficie completa de tools v3

| Tool | Nivel | Reemplaza a |
|---|---|---|
| `windows()` | L1 | `list_runs`, `resolve_window`, `list_tables` |
| `overview(window?)` | L1 | `get_summary` |
| `query(sql)` | L2 | `query_table` |
| `schema(table?)` | L2 | (nuevo — el diccionario generado) |
| `explain(target)` | L3 | `explain_journey`, `get_circuit_catalog` |
| `run(from, to)` | escritura | `run_etl` |
| `pptx(window)` | salida | `generar_pptx_comite` |

**De 9 tools a 7, con mucho más alcance.** Sobre el lenguaje: **el MCP Python se mantiene**
(881 LOC, funciona, usa la suscripción sin API key, y `duckdb` tiene binding Python nativo).
Sólo cambia el cliente HTTP al que apunta y se agregan `schema`/`explain`. Reescribirlo en TS
no compra nada.

---

## 5. Método de migración: port fijado por paridad

### 5.1 El gate, y es el único

`parity/` se construye **antes de portar el primer step**:

```
tf parity --window 2026-07-13_2026-07-19
  ├─ corre runEtlTransform (v2)  → tablas A
  ├─ corre runPipeline    (v3)   → tablas B
  └─ compara tabla × tabla × columna:
       · filas idénticas por primary key
       · valores idénticos (tolerancia declarada por columna: 0 en enums/códigos,
         ±1s en timestamps, ±0.1% en agregados de punto flotante)
       · reporta la PRIMERA divergencia con journey_uid y columna
```

Se corre contra **las 10 ventanas reales** de `runs/`, no sólo contra el fixture. Un step no
se considera portado hasta que la paridad de las tablas que escribe es verde en las 10.

**Esto es lo que el v2 no tuvo**: su gate era "el golden master sigue verde", que es un hash
agregado — te dice que algo cambió, no qué ni dónde. Con 3k LOC de por medio, eso hace
imposible portar en pasos chicos. La paridad por columna con localización de divergencia sí
lo permite.

### 5.2 Orden de port: de abajo hacia arriba del DAG

Se porta en orden topológico inverso al de dependencias — las hojas puras primero, porque son
**movimiento sin reescritura** (regla R1 del v2, que fue correcta y se mantiene):

| Ola | Qué | Método | Riesgo |
|---|---|---|---|
| **A** | `src/etl-core/**` (40 archivos) + sus tests | copiar + reescribir imports | casi nulo |
| **B** | Kernels de reglas ya puros: `finalCircuitScoring`, `committeeClassification`, `anomalyClassifier`, transiles, `circuitCatalog` | copiar verbatim + adaptar al contrato `Kernel` | bajo |
| **C** | Steps 1-3 (`plateRegistryFilter`, `splitFrontRear`, `cameraAggregates`) | **extraer** de `runEtlTransform` | bajo |
| **D** | Steps 4-6 (`reconstructJourneys`, `executiveJourneyMerge`, `operationalAlertsMatch`) | extraer | medio |
| **E** | Steps 7-8 (`classifyCircuits`, `contractFirst`) | extraer — **el corazón** | **alto** |
| **F** | Step 9-10 (`lprMerge`, reportes/export) + timing (`etlSegmentTiming`, 3.3k LOC) | extraer | medio |

Las olas A y B son ~60% del volumen de LOC y ~5% del riesgo: son código que ya es puro y
tiene test. El riesgo real está concentrado en la ola E, y ahí la paridad por columna es la red.

### 5.3 Regla de oro (heredada del v2, con una adición)

> **Mover no es reescribir.** Al portar un kernel, el cuerpo queda idéntico salvo imports y
> firma de entrada/salida. Nunca "aprovechar" para renombrar, cambiar lógica ni mejorar.
> **Adición v3:** si al portar aparece un bug real, se **documenta y se preserva** (con test
> que fija el comportamiento actual). Arreglarlo es un commit aparte, después de la paridad
> verde, con decisión del usuario — porque cambia números que ya se reportaron a dirección.

---

## 6. Fases y gates

| Fase | Qué se entrega | Gate de salida | Estimación |
|---|---|---|---|
| **F0** — Contrato | `contracts/` con las 28 tablas declaradas + generadores (tipos, JSON Schema, diccionario) + `dependency-cruiser` | El diccionario generado coincide con `RUNS_TABLAS_CANONICAS.md`; `tsc --strict` = **0 errores** | 3-5 días |
| **F1** — Paridad | Arnés `tf parity` corriendo v2 vs v2 (identidad) sobre las 10 ventanas | Paridad trivial verde; divergencia inyectada a mano se detecta y se localiza | 2-3 días |
| **F2** — Núcleo | Olas A + B portadas; `core/` puro con todos los tests migrados | Tests de kernels verdes; `dependency-cruiser` sin violaciones; 0 ciclos | 1-2 semanas |
| **F3** — DAG | Orquestador + olas C, D, E, F. **Una PR por step, con su paridad.** | Paridad verde **tabla por tabla en las 10 ventanas** | 3-5 semanas |
| **F4** — Almacenamiento | Writer Parquet + DuckDB + `semantic.json` + `lineage.json`; export JSON de compat | `tf run` produce ventana completa; export byte-comparable con v2; tamaño ≤ 1/8 | 1 semana |
| **F5** — Agente | API v3 + 7 tools + MCP Python apuntando a v3 | 20 preguntas de referencia respondidas con **menos round-trips y menos tokens** que v2 (medido) | 1 semana |
| **F6** — Cutover | Dashboard v2 apuntando a la API v3; `etlWorkbench` congelado y luego borrado | Dashboard funcional contra v3; `git subtree split` | 1-2 semanas |

**Total: ~9-14 semanas.** La ola E (F3) es el 40% del riesgo total.

Cada fase se documenta como el v2 hizo bien: un `FASE_N_*.md` autocontenido + `PROGRESO.md`
con casillas. Ese formato funcionó para ejecución por agentes económicos y se mantiene.

---

## 7. Qué v3 elimina explícitamente

Lista cerrada — si algo de acá sobrevive al cutover, la migración no terminó:

| Se elimina | Por qué |
|---|---|
| `csv: Record<string,string>` como formato interno + ~50 `parseCsvToRecords` / ~107 `recordsToCsv` | CSV es serialización de borde, no de intercambio |
| `yieldToBrowser()` (15 archivos), `phaseStore`, `onlyTramo`, `buildPartialOutputTramo1` | v3 corre en Node; el navegador no ejecuta el ETL |
| `document`/`window` en el núcleo (10 archivos) | pureza, garantizada por gate |
| `EtlWorkbenchContext` como depósito del resultado del ETL | la UI lee artefactos por API |
| Los 4 archivos-dios (2.9k-3.4k LOC) | steps de 100-300 LOC |
| `ETLWORKBENCH_IMPORT_BASELINE` (~20 excepciones) | reglas sin excepciones |
| 174 errores `tsc` preexistentes | `strict: true` y 0 desde el día 1 |
| Las reglas 6 y 7 del `CLAUDE.md` como prosa | pasan a ser propiedades del contrato de tablas |

---

## 8. Decisiones que necesito de vos (🛑 antes de arrancar)

Cinco. Las tres primeras cambian el alcance; las dos últimas cambian el diseño.

1. **`CIRCUITO_LIQUIDO`: ¿5 o 6 puntos?**
   `DEFAULT_CIRCUIT_MATRIX` lista 5, el scoring espera 6. v2 lo preservó como override
   documentado para no mover el KPI de líquidos. v3 necesita **una** definición, y la paridad
   va a marcar la divergencia en la ola E. Toca un KPI que ya se reportó.

2. **Export de comité (`powerBiCircuitCsvBundle`, ~14 claves CSV + ZIP): ¿se conserva tal cual?**
   El handoff v2 lo marcó como "requiere decisión de producto — preguntar antes de tocar",
   porque re-deriva desde eventos crudos y **cambia lo que el usuario descarga**. Opciones:
   (a) portar tal cual como step de export, (b) reemplazar por tablas canónicas.
   Recomiendo (a) en v3 y decidir (b) después, con paridad verde de respaldo.

3. **¿El dashboard React migra, o se queda en v2 apuntando a la API v3?**
   Recomiendo **quedarse**: la UI no es el problema, y migrarla en paralelo duplica el riesgo.
   v3 es una migración de **backend**, que es lo que pediste.

4. **Parquet + DuckDB: ¿aprobado?** Es la decisión que más mueve la aguja para el agente
   (539 MB → ~60 MB, y consulta cruzada de ventanas). Agrega **una** dependencia nativa
   (`duckdb`). La alternativa conservadora es seguir con JSON + un índice: más barato de
   arrancar, pero deja al agente donde está hoy.

5. **¿Supabase entra en v3 o queda para después?** El v2 aprobó `etl_runs` + bucket
   `etl-runs` (paso 4.4) y hay migración aplicada. Recomiendo **disco primero, Supabase como
   writer adicional en F4** — no bloquea nada.

---

## 9. Registro de riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| La ola E (classify + contractFirst) no alcanza paridad | media | **alto** | paridad por columna con localización; portar en sub-steps; el `debug_matrix_classification` de v2 es la referencia intermedia |
| v3 revela que v2 tiene un bug (números publicados están mal) | **media-alta** | alto | preservar comportamiento + documentar + decisión explícita del usuario, nunca arreglo silencioso |
| Dos backends vivos a la vez divergen | alta | medio | v2 se **congela** al empezar F3: sólo fixes críticos, y todo fix se replica en v3 el mismo día |
| Estimación se estira (el v2 también se estiró) | alta | medio | F0-F2 entregan valor solas (contrato + núcleo puro reusable por v2); si se corta ahí, no se perdió |
| Lockfiles desincronizados de v2 (`npm ci` falla en clone limpio) | ya presente | bajo | `truckflow-v3/` arranca con lockfile propio y limpio; el de v2 se arregla aparte |
| Los 3 tests preexistentes en rojo de v2 (`etlSegmentTiming` ×2, `etlRicSanLorenzoRoute` R27) | ya presente | bajo | se resuelven **en v3** al portar la ola F, con decisión de cuál es el comportamiento correcto |

---

## 10. Por qué esto sí cierra y el v2 no

| | v2 (estrangulamiento en el lugar) | v3 (carpeta nueva + contrato) |
|---|---|---|
| Gate | golden master (hash agregado) | **paridad por columna, con localización** |
| Unidad de avance | "mover un archivo" | **un step con su contrato y su paridad** |
| Reglas de capas | allowlist congelada que nunca se vació | `dependency-cruiser` sin excepciones |
| Punto de llegada | difuso ("menos enredado") | **binario**: la lista del §7 está vacía o no |
| El corazón (3k LOC) | había que partirlo sin red | se extrae step por step con red |
| Capa agéntica | tools sobre tablas JSON por ventana | **3 niveles**: índice semántico, SQL, linaje |
| Tipos | 174 errores tolerados | 0, desde el primer commit |

El v2 no fracasó: produjo el layout de runs, el etl-core inicial, los 72 tests y el MCP
funcionando. **v3 se para encima de todo eso.** Lo que cambia es el método: en lugar de
demoler desde adentro una casa habitada, se construye al lado con los mismos materiales
—las reglas de negocio validadas— y se muda cuando la paridad dice que es la misma casa.

---

## 11. Siguiente paso concreto

Con tus respuestas al §8 escribo `docs/migracion-v3/FASE_0_CONTRATO.md` y
`FASE_1_PARIDAD.md` en el formato ejecutable por agente (pasos numerados, comando de
verificación por paso, mensaje de commit) y arranco por F0, que no toca nada de v2.
