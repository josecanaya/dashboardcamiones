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

**Chat web (resuelto 2026-07-14):** se mantuvo la MISMA UI del chat embebido pero se **cortó el vínculo con la API key**. `server/etl-agent-chat.mjs` se reescribió como **puente a Claude Code headless**: `chat()` hace `spawn(claude, ['-p', prompt, '--output-format','json','--mcp-config','.mcp.json','--append-system-prompt',...,'--allowedTools','Task','mcp__etl__*'])` con **ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN/ANTHROPIC_BASE_URL borradas del env del hijo** → usa la suscripción. `findClaudeCli()` autodetecta el `claude.exe` del paquete Claude Desktop (`%LOCALAPPDATA%\Packages\Claude_*\...\claude-code\<ver>\claude.exe`, toma la mayor versión); override con `CLAUDE_CLI_PATH`. Se eliminó `etl-agent-skills.mjs`.

**Verificado:** con API key dummy en el entorno padre, el hijo la ignora (va a suscripción). **Requisito manual del usuario:** `claude login` del CLI (el desktop-bundled dio "Not logged in" en headless hasta loguear). Si no está logueado, el chat devuelve error 503 accionable.

**Caveat de términos:** usar la suscripción para un backend servido es un workaround (la suscripción apunta a uso interactivo; el camino soportado para web es la API). Latencia mayor (spawn por mensaje). Relacionado con [[etl-refactor-plan]].
