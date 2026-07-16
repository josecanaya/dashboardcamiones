# Agentes Truckflow / ETL — vía MCP + Claude Code (sin API key)

Los agentes corren en la **suscripción** de Claude Code (no consumen `ANTHROPIC_API_KEY`).
El repo expone las tools del ETL como **servidor MCP** (`etl`) y los subagentes viven en
`.claude/agents/`. El loop de tool-use lo hace Claude Code, no un orquestador propio.

## Setup (una vez)

```powershell
cd agentes
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"        # instala el SDK mcp y el script etl-mcp
```

Login de Claude Code por suscripción (NO seteés ANTHROPIC_API_KEY):

```powershell
claude login
```

El servidor MCP ya está registrado en `.mcp.json` (raíz del repo) apuntando a
`agentes/.venv/Scripts/etl-mcp.exe`. Si movés el venv, actualizá esa ruta.

## Correr

1. **Levantar el ETL API** (el MCP compone llamadas a este server):
   ```powershell
   node server/truckflow-local-server.mjs      # puerto 8787
   ```
2. **Interactivo** — abrí Claude Code en la raíz del repo:
   ```powershell
   claude
   ```
   Verificá el MCP: `/mcp` (debe listar `etl` con sus 8 tools). Ejemplos:
   - "listá las corridas y dame el resumen de la última"
   - "¿qué anomalías hay en la última corrida?" (delega en `seguridad`)
   - "armá el PPTX de comité de la última corrida" (delega en `comunicador`)
3. **Headless / por iteración** (misma suscripción, sin API key):
   ```powershell
   claude -p "resumí la última corrida"
   claude -p "explicá el journey de la patente AD887XZ en la última corrida"
   ```

## Comprobar que NO se usa la API key

- No debe existir `ANTHROPIC_API_KEY` en el entorno ni en `agentes/.env`.
- `claude mcp list` → `etl` conectado.
- El consumo de la API en el dashboard de facturación queda en cero.

## Arquitectura

- `src/agentes/mcp_server.py` — servidor MCP stdio; reusa `tools.py` (`dispatch_tool`) + `EtlClient`.
- `src/agentes/tools.py`, `etl_client.py` — sin cambios de negocio; base reusada.
- `.claude/agents/*.md` — subagentes (organigrama): knowledge-truckflow, knowledge-contratos, seguridad, comunicador.
- `CLAUDE.md` (raíz) — reglas del analista (ex `ORQUESTADOR_SYSTEM`).

Ver `docs/migracion/FASE_5_AGENTES_PYTHON.md` para el contexto de la migración.
