"""Genera registros locales dentro de CAPA DE AGENTES, sin editar el proyecto padre."""
import json,tomllib
from pathlib import Path
base=Path(__file__).resolve().parent
roles=base/'.codex'/'roles';roles.mkdir(parents=True,exist_ok=True)
parts=['[mcp_servers.capa-agentes]\ncommand = "node"\nargs = ['+json.dumps(str(base/'mcp-launch.mjs').replace('\\','/'))+']\n', '[agents]\nenabled = true\n']
for file in sorted((base/'agentes').glob('*.toml')):
    data=tomllib.loads(file.read_text(encoding='utf-8-sig'))
    (roles/file.name).write_text('developer_instructions = '+json.dumps(data['developer_instructions'],ensure_ascii=False)+'\n',encoding='utf-8')
    parts.append('[agents.'+file.stem.replace('-','_')+']\ndescription = '+json.dumps(data['description'],ensure_ascii=False)+'\nconfig_file = "roles/'+file.name+'"\n')
    # Perfil compatible con el formato Markdown de agentes para hosts que lo usen.
    md=base/'.claude'/'agents'/file.with_suffix('.md').name;md.parent.mkdir(parents=True,exist_ok=True)
    md.write_text('---\nname: '+data['name']+'\ndescription: '+json.dumps(data['description'],ensure_ascii=False)+'\n---\n\n'+data['developer_instructions']+'\n',encoding='utf-8')
config='\n'.join(parts);tomllib.loads(config)
(base/'.codex'/'config.toml').write_text(config,encoding='utf-8')
(base/'.mcp.json').write_text(json.dumps({'mcpServers':{'capa-agentes':{'command':'node','args':[str(base/'mcp-launch.mjs')]}}},indent=2),encoding='utf-8')
print('Configuración local validada: siete roles, MCP y perfiles Markdown.')
