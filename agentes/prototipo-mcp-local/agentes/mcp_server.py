"""Servidor MCP (stdio) que expone las tools del ETL a Claude Code.

Corre en la SUSCRIPCIÓN del host (Claude Code / Desktop) — NO usa ANTHROPIC_API_KEY.
Reusa `dispatch_tool` + `EtlClient` sin duplicar reglas de negocio: solo compone
llamadas al ETL API (igual que el viejo orquestador con API key, pero el loop de
tool-use ahora lo hace el host).

Uso: `python -m agentes.mcp_server` (lo lanza Claude Code vía .mcp.json).
Requiere el ETL API arriba (ETL_API_BASE, default http://127.0.0.1:8787).
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from dotenv import load_dotenv
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

from agentes.etl_client import EtlClient
from agentes.subagentes.comunicador import PPTX_TOOL, generar_pptx_comite
from agentes.tools import TOOLS, dispatch_tool, tool_result_content

# .env del paquete agentes/ (ETL_API_BASE); NO se necesita ANTHROPIC_API_KEY.
_AGENTES_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_AGENTES_ROOT / ".env")
load_dotenv()

# `delegar` no se expone: la delegación a subagentes la hace Claude Code (Task tool).
_MCP_TOOLS = [t for t in TOOLS if t["name"] != "delegar"] + [PPTX_TOOL]

server: Server = Server("etl")
_client = EtlClient()


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name=t["name"],
            description=t["description"],
            inputSchema=t["input_schema"],
        )
        for t in _MCP_TOOLS
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
    args = dict(arguments or {})

    def _run() -> object:
        if name == "generar_pptx_comite":
            return generar_pptx_comite(
                str(args["run_id"]), client=_client, out_dir=args.get("out_dir")
            )
        # delegate_handler=None: `delegar` no está expuesta acá.
        return dispatch_tool(name, args, client=_client, delegate_handler=None)

    # dispatch_tool hace HTTP síncrono; lo sacamos del event loop.
    result = await asyncio.to_thread(_run)
    return [types.TextContent(type="text", text=tool_result_content(result))]


async def _serve() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


def main() -> None:
    asyncio.run(_serve())


if __name__ == "__main__":
    main()
