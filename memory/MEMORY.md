# Memory index

- [Transile externo (feature)](transile-externo-feature.md) — Excel "De La Vuelta" → circuito por producto; rebanada vertical hecha, repurposing R26/R27 pendiente de confirmar.
- [Plan refactor ETL → agentes](etl-refactor-plan.md) — diagnóstico + 6 fases hacia etl-core puro, persistencia y tools MCP para chat LLM; doc en PLAN_REFACTOR_ETL_AGENTES.md.
- [Aceite sin CTG / dedup movimientos](aceite-sin-ctg-dedup.md) — aceite no tiene CTG; dedup por external_operation_id arregla inflado por solape de archivos.
- [Anomalías: comportamiento vs datos](anomalias-comportamiento-vs-datos.md) — set vigente R1/R2/R4/R5/R6 (R3 retirada, R2 redefinida SL→Ric<2h con 3 subgrupos b/c/a); classifyAnomaly() separa comportamiento de hueco de datos; ficha 3 partes + subgrupos R2 en Seguridad.
- [Agentes por MCP + suscripción](agentes-mcp-suscripcion.md) — la capa de agentes migró de API key a MCP + Claude Code; server en mcp_server.py, subagentes en .claude/agents/.
