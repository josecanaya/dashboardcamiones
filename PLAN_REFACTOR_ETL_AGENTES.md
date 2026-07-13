# Plan de refactor ETL → núcleo puro + capa de agentes conversacionales

> Fecha: 2026-07-13 · Estado: propuesta para aprobación
> Objetivo final: chat conversacional con LLM que pueda ejecutar el ETL, consultar resultados
> y extraer información del repo mediante herramientas (tools/MCP).

---

## 1. Diagnóstico (con números del repo hoy)

### 1.1 El núcleo del ETL vive en el frontend

| Ubicación | Archivos | LOC |
|---|---|---|
| `src/features/real-truckflow/etlWorkbench` (lógica ETL real) | 110 | **41.729** |
| `src/services` (segunda capa de lógica) | 68 | 14.129 |
| `src/pages` (páginas con lógica embebida) | 12 | 8.831 |
| `server/` (backend real) | 8 | 1.816 |

El "backend" de verdad son 41k LOC **dentro de una feature de React**, ejecutando en el
navegador (9 archivos usan `yieldToBrowser` para no congelar la UI; `document`/`window`
se filtran en `etlCsv.ts`, `etlExcelFirstMerge.ts`, `powerBiLoad.ts`, etc.).

### 1.2 CSV strings como formato de intercambio interno

El pipeline produce `csv: Record<string, string>` (~40 claves). Los consumidores
**re-parsean** esos strings: 50 llamadas a `parseCsvToRecords`, 107 a `recordsToCsv`.
El dato nace tipado → se serializa a CSV → se re-parsea a `Record<string,string>` → se
re-tipa a mano en cada panel. Se pierden los tipos, se repite parsing O(n) por render,
y cada columna es un contrato implícito frágil (el bug de "De La Vuelta" es un síntoma).

### 1.3 Tres clasificadores de circuitos en paralelo

| Sistema | LOC | Estado |
|---|---|---|
| `realPreliminaryCircuit.ts` | 1.535 | @deprecated pero usado por diagnósticos |
| `circuitEtlV2.ts` | 1.351 | usado por powerBiExport + committeePipeline |
| `finalCircuitScoring.ts` + `committeeClassification.ts` + `etlCircuitClassificationIndex.ts` | 5.656 | el vigente (matriz ejecutiva R*) |

Y el **catálogo de circuitos está definido 4 veces**: `masterCircuitCatalog.ts`,
`validCircuitMatrix.ts`, `kpiCircuitMatrix.ts`, `EXECUTIVE_CIRCUIT_MATRIX`.
Consecuencia directa: el conflicto R26/R27 del transile externo — no hay una fuente
de verdad donde declarar "R26 = transile externo soja".

### 1.4 Migración a medio camino y dependencias circulares

`src/services/truckflowTransform/` (la capa "nueva", 471 LOC) es una fachada de
re-exports que apunta **de vuelta** a etlWorkbench. Los `@deprecated` apuntan en la
dirección contraria. Resultado: `services → etlWorkbench` (11 archivos) y
`etlWorkbench → services` (31 archivos). No hay capas: hay un grafo.

### 1.5 Archivos-dios

`etlSegmentTiming.ts` **5.019** LOC · `etlTransformPipeline.ts` 3.019 ·
`etlCircuitClassificationIndex.ts` 2.547 · `etlExcelFirstMerge.ts` 2.327.
`RealJourneyDiagnosticsPageLegacy.tsx` (2.877 LOC) **no está ruteado en ningún lado** → código muerto.

### 1.6 Lo que SÍ está bien (y hay que preservar)

- La mayoría de los módulos ETL ya son **funciones puras** con tests (patrón
  `buildXReport(input) → {rows, summary}` + `xCsv()` + test espejo). El transile
  interno/externo siguen ese patrón. **El refactor es de organización, no de reescritura.**
- Ya existe prueba de ejecución headless: `scripts/contract-first-cli-runner.ts` corre
  el merge sin navegador. El core ya casi no depende del DOM.
- Hay fixture para golden tests: `tests/fixtures/etl/s-events-slice.json`.

---

## 2. Por qué esto bloquea la meta de agentes + chat LLM

Un agente conversacional necesita tres cosas que hoy no existen:

1. **Tools invocables**: funciones con entrada/salida tipada y documentada, ejecutables
   sin navegador. Hoy el pipeline sólo corre completo dentro de React.
2. **Estado consultable**: los resultados viven como CSV strings en un `useState` de
   `EtlWorkbenchContext` — mueren al recargar la página. El agente no puede responder
   "¿cuántos transiles externos hubo la semana pasada?" sin re-correr todo.
