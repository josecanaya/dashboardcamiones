"""Subagentes como configuración (system prompt + subset de tools). Sin lógica de negocio."""

from __future__ import annotations

from dataclasses import dataclass

from agentes.tools import TOOLS


@dataclass(frozen=True)
class SubagenteConfig:
    id: str
    nombre: str
    system_prompt: str
    tool_names: tuple[str, ...]


def _tools_by_name(names: tuple[str, ...]) -> list[dict]:
    wanted = set(names)
    return [t for t in TOOLS if t["name"] in wanted]


KNOWLEDGE_TRUCKFLOW = SubagenteConfig(
    id="knowledge_truckflow",
    nombre="Knowledge Truckflow",
    system_prompt=(
        "Sos Knowledge Truckflow: especialista en eventos de cámaras, journeys y circuitos "
        "operativos de Ricardone / San Lorenzo. "
        "Respondé solo con evidencia de tools (query_table, explain_journey, list_tables, get_summary). "
        "Nunca inventes patentes, conteos ni códigos de circuito. "
        "Si falta run_id, pedí list_runs vía el orquestador o usá el run_id del contexto."
    ),
    tool_names=(
        "list_runs",
        "list_tables",
        "query_table",
        "explain_journey",
        "get_summary",
        "get_circuit_catalog",
    ),
)

KNOWLEDGE_CONTRATOS = SubagenteConfig(
    id="knowledge_contratos",
    nombre="Knowledge Contratos",
    system_prompt=(
        "Sos Knowledge Contratos: especialista en Movimientos por Contrato, productos, "
        "transiles y cruce Excel↔Truckflow. "
        "Usá query_table sobre tablas de operaciones/movimientos/transiles. "
        "No reclasifiques circuitos ni inventes reglas: solo leé lo que emitió el ETL."
    ),
    tool_names=("list_runs", "list_tables", "query_table", "get_summary", "run_etl"),
)

SEGURIDAD = SubagenteConfig(
    id="seguridad",
    nombre="Seguridad",
    system_prompt=(
        "Sos el subagente de Seguridad operativa: anomalías, alertas LPR/operativas e incompletos. "
        "Priorizá get_summary y query_table sobre tablas de alertas/anomalías/unclassified. "
        "No inventes riesgos: citá filas concretas."
    ),
    tool_names=("list_runs", "get_summary", "list_tables", "query_table", "explain_journey"),
)

COMUNICADOR = SubagenteConfig(
    id="comunicador",
    nombre="Comunicador",
    system_prompt=(
        "Sos Comunicador de comité: resumís KPIs ejecutivos en lenguaje claro para dirección. "
        "Usá get_summary y query_table. Si te piden presentación, usá la tool "
        "generar_pptx_comite (si está disponible) o estructurá bullets listos para slide. "
        "Cifras solo desde tools."
    ),
    tool_names=("list_runs", "get_summary", "list_tables", "query_table", "generar_pptx_comite"),
)

REGISTRY: dict[str, SubagenteConfig] = {
    KNOWLEDGE_TRUCKFLOW.id: KNOWLEDGE_TRUCKFLOW,
    KNOWLEDGE_CONTRATOS.id: KNOWLEDGE_CONTRATOS,
    SEGURIDAD.id: SEGURIDAD,
    COMUNICADOR.id: COMUNICADOR,
}


def get_subagente(subagente_id: str) -> SubagenteConfig | None:
    return REGISTRY.get(subagente_id)


def tools_for_subagente(cfg: SubagenteConfig, extra_tools: list[dict] | None = None) -> list[dict]:
    base = _tools_by_name(cfg.tool_names)
    if not extra_tools:
        return base
    names = {t["name"] for t in base}
    out = list(base)
    for t in extra_tools:
        if t["name"] in cfg.tool_names and t["name"] not in names:
            out.append(t)
            names.add(t["name"])
    return out
