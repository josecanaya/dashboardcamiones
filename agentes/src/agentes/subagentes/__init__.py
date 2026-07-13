"""Skills descriptivas de subagentes (paridad con server/etl-agent-skills.mjs)."""

from __future__ import annotations

from dataclasses import dataclass

from agentes.tools import TOOLS

PLANT_GLOSSARY = """
Glosario: Q1–Q4 en tiempos = franjas horarias AR (Q1 00–06, Q2 06–12, Q3 12–18, Q4 18–24), no circuitos.
R* = circuitos ejecutivos. Preingreso→Calada = get_segment_kpi / segment_timing_kpi.
"""

RESPONSE_HINT = """
Respondé en español, juicio operativo primero, números con n y mediana. Evitá volcados markdown.
"""


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
        "Skill Knowledge Truckflow: experta en cámaras, journeys y tiempos de tramo Vicentin. "
        "Razoná hallazgos (cuellos de botella, desvío), no dumps. "
        "Usá get_segment_kpi para Preingreso→Calada. "
        + PLANT_GLOSSARY
        + RESPONSE_HINT
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
        "Skill Knowledge Contratos: Excel/productos/transiles. No reclasifiques circuitos. "
        + PLANT_GLOSSARY
        + RESPONSE_HINT
    ),
    tool_names=("list_runs", "list_tables", "query_table", "get_summary", "run_etl"),
)

SEGURIDAD = SubagenteConfig(
    id="seguridad",
    nombre="Seguridad",
    system_prompt=(
        "Skill Seguridad: anomalías/alertas. Un riesgo claro > listas largas. "
        + RESPONSE_HINT
    ),
    tool_names=("list_runs", "get_summary", "list_tables", "query_table", "explain_journey"),
)

COMUNICADOR = SubagenteConfig(
    id="comunicador",
    nombre="Comunicador",
    system_prompt=(
        "Skill Comunicador: lenguaje de dirección. 3 métricas, 2 hallazgos. "
        + RESPONSE_HINT
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