3. **Una sola verdad semántica**: si hay 3 clasificadores y 4 catálogos, el agente
   contesta 3 respuestas distintas a la misma pregunta.

---

## 3. Arquitectura objetivo

```
src/etl-core/            ← paquete TS puro: cero React, cero DOM, cero side-effects
  domain/                ← UN catálogo de circuitos (R* como clave única), patentes,
  │                        timestamps, plantas, productos. Tipos fuente de verdad.
  ingest/                ← lectores: xlsx movimientos, tiempos entre pasos, JSON API
  │                        truckflow → filas tipadas (no CSV)
  transform/             ← funciones puras encadenables:
  │                        normalize → journeys → classify → excelMerge → detectores
  │                        (transile interno, externo, líquidos, kpi…)
  reports/               ← artefactos derivados TIPADOS (TypedTable). CSV sólo como
  │                        serialización en el borde (export).
  pipeline.ts            ← UN orquestador: runEtl(input: EtlInput): EtlResult

src/etl-store/           ← persistencia de corridas (runId → artefactos + stats).
                           Etapa A: JSON/Parquet en disco vía server local.
                           Etapa B: tablas Supabase (ya hay cliente y migraciones).

server/ (etl-api)        ← endpoints finos = LAS TOOLS DEL AGENTE:
                           POST /runs · GET /runs/:id/summary
                           GET /runs/:id/tables/:name?filter · GET /catalog/circuits

apps (React)             ← el dashboard consume EtlResult tipado (en memoria) o la API
                           (histórico). Sin lógica de negocio en componentes.

agente/chat              ← servidor MCP con tools: run_etl, list_runs, get_summary,
                           query_table, explain_circuit, explain_journey.
                           El LLM conversa; las tools consultan etl-store.
```

**Reglas de dependencia (se hacen cumplir con ESLint):**
- `etl-core` no importa de `features/`, `pages/`, `services/` ni usa `window/document`.
- La UI nunca importa `transform/` directamente: consume `EtlResult` o la API.
- CSV sale, no circula: `TypedTable.toCsv()` sólo en export/descarga.

---

## 4. Plan por fases (estrangulamiento progresivo, nunca big-bang)

### Fase 0 — Red de seguridad (1-2 días) ⚠️ prerequisito de todo
1. **Golden test del pipeline**: correr `runEtlTransform` sobre
   `tests/fixtures/etl/s-events-slice.json` + un Excel sintético y snapshotear
   `stats` + 5-6 CSVs clave. Cualquier refactor posterior debe dejar el golden verde.
2. **Congelar etlWorkbench**: regla ESLint `no-restricted-imports` — código nuevo no
   puede agregar imports hacia `etlWorkbench` desde fuera.
3. Borrar código muerto confirmado: `RealJourneyDiagnosticsPageLegacy.tsx` (2.877 LOC).

### Fase 1 — Extraer el núcleo puro (1-2 semanas, mecánico)
1. Crear `src/etl-core/` y mover **primero los módulos ya puros** (bajo riesgo):
   `etlTimestampNormalize`, `etlExternalNormalization`, `etlCsv(Parse)`,
   `transileInternoVolcable`, `transileExternoCiclo`, `finalCircuitScoring`,
   `committeeClassification`, detectores líquidos. Los tests se mueven con ellos.
2. Resolver los 31 imports `etlWorkbench → services` moviendo lo compartido
   (`realEventNormalization`, tipos de journey) a `etl-core/domain`.
3. Sacar `triggerBrowserCsvDownload` y todo `document/window` a la capa UI.
4. `truckflowTransform/` deja de ser fachada: sus re-exports pasan a apuntar a
   `etl-core` y luego se elimina.

### Fase 2 — Intercambio tipado (1 semana)
1. Introducir `TypedTable<T>` (filas tipadas + `toCsv()` perezoso).
2. `EtlTransformOutput.csv` se mantiene como **getter de compatibilidad** mientras
   los paneles migran uno a uno a leer filas tipadas (adiós a los 50
   `parseCsvToRecords` de re-parsing).
3. El `stats` anónimo gigante se convierte en tipos con nombre por etapa.

### Fase 3 — Un clasificador, un catálogo (1-2 semanas, el de mayor valor)
1. **Unificar catálogo**: `masterCircuitCatalog` + `validCircuitMatrix` +
   `kpiCircuitMatrix` + `EXECUTIVE_CIRCUIT_MATRIX` → `etl-core/domain/circuitCatalog.ts`
   con R* como clave, secuencias lógicas, producto, familia.
   👉 Acá aterriza naturalmente el repurposing R26/R27 y el alta de R28/R30-R32 del
   transile externo (la matriz Excel de secuencias por subcódigo que mencionaste se
   carga acá como dato, no como código).
