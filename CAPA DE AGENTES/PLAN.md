# Plan de ejecución — capa operativa

Objetivo autorizado: especialistas soja, girasol, pellet y líquidos, seguridad transversal y generación de informes, apoyados en fuentes y reglas existentes. Todo cambio nuevo reside aquí. Fuentes externas a esta carpeta son de sólo lectura.

## Entregables
1. Contexto por producto, contexto común y grafo con referencias y estado de validación.
2. Lectores deterministas: movimientos originales normalizados, Excel, API local, eventos de cámara, corridas y catálogo de nodos.
3. Consulta por período/producto/patente con cobertura, denominador, procedencia y límites.
4. Seguridad: evidencia temporal, controles reproducibles y registro de candidatos; antecedentes de Claude separados de casos recalculados.
5. Informes HTML/JSON/PPTX cuando el runtime lo permita; formato basado en comités importados. Sin publicar ni enviar.
6. Entrada CLI y MCP opcional, instrucciones de agentes cargables en cualquier sesión y pruebas.

## Alcance de primera versión
- No reconstruir silenciosamente la totalidad del ETL ni modificar reglas de negocio históricas.
- Las corridas son un adaptador existente; la consulta de fuentes originales también debe funcionar sin API.
- Archivo existente no demuestra cobertura íntegra de cámara: distinguir cobertura de archivos y cobertura instrumental.
- No atribuir producto a una lectura por patente sin vínculo temporal; coincidencias son candidatas.
- No trasladar cifras del 24–30/09 a fechas distintas.
- No clasificar ausencia de una lectura como ausencia de descarga.
- Antecedentes de seguridad incrustados en scripts no equivalen a hallazgos actuales.
- Guardar estado, limitaciones y comandos de continuación.

## Validación
Pruebas aisladas de filtros, deduplicación, fechas, ausencia vs falta de archivos, límites y fuentes; smoke sobre 24–30/09; lectura del grafo real; generación y revisión de reportes. No ejecutar ETL ni escribir fuera de esta carpeta.
