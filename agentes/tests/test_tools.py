"""Tests unitarios de tools (dispatch) sin LLM."""

from __future__ import annotations

from agentes.tools import TOOLS, dispatch_tool


def test_tools_include_core_names():
    names = {t["name"] for t in TOOLS}
    assert {
        "run_etl",
        "list_runs",
        "get_summary",
        "list_tables",
        "query_table",
        "get_circuit_catalog",
        "explain_journey",
        "delegar",
    } <= names


def test_tool_descriptions_are_spanish():
    for t in TOOLS:
        assert any(ch in t["description"].lower() for ch in ("á", "é", "í", "ó", "ú", "ñ", "corrida", "tabla", "circuito", "ejecuta", "lista", "consulta", "explica", "delega")) or "Usar" in t["description"]


def test_unknown_tool():
    out = dispatch_tool("no_existe", {})
    assert "error" in out
