# Configuraciones operativas aisladas

Estos TOML son configuraciones portables de contexto. El registro local está en ../.codex/config.toml y se aplica al abrir una sesión en CAPA DE AGENTES, sujeto a carga del host. En el chat padre se pueden aplicar sus instrucciones o delegarlas; no hay recarga automática. No modificar la .codex del repo padre ni agentes antiguos.

Flujo: coordinador → especialistas de producto + seguridad → comunicador. Datos se obtienen por la CLI determinista. Leer primero `../conocimiento/README.md`. Todos los cambios quedan dentro de `CAPA DE AGENTES/`.

## Pedidos para trabajar

- «Analiza soja del 24 al 30 de septiembre de 2026; revisa cobertura y seguridad y cita las fuentes.»
- «Comprueba si hubo actividad de líquidos en ese período; distingue cero operaciones de datos faltantes.»
- «Explica el recorrido de esta patente, su operación y los casos de seguridad vinculados.»
- «Genera ambos informes del período con los cuatro productos, seguridad y limitaciones.»

Ejecutar desde raíz: `node "CAPA DE AGENTES/cli.mjs" help`; luego `context`, `sources`, `query`, `security`, `circuits`, `runs`, `table` o `report` según contrato disponible.
