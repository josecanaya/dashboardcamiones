"""MCP local: herramientas deterministas de la capa, sin API key ni ETL automático."""
import asyncio
import json
from pathlib import Path
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
server = Server('capa-agentes')
PROPS = {
    'from': {'type': 'string', 'description': 'Primer día YYYY-MM-DD'},
    'to': {'type': 'string', 'description': 'Último día YYYY-MM-DD inclusive'},
    'product': {'type': 'string', 'enum': ['soja', 'girasol', 'pellet', 'liquidos']},
    'plate': {'type': 'string'}, 'limit': {'type': 'integer', 'minimum': 1, 'maximum': 100},
}
SPECS = {
 'context': ('Contexto fuente-backed del producto y grafo acotado', {'product': {'type':'string'}, 'search': {'type':'string'}, 'limit': PROPS['limit']}, []),
 'sources': ('Disponibilidad de fuentes originales por período; no equivale a cobertura instrumental', {k:v for k,v in PROPS.items() if k in ['from','to']}, ['from','to']),
 'query': ('Movimientos originales y evidencia de cámaras candidata; denominadores explícitos', PROPS, ['from','to']),
 'security': ('Controles de seguridad con evidencia, casos candidatos y limitaciones', PROPS, ['from','to']),
 'circuits': ('Consultar nodos/cámaras/circuitos del grafo real', {'search': {'type':'string'}}, []),
 'runs': ('Descubrir ventanas existentes sin ejecutar ETL', {}, []),
 'table': ('Leer tabla existente con procedencia; no ejecuta ETL ni hace conteos de negocio', {'run':{'type':'string'},'table':{'type':'string'},'from':PROPS['from'],'to':PROPS['to'],'limit':PROPS['limit']}, ['run','table']),
 'package': ('Recalcular paquete con builders existentes del dashboard; sólo lectura de corridas', {'from':PROPS['from'],'to':PROPS['to']}, ['from','to']),
 'indicator': ('Resolver receta específica del contexto y leer su indicador del paquete recalculado', {'from':PROPS['from'],'to':PROPS['to'],'id':{'type':'string'}}, ['from','to','id']),
 'pellet': ('Receta operativa existente R30/31/32: viajes, patentes, tandas y cámaras, con método legado explícito', {'from':PROPS['from'],'to':PROPS['to']}, ['from','to']),
 'excel': ('Leer workbook del proyecto preservando hoja y fila', {'file':{'type':'string'},'sheet':{'type':'string'}, 'limit':PROPS['limit']}, ['file']),
 'api': ('GET a API local, sin mutaciones', {'path':{'type':'string'},'base':{'type':'string'}}, ['path']),
 'report': ('Generar informe para revisión dentro de esta carpeta', {'from':PROPS['from'], 'to':PROPS['to'], 'type':{'type':'string','enum':['ambos','logistica','seguridad']},'includeLegacy':{'type':'boolean'}}, ['from','to']),
}

@server.list_tools()
async def list_tools():
    return [types.Tool(name=n, description=d, inputSchema={'type':'object','properties':p,'required':r,'additionalProperties':False}) for n,(d,p,r) in SPECS.items()]

@server.call_tool()
async def call_tool(name, arguments):
    if name not in SPECS:
        raise ValueError('Herramienta desconocida')
    args = ['node', str(HERE / 'cli.mjs'), name]
    for key,val in (arguments or {}).items():
        if key not in SPECS[name][1]:
            raise ValueError('Parámetro no permitido: ' + key)
        args.extend(['--'+key, str(val).lower() if isinstance(val,bool) else str(val)])
    proc = await asyncio.create_subprocess_exec(*args, cwd=str(ROOT), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out,err = await asyncio.wait_for(proc.communicate(), timeout=180)
    except asyncio.TimeoutError:
        proc.kill(); await proc.wait(); raise RuntimeError('Tiempo de consulta excedido')
    if proc.returncode != 0:
        raise RuntimeError(err.decode('utf-8',errors='replace'))
    return [types.TextContent(type='text', text=out.decode('utf-8',errors='replace'))]

async def main():
    async with stdio_server() as (read,write):
        await server.run(read,write,server.create_initialization_options())

if __name__ == '__main__':
    asyncio.run(main())
