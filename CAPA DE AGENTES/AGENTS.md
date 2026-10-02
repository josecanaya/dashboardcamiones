# Capa de agentes — punto de entrada

**Perímetro Nodo Sur: sólo Ricardone (`RICARDONE`) y Terminal de Embarque San Lorenzo (`TERMINAL_EMBARQUE`). Renopack queda fuera.** Instrucción del usuario del 02/10/2026. Aplicar este filtro antes de contar productos, toneladas, movimientos, tiempos, circuitos y seguridad. Un informe previo que incluyó Renopack tiene un universo distinto y requiere recalcularse. El nodo físico puede existir en el grafo sin pertenecer al perímetro del informe.

Responder en español. Leer README.md y conocimiento/contexto.json. El trabajo de esta carpeta es consultar y reportar actividad de planta, no rediseñar el dashboard.

## Flujo
1. Identificar período, producto, unidad y pedido. Si faltan fechas, consultar disponibilidad con `sources`; no inventar período.
2. `node "CAPA DE AGENTES/cli.mjs" context --product soja` recupera contexto pequeño.
3. `query --from YYYY-MM-DD --to YYYY-MM-DD --product soja` lee fuentes normalizadas originales. `security` agrega revisión transversal. `circuits` recupera nodos/circuitos. `excel` y `api` acceden a fuentes explícitas. `runs` muestra corridas disponibles. `package` reutiliza los builders del dashboard y `indicator` ejecuta las recetas implementadas sobre ese paquete. No sustituir el denominador de un indicador por el total de query.
4. Especialistas en agentes/*.toml son instrucciones portables. `.codex/config.toml` los registra para una sesión abierta en esta carpeta; la sesión padre ya abierta no se recarga. Si no están disponibles en el host, el asistente aplica sus fichas directamente o delega sus instrucciones a subagentes permitidos. No afirmar que corren procesos autónomos.
5. Informe: `report --from ... --to ... --type ambos`. Consultar el JSON de evidencia además del HTML/PPTX. Entrega siempre para revisión del usuario.

## Evidencia y límites
Toda cifra debe provenir de la herramienta y llevar denominador, período y fuente. No sumar patentes distintas de días como vehículos únicos semanales. No equiparar eventos, recorridos y movimientos. Los datos heredados del comité de Claude se rotulan como antecedentes con fecha, no como validación independiente.

Usar la llave de operación y referencias de evento para conectar producto/seguridad/informe. Coincidencia por patente no prueba pertenencia de un evento a una operación. El offset de 206 minutos de los scripts de Claude es una regla heredada a validar; conservar raw occurredAt y declarar su uso. No mezclar métricas de día calendario y operativo.

Estado de actividad requiere cobertura: CON_ACTIVIDAD, SIN_ACTIVIDAD_CONFIRMADA (según fuentes explícitas), DATOS_INSUFICIENTES. SIN_MOVIMIENTOS_EN_ARCHIVOS no acredita inactividad física completa de planta.

Ningún candidato de seguridad acredita intencionalidad. Una transición sin modelo o una lectura ausente puede ser cobertura deficiente. El especialista de producto explica alternativas; seguridad evalúa evidencia; un cambio de regla queda versionado.

No ejecutar ETL automáticamente, modificar fuentes, publicar ni enviar informes. Guardar nueva evidencia y resultados únicamente dentro de CAPA DE AGENTES/salidas. Respetar los cambios existentes del repo. Para retomar, leer ESTADO.md.
