# CAPA DE AGENTES

**Nodo Sur comprende únicamente Ricardone y Terminal de Embarque San Lorenzo. Renopack está fuera del perímetro**, por instrucción del usuario del 02/10/2026. Todos los especialistas deben aplicar el mismo alcance antes de calcular actividad, tiempos y seguridad.

Punto de entrada para consultar la actividad de Nodo Sur y preparar informes de logística y seguridad. Se reutilizan las fuentes y cálculos del proyecto; todo resultado nuevo se guarda en esta carpeta.

## Para el próximo chat

Pegá:

> Trabajá con CAPA DE AGENTES. Leé AGENTS.md y ESTADO.md, usá el contexto del producto y las herramientas de cli.mjs. [Mi pregunta y período].

Ejemplos:
- ¿Qué pasó con soja del 24 al 30 de septiembre de 2026? Separá movimientos, tiempos R7 y casos de seguridad.
- ¿Hubo actividad de pellet? Mostrá viajes y patentes, aclarando el universo y si hay datos faltantes.
- Explicá HGC160 con movimientos, cámaras y casos relacionados.
- Generá el informe logístico y de seguridad para el período, siguiendo el formato de referencia.

En este chat se puede usar la CLI directamente, sin cargar un MCP ni iniciar la API. Los perfiles especializados están en `agentes/`; el asistente puede aplicar sus instrucciones y delegar cuando el host lo permita. No son procesos autónomos que corren permanentemente.

## Arquitectura implementada

Coordinador → soja/girasol/pellet/líquidos ↔ seguridad → comunicador. Todos consultan las mismas herramientas deterministas y comparten IDs de operaciones/casos, cobertura y referencias. Grafo de contexto: `conocimiento/grafo.json`. Contexto y recetas: `conocimiento/contexto.json`. Grafo físico: se lee directamente el modelo de nodos existente, sin duplicarlo.

## Consultas desde PowerShell

Desde raíz del repo:

```powershell
node "CAPA DE AGENTES/cli.mjs" context --product soja
node "CAPA DE AGENTES/cli.mjs" sources --from 2026-09-24 --to 2026-09-30
node "CAPA DE AGENTES/cli.mjs" query --from 2026-09-24 --to 2026-09-30 --product soja --limit 10
node "CAPA DE AGENTES/cli.mjs" security --from 2026-09-24 --to 2026-09-30 --plate HGC160
node "CAPA DE AGENTES/cli.mjs" indicator --from 2026-09-24 --to 2026-09-30 --id soja.operaciones
node "CAPA DE AGENTES/cli.mjs" circuits --search R7
node "CAPA DE AGENTES/cli.mjs" report --from 2026-09-24 --to 2026-09-30 --type ambos
```

Dentro de esta carpeta: `node cli.mjs ...`, o `./CONSULTAR.cmd ...`. La ruta de fuentes se resuelve desde el archivo, no depende del directorio de la terminal.

| Comando | Qué entrega |
|---|---|
| context | Ficha de producto, recetas y fragmento relevante del grafo |
| sources | Archivos y disponibilidad del período; presencia no certifica cobertura instrumental |
| query | Movimientos originales normalizados y candidatos temporales de cámara |
| security | Controles de recorrido/calle/visita/retorno/demora con IDs y evidencia, para revisión |
| circuits | Nodos, cámaras y circuitos del modelo físico |
| runs | Semanas guardadas disponibles |
| table | Lectura explícita de tabla guardada, manifest y versión |
| excel | Hojas y filas de un XLS/XLSX dentro del repo |
| api | GET explícito a API local, sin mutaciones |
| package | Recalcula el paquete con los builders existentes del dashboard sobre semanas guardadas |
| indicator | Ejecuta una receta de campo reconocida; informa las que aún no son automáticas |
| pellet | Reejecuta la receta de transile R30/31/32 con viajes, patentes, tandas y tiempos; método heredado explícito |
| report | HTML, JSON de evidencia y PPTX editable para revisión |

Ejemplos adicionales:

```powershell
node "CAPA DE AGENTES/cli.mjs" table --run 2026-09-21_2026-09-27 --table C_operaciones_con_camara --limit 10
node "CAPA DE AGENTES/cli.mjs" excel --file reportes/logistica/2026-09-24_2026-09-30/revision-001/Datos.xlsx
node "CAPA DE AGENTES/cli.mjs" api --path /api/truckflow/health
node "CAPA DE AGENTES/cli.mjs" report --from 2026-09-24 --to 2026-09-30 --type ambos --includeLegacy true
```

`includeLegacy true` añade antecedentes del comité original sólo si el período coincide; no los publica como casos revalidados. El informe habitual no incluye esos anexos. Para otros períodos no se trasladan cifras históricas.

## Conexión del host

`.codex/config.toml` declara siete roles y el MCP para una sesión cuyo directorio sea esta carpeta. `.mcp.json` ofrece el mismo servidor para un host compatible. Los roles de configuración contienen sólo instrucciones; no fijan modelo ni consumo. Registro preparado conforme a la [referencia oficial de configuración](https://learn.chatgpt.com/docs/config-file/config-reference).

El chat ya abierto no recarga automáticamente sus herramientas. Puede usar la CLI ahora. Para cargar los roles/MCP nativamente, abrir una sesión con esta carpeta como directorio y comprobar que el host muestra `capa-agentes`. No se modificó la configuración del repo padre ni la personal. Las rutas del launcher en esos archivos apuntan a este repo; actualizarlas si se mueve de ubicación.

MCP stdio: `node mcp-launch.mjs`. Usa el Python existente de `agentes/.venv` y no necesita API keys. No dejarlo esperando manualmente en terminal: lo inicia el host MCP. La API local es opcional para consultas de disco; `api` requiere que esté disponible.

## Evidencia y límites

- `query` cuenta registros originales, no descargas R7. `indicator` usa muestras y filtros del dashboard. Sus denominadores difieren.
- Filtro de líquidos de esta capa es una taxonomía explícita de productos, todavía no equivale exactamente a la tarjeta histórica de líquidos.
- Cámaras por patente/intervalo son evidencia candidata. No prueban solas el producto ni el vínculo de una operación.
- Los eventos se consultan sin corrección temporal por defecto. Seguridad permite `--timeOffsetMinutes 206` para investigar el método heredado; vigencia pendiente de validar. Raw y corregido quedan visibles.
- Seguridad entrega candidatos, no acusaciones ni anomalías confirmadas. Los huecos de modelo y cobertura se conservan.
- El builder del dashboard sigue usando tablas históricas; la conciliación con C/D/E queda documentada. Reutilizarlo no modifica ni resuelve silenciosamente esa diferencia.
- Formato PPTX funcional inicial con gráficos nativos editables, no réplica exacta del deck de Claude. Casos con capturas DSS requieren vincular los archivos locales antes de reproducir esas láminas completas.

## Pruebas

```powershell
node --test "CAPA DE AGENTES/pruebas/datos.test.mjs" "CAPA DE AGENTES/pruebas/seguridad.test.mjs" "CAPA DE AGENTES/pruebas/informes.test.mjs"
& agentes/.venv/Scripts/python.exe "CAPA DE AGENTES/pruebas/mcp_smoke.py"
```

El reporte usa Python-pptx del runtime bundled de Codex; puede configurarse `CAPA_PYTHON` si cambia. `package` usa esbuild ya instalado en el repo. No instala paquetes ni reprocesa ETL.
