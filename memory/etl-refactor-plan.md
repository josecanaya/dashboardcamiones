---
name: etl-refactor-plan
description: Plan aprobado-en-discusión para refactor del ETL hacia núcleo puro + capa de agentes LLM
metadata:
  type: project
---

Plan escrito 2026-07-13 en `PLAN_REFACTOR_ETL_AGENTES.md` (raíz del repo). Meta del usuario: migrar el ETL a una lógica de **agentes conectados a un chat conversacional LLM** que consulte el repo/datos.

**Diagnóstico clave (números 2026-07-13):** ETL real = 41.7k LOC en `src/features/real-truckflow/etlWorkbench` (110 archivos) corriendo EN el navegador; CSV strings como formato de intercambio interno (50 parseCsvToRecords / 107 recordsToCsv); 3 clasificadores de circuito paralelos (realPreliminaryCircuit, circuitEtlV2, finalCircuitScoring — el vigente); catálogo de circuitos definido 4 veces; deps circulares services↔etlWorkbench (11 y 31 archivos); `truckflowTransform/` es fachada de re-exports a medio migrar; `RealJourneyDiagnosticsPageLegacy.tsx` (2.877 LOC) no está ruteado = muerto.

**Fases:** 0) golden test del pipeline sobre `tests/fixtures/etl/s-events-slice.json` + freeze de etlWorkbench (innegociable antes de mover nada) → 1) extraer `src/etl-core/` puro empezando por módulos transile → 2) TypedTable en vez de CSV interno (getter de compatibilidad para UI) → 3) UN catálogo de circuitos (ahí aterriza repurposing R26-R32 de [[transile-externo-feature]]) + borrar clasificadores legacy → 4) POST /runs en server local + persistencia por runId → 5) servidor MCP con tools (run_etl, query_table, explain_journey…) + chat Claude tool-use.

**Why:** el LLM necesita tools tipadas headless, estado persistido consultable y una sola verdad semántica; las tres cosas faltan hoy. **How to apply:** nunca big-bang; estrangulamiento con golden test verde; no reescribir reglas de negocio, sólo mover/tipar.

**Decisión de lenguaje (2026-07-13):** el usuario preguntó si todo debía vivir en Python. Acordado: core ETL queda en TypeScript (reglas validadas, ya corre headless); la capa de agentes (Fase 5) se hace en Python (SDK Anthropic, pandas, python-pptx) hablando con etl-api vía MCP/HTTP. El usuario aportó un organigrama de agentes: Chat → Orquestador → {Agente Seguridad, Agente Logística y Eficiencia (→ Knowledge Truckflow), Agente Knowledge Contratos, Agente Comunicador (→ KPIs + presentaciones comité)} con el ETL abajo como plataforma de datos común. Está volcado en la sección 7 de PLAN_REFACTOR_ETL_AGENTES.md. Regla de oro: ninguna regla de negocio se duplica en Python — siempre por tool.
