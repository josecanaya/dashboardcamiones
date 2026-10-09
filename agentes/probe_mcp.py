"""Comprueba inicio e inventario del servidor configurado sin consultar datos."""
import asyncio
import json
import os
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
async def main():
    with open(sys.argv[1],encoding='utf-8') as file:
        config=json.load(file)['mcpServers']['etl']
    params=StdioServerParameters(command=config['command'],args=config.get('args',[]),env={**os.environ,**config.get('env',{})})
    async with stdio_client(params) as (reader,writer):
        async with ClientSession(reader,writer) as session:
            await session.initialize()
            tools=await session.list_tools()
            names={tool.name for tool in tools.tools}
            if not {'get_metric','get_metric_catalog','resolve_window'}.issubset(names):
                raise RuntimeError('Faltan tools del contrato transversal')
            print(json.dumps({'toolsAvailable':True,'toolCount':len(names)}))
asyncio.run(main())
