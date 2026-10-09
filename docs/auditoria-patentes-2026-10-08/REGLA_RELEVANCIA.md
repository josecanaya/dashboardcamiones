# Regla aplicada y limpieza del backlog

Se descartaron 46 casos pendientes por relevancia: 17 en SLZSalidaC1Fte, 24 en SLZSalidaC2Fte y 5 en SLZTK400. Categorías DSS: 21 Bus, 10 Pickup, 11 Van, 2 Sedan y 2 SUV. Son casos de reconocimiento, no una medición de vehículos únicos. Evidencia del barrido: `data/relevance-cleanup/summary.json`, `backlog-preview.json`, `backlog-applied.json`, `backlog-applied-v2.json` y `sweeps.jsonl`.

## Regla vigente: sl-shared-gates-nontruck-v2

Solo San Lorenzo, cámaras de Egreso C1/C2 frente/trasera y TK400. Solo casos pendientes sin decisión, nota, diferimiento, reapertura o reserva de un operador. Requiere captura DSS de la cámara solicitada con patente exactamente coincidente y diferencia temporal máxima de 5 segundos. Admite una lista explícita de categorías no camión; no interpreta desconocido ni camión pequeño como particular. La confianza OCR no se utiliza como confianza de tipo de vehículo.

Se exige recuperar la lectura original en la historia local/en vivo. Se conserva cualquier visita cuya patente tenga pasos de proceso —balanza, calada, carga o descarga— en ±8 horas. También se conserva cuando hay un candidato parecido (similitud ≥0,65), conocido antes del evento, compatible con el universo y con evidencia de esos procesos. Los candidatos sin parecido no bloquean la limpieza de una pickup.

La tolerancia inicial de 2 segundos dejaba sin evaluar C1. En 38 capturas de C1 con patente exacta la diferencia DSS/feed fue 2.066–4.089 ms. Se amplió a la ventana de 5 segundos ya utilizada por el buscador DSS, conservando coincidencia exacta de patente y cámara. Los primeros 29 descartes conservan la versión v1; los 17 adicionales registran v2.

## Funcionamiento y recuperación

El backend evalúa hasta tres casos cada 30 segundos, en serie con las consultas DSS existentes. Ante 429 espera un minuto; errores o evidencia insuficiente conservan el caso. Una primera evaluación no elegible se revisita después de 30 minutos. No crea una lista negra permanente de patentes: descarta esa visita y permite visitas futuras de la misma matrícula.

Cada descarte registra fuente `automatic_relevance`, regla, categoría, cámara, hora y diferencia temporal. Las decisiones anteriores se respaldaron en `data/relevance-cleanup/backups/`. No se borraron capturas crudas ni candidatos archivados. Los casos pasan a Resueltas y muestran “Descartada automáticamente”. Reabrir con motivo los deja en revisión humana y evita repetir el descarte. La visita descartada se excluye del estado operativo; la exportación de correcciones incluye la quita para el siguiente recálculo ETL. No se recalcularon semanas históricas en esta tarea.

Para un barrido manual: POST `/api/truckflow/live/relevance/cleanup` con `{ "dryRun": true, "limit": 100 }` para inspeccionar; `dryRun: false` aplica. Devuelve casos evaluados, motivos y número realmente descartado. `AUTO_RELEVANCE=0` desactiva el barrido periódico después de reiniciar el backend.

## Límites y verificación

La regla usa una categoría DSS de una captura, protegida por contexto de recorrido. Todavía puede equivocarse cuando se clasifica mal un camión y no existe ninguna lectura operativa ni candidato plausible. Estos descartes son recuperables; se debe revisar una muestra de descartes para medir ese riesgo antes de ampliar cámaras o relajar protecciones. Los pendientes restantes no se forzaron a descartarse.

Pasaron 56 pruebas Vitest del reconocedor/relevancia y 5 pruebas Node de limpieza, decisiones, conflictos y reapertura. Vite build exitoso. No se afirmó haber resuelto la deuda global de TypeScript. La limpieza histórica, la quita exportada y la protección de una reapertura se verificaron con un servicio aislado antes de procesar datos reales.
