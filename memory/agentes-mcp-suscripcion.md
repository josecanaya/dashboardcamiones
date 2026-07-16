---
name: agentes-mcp-suscripcion
description: La capa de agentes corre por MCP + Claude Code (suscripción), no por API key
metadata:
  type: project
---

**Decisión 2026-07-14:** la capa de agentes se migró de ANTHROPIC_API_KEY a **MCP + Claude Code** (suscripción Pro/Max), para que cada iteración no consuma la API.

**Concepto clave:** MCP solo expone *tools*, no ejecuta el modelo. Correr "sin API key" requiere un host de primera parte que use la suscripción (Claude Code / Desktop). El repo pasó a ser un **servidor MCP**; el loop de tool-use y la delegación los hace Claude Code.

**Implementación:**
- `agentes/src/agentes/mcp_server.py` — servidor MCP stdio (SDK `mcp`), reusa `dispatch_tool` + `EtlClient` de `tools.py` (cero reglas duplicadas). Expone 7 tools ETL + `generar_pptx_comite`; **excluye `delegar`** (lo hace Claude Code).
- `.mcp.json` (raíz) — registra el server apuntando a `agentes/.venv/Scripts/etl-mcp.exe` (OJO: python del venv, no `python` del sistema, o falla con "Connection closed").
- `.claude/agents/*.md` — 4 subagentes del organigrama (knowledge-truckflow, knowledge-contratos, seguridad, comunicador) con `tools:` restringidas a `mcp__etl__*`.
- `CLAUDE.md` (raíz) — reglas del analista (ex `ORQUESTADOR_SYSTEM`).
- Eliminado `orquestador.py`; `pyproject` sin `anthropic`, entry point `etl-mcp`.

**Requisito runtime:** el ETL API debe estar arriba (`node server/truckflow-local-server.mjs`, puerto 8787); el MCP compone llamadas HTTP a ese server vía `ETL_API_BASE`.

**Pendiente (Decisión #2):** el chat web embebido `server/etl-agent-chat.mjs` (+ UI `src/features/real-truckflow/api/etlAgentApi.ts`) quedó **@deprecated pero funcional** con API key. Falta decidir si se elimina del todo o se deja un acceso a Claude Code. NO se puede usar la suscripción desde el backend de la web propia. Relacionado con [[etl-refactor-plan]].
