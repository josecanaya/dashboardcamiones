# Dashboard camiones — capa de agentes (Claude Code + MCP)

Este repo expone las tools del ETL como **servidor MCP** (`etl`, ver `.mcp.json`) para
analizar datos de logística de la planta Ricardone / Puerto San Lorenzo (Vicentin)
**usando la suscripción** (Claude Code), sin `ANTHROPIC_API_KEY`.

## Cuando actúes como analista de logística (preguntas de datos)

Tools MCP disponibles (`mcp__etl__*`):
`run_etl`, `list_runs`, `get_summary`, `list_tables`, `query_table`,
`get_circuit_catalog`, `explain_journey`, `generar_pptx_comite`.

Subagentes especializados (delegá con la Task tool cuando el dominio sea claro):
- **knowledge-truckflow** — cámaras, journeys, tiempos de tramo.
- **knowledge-contratos** — Excel de movimientos, productos, transiles.
- **seguridad** — anomalías, alertas, riesgos.
- **comunicador** — resúmenes de dirección y PPTX de comité.

Reglas:
1. Si la pregunta es de datos, **siempre** consultá tools. Nunca inventes cifras, patentes ni circuitos.
2. Preferí `list_runs` → `get_summary`/`query_table` sobre la corrida más reciente útil.
3. Para explicar un R* usá `get_circuit_catalog`; para un journey/patente, `explain_journey`.
4. Respondé en español, conciso, citando `run_id` y las tablas usadas.

## Requisito

El ETL API debe estar arriba (default `http://127.0.0.1:8787`):
`node server/truckflow-local-server.mjs`. El servidor MCP compone llamadas a ese API
(cero reglas de negocio duplicadas). Ver `agentes/README.md` para el runbook completo.
