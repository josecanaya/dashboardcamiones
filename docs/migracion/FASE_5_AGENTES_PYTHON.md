# FASE 5 — Capa de agentes en Python (MCP + orquestador)

> Prerequisito: Fase 4 completa (API de corridas funcionando).
> Arquitectura objetivo (organigrama del usuario, PLAN_REFACTOR_ETL_AGENTES.md §7):
> Chat → Orquestador → {Seguridad, Logística y Eficiencia (→Knowledge Truckflow),
> Knowledge Contratos, Comunicador (→KPIs, presentaciones comité)}.
> **Regla de oro: ningún agente re-implementa reglas de negocio; todo por tool.**

## Estructura del paquete

```
agentes/
  pyproject.toml
  .env.example              ← ANTHROPIC_API_KEY, ETL_API_BASE=http://localhost:<puerto>
  src/agentes/
    etl_client.py           ← cliente HTTP fino del etl-api (Fase 4)
    tools.py                ← definición de tools (schema + dispatch)
    orquestador.py          ← loop conversacional Claude tool-use
    subagentes/
      knowledge_truckflow.py
      knowledge_contratos.py
      seguridad.py
      comunicador.py
  tests/
    test_etl_client.py      ← contra el smoke del etl-api
```

## Paso 5.1 — Bootstrap del paquete

1. `mkdir agentes && cd agentes`, creá `pyproject.toml`:
   - Python ≥3.11; deps: `anthropic`, `httpx`, `pydantic`, `pandas`; dev: `pytest`.
2. `python -m venv .venv` + install editable.
3. `etl_client.py`: funciones síncronas finas sobre httpx —
   `create_run`, `list_runs`, `get_summary(run_id)`, `list_tables(run_id)`,
   `query_table(run_id, name, limit=100, col=None, eq=None)`, `get_circuit_catalog()`.
   Cada una mapea 1:1 a un endpoint de Fase 4. Sin lógica extra.
4. Test: con el server local corriendo, `pytest` valida el ciclo completo sobre el fixture.

**Commit:** `fase5: paquete agentes/ con cliente del etl-api`

## Paso 5.2 — Tools para el LLM

En `tools.py` definí las tools (formato tool-use de la API de Anthropic), cada una
delegando en `etl_client`:

| Tool | Descripción para el LLM |
|---|---|
| `run_etl` | Ejecuta el ETL sobre un rango/archivos y devuelve run_id |
| `list_runs` | Corridas disponibles con fechas y estado |
| `get_summary` | KPIs y conteos ejecutivos de una corrida |
| `list_tables` / `query_table` | Explorar/filtrar cualquier tabla (transiles, circuitos, anomalías…) |
| `get_circuit_catalog` | Definición de cada circuito R* (para explicar) |
| `explain_journey` | Dado plate o journey_uid: busca en las tablas de clasificación y devuelve la evidencia (implementar como composición de query_table) |

Regla: las descripciones de tools se escriben en español, con ejemplos de cuándo
usarlas — son el "manual" que lee el LLM.

**Commit:** `fase5: tools del etl-api para tool-use`

## Paso 5.3 — Orquestador conversacional

`orquestador.py`: loop clásico de tool-use con la API de Anthropic
(modelo por defecto: `claude-sonnet-5`; los subagentes Knowledge pueden usar
`claude-haiku-4-5-20251001` para abaratar):

1. system prompt: rol (analista de logística de planta Ricardone/San Lorenzo),
   inventario de tools, y la regla "si la pregunta es de datos, SIEMPRE consultar
   tools; nunca inventar cifras".
2. Loop: mensaje usuario → `client.messages.create(..., tools=TOOLS)` →
   mientras `stop_reason == "tool_use"`: ejecutar tool, devolver `tool_result`.
3. CLI mínima: `python -m agentes.orquestador` abre un REPL de chat.

**Verificación (manual, con server + una corrida hecha):**
- "¿cuántos camiones hicieron transile externo con pellet en la última corrida?"
  → debe llamar `list_runs` → `query_table(transile_externo_operaciones, col=product_family, eq=PELLET)`.
- "explicame el circuito R26" → `get_circuit_catalog`.

**Commit:** `fase5: orquestador conversacional (REPL) con tool-use`

## Paso 5.4 — Subagentes del organigrama

Implementar cada subagente como **configuración** (system prompt + subconjunto de
tools), no como código nuevo:

| Subagente | Tools | Nota |
|---|---|---|
| Knowledge Truckflow | query_table (tablas de cámaras/journeys), explain_journey | |
| Knowledge Contratos | query_table (movimientos/contratos/transiles) | |
| Seguridad | get_summary, query_table (anomalías/alertas) | |
| Comunicador | get_summary, query_table + generación pptx | usa `python-pptx` (agregar dep) para presentaciones comité |

El orquestador enruta con una tool extra `delegar(subagente, consulta)` que abre una
sub-conversación con el system prompt del subagente. Empezar con 2 (Orquestador +
Knowledge Truckflow) y sumar el resto cuando el patrón esté probado.

**Commit (por subagente):** `fase5: subagente <nombre>`

## Paso 5.5 — 🛑 STOP-HUMANO: MCP y exposición

Decidir con el usuario: ¿el chat vive en la CLI, en una web interna, o las tools se
exponen como **servidor MCP** para usarlas desde Claude Desktop/Code? (La opción MCP
reutiliza `tools.py` con el SDK `mcp` de Python — ~50 líneas extra.) Implementar lo
que elija.

## ✅ Criterio de salida de la Fase 5

- REPL de chat responde preguntas de datos reales consultando tools (cero cifras inventadas).
- Al menos Orquestador + Knowledge Truckflow + Comunicador operativos.
- Ninguna regla de negocio duplicada en Python (revisión: `tools.py` y subagentes
  solo componen llamadas al etl-api).
