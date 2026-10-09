"""Smoke real: MCP stdio y API comparten exactamente el KPI histórico."""
import asyncio
import json
import sys
from pathlib import Path
import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    root = Path(__file__).resolve().parent.parent
    scope = dict(mode='historical', site='both', metricId='segment.duration_median',
                 runIds=['2026-09-28_2026-10-04'], **{'from':'2026-09-28','to':'2026-10-04'},
                 circuit='R5', fromPoint='PREINGRESO', toPoint='CALADA')
    api = httpx.post('http://127.0.0.1:8787/api/analytics/metric', json=scope, timeout=60)
    api.raise_for_status()
    expected = api.json()
    parameters = StdioServerParameters(command=sys.executable, args=[str(root/'agentes'/'run_mcp.py')])
    async with stdio_client(parameters) as (reader, writer):
        async with ClientSession(reader,writer) as session:
            await session.initialize()
            tools = await session.list_tools()
            assert 'get_metric' in [tool.name for tool in tools.tools]
            result = await session.call_tool('get_metric',scope)
            actual = json.loads(result.content[0].text)
            for key in ('value','n','metricVersion','schemaVersion','evidenceId','coverage','rulesVersion','runIds'):
                assert expected[key] == actual[key], (key,expected[key],actual[key])
            print(json.dumps({'status':'passed','tools':len(tools.tools),'metricId':scope['metricId'],
                              'value':actual['value'],'n':actual['n'],'evidenceId':actual['evidenceId'],
                              'runIds':actual['runIds'],'rulesVersion':actual['rulesVersion']},ensure_ascii=False))
asyncio.run(main())
