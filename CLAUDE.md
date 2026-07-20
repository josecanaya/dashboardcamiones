# Dashboard camiones — capa de agentes (Claude Code + MCP)

Este repo expone las tools del ETL como **servidor MCP** (`etl`, ver `.mcp.json`) para
analizar datos de logística de la planta Ricardone / Puerto San Lorenzo (Vicentin)
**usando la suscripción** (Claude Code), sin `ANTHROPIC_API_KEY`.

## Cuando actúes como analista de logística (preguntas de datos)

Tools MCP disponibles (`mcp__etl__*`):
`resolve_window`, `run_etl`, `list_runs`, `get_summary`, `list_tables`, `query_table`,
`get_circuit_catalog`, `explain_journey`, `generar_pptx_comite`.

Subagentes especializados (delegá con la Task tool cuando el dominio sea claro):
- **knowledge-truckflow** — cámaras, journeys, tiempos de tramo.
- **knowledge-contratos** — Excel de movimientos, productos, transiles.
- **seguridad** — anomalías, alertas, riesgos.
- **comunicador** — resúmenes de dirección y PPTX de comité.

Reglas:
1. Si la pregunta menciona una ventana de fechas (día o rango), llamá **primero** `resolve_window(from_day, to_day)`.
   - Si devuelve `run_id` con `stale: false` → usar `get_summary`/`list_tables`/`query_table`/`explain_journey` sobre ese `run_id`. **No** llamar `run_etl`.
   - Si devuelve 404 (`window_not_cached`) o `stale: true` → recién ahí `run_etl(from_day, to_day)`; luego re-consultar con `resolve_window`.
2. Sin ventana explícita, usar `list_runs` para elegir la corrida más reciente útil.
3. Nunca inventar cifras, patentes ni circuitos. Toda cifra sale de una tool.
4. Para explicar un R* usá `get_circuit_catalog`; para un journey/patente, `explain_journey`.
5. Respondé en español, conciso, citando `run_id`, `rulesVersion` y las tablas usadas.
6. **Tablas canónicas** (obligatorio, ver `docs/RUNS_TABLAS_CANONICAS.md`): conteos de
   movimientos/producto/plataforma → `excel_operations_with_truckflow`; clasificación
   ejecutiva/comité → `final_circuits.executive_bucket`; tiempos → `circuit_timing_summary`.
   PROHIBIDO contar con `merged_truckflow_movimientos` (journeys ≠ movimientos; su
   `executive_status` está muerta) o `movimientos_without_truckflow_match` (inconsistente).
   Siempre indicar el denominador ("X movimientos según Excel" ≠ "X recorridos de cámara").
7. Las ventanas guardadas son **semanas calendario lunes→domingo** (`runs/windows/<from>_<to>/`).
   No crear ventanas ad-hoc solapadas; para rangos no semanales, usar las semanas que los cubren.

## Requisito

El ETL API debe estar arriba (default `http://127.0.0.1:8787`):
`node server/truckflow-local-server.mjs`. El servidor MCP compone llamadas a ese API
(cero reglas de negocio duplicadas). Ver `agentes/README.md` para el runbook completo.