2. Migrar los 2 consumidores de `circuitEtlV2` (powerBiExport, committeePipeline) y
   los de `realPreliminaryCircuit` al clasificador vigente → borrar ambos (−2.9k LOC).
3. Partir `etlSegmentTiming.ts` (5k LOC) por sus secciones naturales.

### Fase 4 — Servicio + persistencia (1 semana)
1. Promover el CLI runner a endpoint del server local: `POST /runs` ejecuta
   `runEtl()` en Node y guarda artefactos por `runId` (disco primero, Supabase después).
2. El dashboard gana un modo "ver corrida histórica" leyendo de la API.
   La corrida en navegador sigue existiendo para uso ad-hoc.

### Fase 5 — Capa de agentes (1 semana una vez existe la Fase 4)
1. Servidor **MCP** delgado sobre etl-api con tools:
   - `run_etl(from, to, excelPath)` → runId
   - `list_runs()` / `get_summary(runId)`
   - `query_table(runId, table, filter, limit)` — la pregunta "¿qué camiones hicieron
     transile externo con pellet?" se vuelve un filtro sobre `transile_externo_operaciones`
   - `explain_journey(plate|journeyUid)` — trazabilidad de clasificación
   - `get_circuit_catalog()` — para que el LLM explique R-códigos
2. Chat conversacional (Claude vía API con tool-use) conectado a ese MCP.
   Como todo es tipado y persistido, cada tool son ~30 líneas.

---

## 5. Qué NO hacer

- **No reescribir la lógica de negocio**: las reglas (ventanas, matrices, comité) están
  validadas con datos reales; el refactor mueve archivos y tipa contratos, no cambia reglas.
- **No microservicios**: un solo proceso Node (el server local ya existe) alcanza de sobra.
- **No migrar la UI a la vez**: los getters de compatibilidad CSV permiten migrar panel
  por panel sin romper nada.

## 6. Orden recomendado de arranque

1. Fase 0 completa (golden test es innegociable).
2. Fase 1 con los módulos transile (interno/externo) como piloto — son los más nuevos,
   más puros y con mejores tests.
3. Fase 3.1 (catálogo unificado) en paralelo, porque desbloquea el pendiente funcional
   del transile externo (R26-R32).

---

## 7. Decisión de lenguaje: ¿Python? (agregado 2026-07-13)

**Decisión: la lógica ETL queda en TypeScript; la capa de agentes puede ser Python.**
La frontera entre ambos mundos es MCP/HTTP — agnóstica al lenguaje.

- **No se porta el core a Python**: las reglas de negocio (ventanas, matrices,
  comité, correcciones de fechas) están calibradas contra datos reales con ~100 tests.
  Reescribir = meses de re-validación, ganancia cero. El problema nunca fue el
  lenguaje sino que el ETL vive dentro de React; eso lo arreglan las Fases 0–4.
- **Python sí en el mundo agentes**: orquestación LLM (SDK Anthropic), `pandas` para
  análisis ad-hoc de los agentes Knowledge sobre tablas del ETL, `python-pptx` para
  el Agente Comunicador (presentaciones comité).
- **Regla de oro**: ninguna regla de negocio se duplica en Python. Si un agente
  necesita una regla, la pide por tool al etl-api; no la re-implementa.

### 7.1 El ETL deja de ser "solo un ETL"

Organigrama objetivo (diagrama del usuario, 2026-07-13): el ETL pasa a ser la
**plataforma de datos** que alimenta a una jerarquía de agentes:

```
Chat Conversacional
  └─ Orquestador (Claude tool-use; enruta al subagente correcto)
       ├─ Agente Seguridad            → tools de anomalías/alertas (bucket ANOMALO)
       ├─ Agente Logística y Eficiencia
       │    └─ Agente Knowledge Truckflow → tools sobre APIs cámaras + alertas
       ├─ Agente Knowledge Contratos  → tools query_table sobre movimientos/contratos
       └─ Agente Comunicador          → KPIs + presentaciones comité (pptx)
                    ▲
        etl-api / etl-store / etl-core  (Fases 1–4; sustrato común, TypeScript)
```

Implicación sobre la Fase 5: se construye en Python con el SDK de Anthropic,
empezando con 2 agentes (Orquestador + Knowledge Truckflow) y creciendo al
organigrama completo. Las Fases 0–4 son prerequisito idéntico en cualquier
lenguaje: sin ETL headless y persistido, los agentes no tienen qué consultar.
