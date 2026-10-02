"""Tools Anthropic tool-use: solo componen llamadas al etl-api (sin reglas de negocio)."""

from __future__ import annotations

import json
from typing import Any, Callable

from agentes.etl_client import EtlClient, EtlApiError

# Nombres canónicos de subagentes (paso 5.4)
SUBAGENT_IDS = (
    "knowledge_truckflow",
    "knowledge_contratos",
    "seguridad",
    "comunicador",
)


def _tool(
    name: str,
    description: str,
    properties: dict[str, Any],
    required: list[str] | None = None,
) -> dict[str, Any]:
    schema: dict[str, Any] = {
        "type": "object",
        "properties": properties,
        "additionalProperties": False,
    }
    if required:
        schema["required"] = required
    return {
        "name": name,
        "description": description,
        "input_schema": schema,
    }


TOOLS: list[dict[str, Any]] = [
    _tool(
        "run_etl",
        (
            "Ejecuta una corrida ETL headless y devuelve run_id. "
            "Usar cuando el usuario pide recalcular/transformar datos, o no hay corrida reciente. "
            "Ejemplo: events_paths=['tests/fixtures/etl/s-events-slice.json'] para el fixture de prueba; "
            "o from_day/to_day (YYYY-MM-DD) si hay JSON en data/truckflow/."
        ),
        {
            "events_paths": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Rutas a JSON de eventos (relativas al repo o absolutas).",
            },
            "excel_path": {
                "type": "string",
                "description": "Ruta opcional a Movimientos por Contrato (.xlsx).",
            },
            "from_day": {"type": "string", "description": "Inicio inclusive YYYY-MM-DD."},
            "to_day": {"type": "string", "description": "Fin inclusive YYYY-MM-DD."},
        },
    ),
    _tool(
        "list_runs",
        (
            "Lista corridas ETL disponibles (runId, estado, timestamps, rulesVersion). "
            "Usar primero para saber qué corrida consultar antes de get_summary o query_table."
        ),
        {
            "remote": {
                "type": "boolean",
                "description": "Si true, también incluye corridas en Supabase (remote=1).",
            }
        },
    ),
    _tool(
        "get_summary",
        (
            "Devuelve stats ejecutivos de una corrida (committeeCompletos, anomalías, incompletos, etc.). "
            "Usar para KPIs de comité o resúmenes de una corrida concreta."
        ),
        {
            "run_id": {"type": "string", "description": "Identificador de corrida."},
        },
        required=["run_id"],
    ),
    _tool(
        "list_tables",
        (
            "Lista nombres de tablas disponibles en una corrida (final_circuits, transiles, alertas…). "
            "Usar antes de query_table si no se sabe el nombre exacto."
        ),
        {
            "run_id": {"type": "string"},
        },
        required=["run_id"],
    ),
    _tool(
        "query_table",
        (
            "Consulta filas de una tabla de la corrida. Filtro simple: col + eq (igualdad string). "
            "Ejemplos: table_name='final_circuits'; "
            "table_name='transile_externo_operaciones' col='product_family' eq='PELLET'; "
            "table_name='alerts_operational'."
        ),
        {
            "run_id": {"type": "string"},
            "table_name": {"type": "string"},
            "limit": {"type": "integer", "description": "Máximo de filas (default 100)."},
            "offset": {"type": "integer"},
            "col": {"type": "string", "description": "Columna para filtrar igualdad."},
            "eq": {"type": "string", "description": "Valor exacto a comparar con col."},
        },
        required=["run_id", "table_name"],
    ),
    _tool(
        "get_circuit_catalog",
        (
            "Devuelve el catálogo de circuitos R* (definición, secuencias, aliases). "
            "Usar para explicar qué es R26, R7, etc. — no inventar definiciones."
        ),
        {},
    ),
    _tool(
        "explain_journey",
        (
            "Explica un viaje buscando evidencia en tablas de clasificación (final_circuits, "
            "debug_matrix_classification, clean_journeys, unclassified_journeys). "
            "Pasar plate (patente) y/o journey_uid. Requiere run_id."
        ),
        {
            "run_id": {"type": "string"},
            "plate": {"type": "string", "description": "Patente del camión (opcional)."},
            "journey_uid": {"type": "string", "description": "UID del journey (opcional)."},
            "limit": {"type": "integer", "description": "Filas por tabla (default 20)."},
        },
        required=["run_id"],
    ),
    _tool(
        "delegar",
        (
            "Delega la consulta a un subagente especializado. "
            "subagente: knowledge_truckflow | knowledge_contratos | seguridad | comunicador. "
            "Usar cuando la pregunta es claramente de un dominio (cámaras/journeys, contratos/Excel, "
            "anomalías/seguridad, o pedir resumen/PPT de comité)."
        ),
        {
            "subagente": {
                "type": "string",
                "enum": list(SUBAGENT_IDS),
            },
            "consulta": {"type": "string", "description": "Pregunta a resolver por el subagente."},
            "run_id": {
                "type": "string",
                "description": "Corrida a usar si ya se conoce (opcional).",
            },
        },
        required=["subagente", "consulta"],
    ),
]


