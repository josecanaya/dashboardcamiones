# Prototipo MCP local (rescatado de `fe76ac5`)

Servidor MCP **stdio, local**, en Python, sobre la API del ETL (`http://127.0.0.1:8787`).
Se borró en `d410659`; acá queda como **prueba de concepto y referencia**, no como producto.

Tools: `resolve_window`, `run_etl`, `list_runs`, `get_summary`, `list_tables`, `query_table`,
`get_circuit_catalog`, `explain_journey`, `generar_pptx_comite`. Subagentes en `agentes/subagentes/`.

Qué valida: reglas de negocio solo en el server (el MCP compone llamadas), tools de dominio,
uso con la suscripción (sin API key).

Qué no tiene (ver `docs/propuesta-en-vivo/MCP_NODO_SUR.md`): nube, usuarios/roles, modelo de
nodos, estado en vivo, orquestador, capas 2–4.

Levantarlo (opcional):

```bash
cd agentes/prototipo-mcp-local && python -m venv .venv && .venv/Scripts/pip install -e .
```

Después apuntar `.mcp.json` → `agentes/prototipo-mcp-local/.venv/Scripts/etl-mcp.exe`.
Requiere `node server/truckflow-local-server.mjs` arriba.
