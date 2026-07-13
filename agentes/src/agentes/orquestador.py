"""Orquestador conversacional (Claude tool-use) + REPL."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from agentes.etl_client import EtlClient
from agentes.subagentes import get_subagente, tools_for_subagente
from agentes.subagentes.comunicador import PPTX_TOOL, generar_pptx_comite
from agentes.tools import TOOLS, dispatch_tool, tool_result_content

# Cargar .env del paquete agentes/ si existe
_AGENTES_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_AGENTES_ROOT / ".env")
load_dotenv()

DEFAULT_ORQUESTADOR_MODEL = os.environ.get("ORQUESTADOR_MODEL", "claude-sonnet-4-20250514")
DEFAULT_KNOWLEDGE_MODEL = os.environ.get("KNOWLEDGE_MODEL", "claude-haiku-4-5-20251001")

ORQUESTADOR_SYSTEM = """Sos el orquestador analista de logística de planta Ricardone / Puerto San Lorenzo (Vicentin).

Inventario de tools:
- run_etl, list_runs, get_summary, list_tables, query_table, get_circuit_catalog, explain_journey
- delegar(subagente, consulta): knowledge_truckflow | knowledge_contratos | seguridad | comunicador

Reglas:
1. Si la pregunta es de datos, SIEMPRE consultá tools. Nunca inventes cifras, patentes ni circuitos.
2. Preferí list_runs → get_summary / query_table sobre la corrida más reciente útil.
3. Para explicar un R* usá get_circuit_catalog.
4. Delegá con delegar cuando el dominio sea claro (cámaras/journeys → knowledge_truckflow; Excel/productos → knowledge_contratos; anomalías → seguridad; PPT/comité → comunicador).
5. Respondé en español, conciso, citando run_id y tablas usadas.
"""


def _anthropic_client():
    import anthropic

    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        raise RuntimeError("Falta ANTHROPIC_API_KEY (agentes/.env o entorno)")
    return anthropic.Anthropic(api_key=key)


def _extract_text(content: list[Any]) -> str:
    parts: list[str] = []
    for block in content:
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    return "\n".join(parts).strip()


class Orquestador:
    def __init__(
        self,
        *,
        etl: EtlClient | None = None,
        model: str | None = None,
        knowledge_model: str | None = None,
        max_tool_rounds: int = 12,
    ):
        self.etl = etl or EtlClient()
        self.model = model or DEFAULT_ORQUESTADOR_MODEL
        self.knowledge_model = knowledge_model or DEFAULT_KNOWLEDGE_MODEL
        self.max_tool_rounds = max_tool_rounds
        self.client = _anthropic_client()
        self.messages: list[dict[str, Any]] = []

    def _run_loop(
        self,
        *,
        system: str,
        tools: list[dict[str, Any]],
        model: str,
        user_text: str | None = None,
        messages: list[dict[str, Any]] | None = None,
        allow_delegate: bool = True,
    ) -> str:
        msgs = list(messages) if messages is not None else []
        if user_text is not None:
            msgs.append({"role": "user", "content": user_text})

        def handle_delegate(sub_id: str, consulta: str, run_id: str | None) -> Any:
            if not allow_delegate:
                return {"error": "delegación anidada no permitida"}
            return self._run_subagente(sub_id, consulta, run_id=run_id)

        for _ in range(self.max_tool_rounds):
            resp = self.client.messages.create(
                model=model,
                max_tokens=4096,
                system=system,
                tools=tools,
                messages=msgs,
            )
            if resp.stop_reason == "tool_use":
                tool_results = []
                for block in resp.content:
                    if getattr(block, "type", None) != "tool_use":
                        continue
                    name = block.name
                    args = dict(block.input or {})
                    if name == "generar_pptx_comite":
                        result = generar_pptx_comite(
                            str(args["run_id"]),
                            client=self.etl,
                            out_dir=args.get("out_dir"),
                        )
                    else:
                        result = dispatch_tool(
                            name,
                            args,
                            client=self.etl,
                            delegate_handler=handle_delegate if allow_delegate else None,
                        )
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": tool_result_content(result),
                        }
                    )
                msgs.append({"role": "assistant", "content": resp.content})
                msgs.append({"role": "user", "content": tool_results})
                continue

            text = _extract_text(resp.content)
            msgs.append({"role": "assistant", "content": resp.content})
            if messages is None:
                self.messages = msgs
            return text or "(sin texto)"

        return "Se alcanzó el límite de rondas de tools sin respuesta final."

    def _run_subagente(self, sub_id: str, consulta: str, *, run_id: str | None = None) -> dict[str, Any]:
        cfg = get_subagente(sub_id)
        if not cfg:
            return {"error": f"subagente desconocido: {sub_id}"}
        tools = tools_for_subagente(cfg, extra_tools=[PPTX_TOOL] if sub_id == "comunicador" else None)
        # filtrar tools que no existen en TOOLS + pptx
        hint = f"\n\nContexto: run_id={run_id}" if run_id else ""
        text = self._run_loop(
            system=cfg.system_prompt + hint,
            tools=tools,
            model=self.knowledge_model,
            user_text=consulta,
            messages=[],
            allow_delegate=False,
        )
        return {"subagente": sub_id, "respuesta": text}

    def chat(self, user_text: str) -> str:
        return self._run_loop(
            system=ORQUESTADOR_SYSTEM,
            tools=TOOLS,
            model=self.model,
            user_text=user_text,
            messages=self.messages,
            allow_delegate=True,
        )

    def reset(self) -> None:
        self.messages = []


def main() -> None:
    print("Orquestador ETL — Ctrl+C o 'salir' para terminar.")
    print(f"ETL_API_BASE={os.environ.get('ETL_API_BASE', 'http://127.0.0.1:8787')}")
    try:
        orch = Orquestador()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    while True:
        try:
            line = input("\nVos> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nChau.")
            break
        if not line:
            continue
        if line.lower() in {"salir", "exit", "quit"}:
            print("Chau.")
            break
        if line.lower() in {"reset", "/reset"}:
            orch.reset()
            print("(historial limpio)")
            continue
        try:
            answer = orch.chat(line)
            print(f"\nAgente> {answer}")
        except Exception as e:
            print(f"\nError: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