def _truncate(obj: Any, max_chars: int = 24_000) -> Any:
    text = json.dumps(obj, ensure_ascii=False, default=str)
    if len(text) <= max_chars:
        return obj
    return {
        "_truncated": True,
        "_chars": len(text),
        "preview": text[:max_chars],
    }


def _explain_journey(client: EtlClient, args: dict[str, Any]) -> dict[str, Any]:
    run_id = str(args["run_id"])
    plate = (args.get("plate") or "").strip()
    journey_uid = (args.get("journey_uid") or "").strip()
    limit = int(args.get("limit") or 20)
    if not plate and not journey_uid:
        return {"error": "Indicá plate y/o journey_uid"}

    candidates = [
        "final_circuits",
        "debug_matrix_classification",
        "clean_journeys",
        "unclassified_journeys",
        "classified_circuits",
    ]
    available = set((client.list_tables(run_id).get("tables") or []))
    evidence: dict[str, Any] = {}

    for table in candidates:
        if table not in available:
            continue
        hits: list[dict[str, Any]] = []
        if journey_uid:
            for col in ("journey_uid", "journeyUid", "uid"):
                try:
                    q = client.query_table(run_id, table, limit=limit, col=col, eq=journey_uid)
                    hits.extend(q.get("rows") or [])
                except EtlApiError:
                    continue
        if plate:
            for col in ("truck_plate", "truckPlate", "plate", "normalized_plate", "normalizedPlate"):
                try:
                    q = client.query_table(run_id, table, limit=limit, col=col, eq=plate)
                    hits.extend(q.get("rows") or [])
                except EtlApiError:
                    continue
        # dedupe por repr
        seen: set[str] = set()
        unique = []
        for row in hits:
            key = json.dumps(row, sort_keys=True, default=str)
            if key in seen:
                continue
            seen.add(key)
            unique.append(row)
        if unique:
            evidence[table] = unique[:limit]

    return {
        "run_id": run_id,
        "plate": plate or None,
        "journey_uid": journey_uid or None,
        "tables_searched": [t for t in candidates if t in available],
        "evidence": evidence,
    }


def dispatch_tool(
    name: str,
    args: dict[str, Any],
    *,
    client: EtlClient | None = None,
    delegate_handler: Callable[[str, str, str | None], Any] | None = None,
) -> Any:
    """Ejecuta una tool por nombre. `delegar` requiere delegate_handler."""
    c = client or EtlClient()
    try:
        if name == "run_etl":
            return c.create_run(
                events_paths=args.get("events_paths"),
                excel_path=args.get("excel_path"),
                from_day=args.get("from_day"),
                to_day=args.get("to_day"),
                skip_supabase=True,
            )
        if name == "list_runs":
            return c.list_runs(remote=bool(args.get("remote")))
        if name == "get_summary":
            return c.get_summary(str(args["run_id"]))
        if name == "list_tables":
            return c.list_tables(str(args["run_id"]))
        if name == "query_table":
            return c.query_table(
                str(args["run_id"]),
                str(args["table_name"]),
                limit=int(args.get("limit") or 100),
                offset=int(args.get("offset") or 0),
                col=args.get("col"),
                eq=args.get("eq"),
            )
        if name == "get_circuit_catalog":
            return c.get_circuit_catalog()
        if name == "explain_journey":
            return _explain_journey(c, args)
        if name == "delegar":
            if delegate_handler is None:
                return {"error": "delegar no disponible en este contexto"}
            return delegate_handler(
                str(args["subagente"]),
                str(args["consulta"]),
                args.get("run_id"),
            )
        return {"error": f"tool desconocida: {name}"}
    except EtlApiError as e:
        return {"error": str(e), "status": e.status, "body": e.body}
    except Exception as e:  # noqa: BLE001 — devolver al LLM
        return {"error": str(e)}


def tool_result_content(result: Any) -> str:
    return json.dumps(_truncate(result), ensure_ascii=False, default=str)
