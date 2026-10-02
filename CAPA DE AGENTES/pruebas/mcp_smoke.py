"""Verifica protocolo MCP real, herramientas y errores sin escribir fuera de la capa."""
import asyncio,json
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
HERE=Path(__file__).resolve().parents[1]
async def main():
    params=StdioServerParameters(command='node',args=[str(HERE/'mcp-launch.mjs')],cwd=str(HERE.parent))
    async with stdio_client(params) as (read,write):
        async with ClientSession(read,write) as session:
            await session.initialize()
            tools=await session.list_tools()
            assert {'context','query','security','report','package','indicator'} <= {t.name for t in tools.tools}
            result=await session.call_tool('context',{'product':'soja','limit':5})
            assert not result.isError
            body=json.loads(result.content[0].text)
            assert body['product']['label']=='Soja'
            failed=await session.call_tool('query',{'from':'2026-02-30','to':'2026-03-02'})
            assert failed.isError
            print(json.dumps({'ok':True,'tools':len(tools.tools),'context':'soja','invalidDate':'isError'}))
asyncio.run(main())
