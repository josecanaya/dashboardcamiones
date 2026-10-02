# Contexto operativo recuperable

`contexto.json` conserva fichas y recetas respaldadas por archivos existentes. `grafo.json` enlaza productos, indicadores, fuentes y controles. Los archivos originales se leen; esta capa no los modifica.

Las etiquetas `observada_en_codigo`, `historico_reportado`, `inferida` y `pendiente` describen el respaldo documental, no certifican que una regla esté validada por planta. Las cifras del comité 24–30/09 son un corte histórico, no valores para períodos nuevos.

Consulta: `node "CAPA DE AGENTES/cli.mjs" context --product soja`. Antes de consultar actividad use `sources` para comprobar disponibilidad y cobertura; use `query` para resultados y `report` para una entrega trazable.

## Contrato entre especialistas y comunicador

Entregar producto, período, criterio temporal, estado de actividad, indicadores (unidad y denominador), fuente, fórmula/versión, cobertura, casos de seguridad y limitaciones. Cada caso lleva ID compartido, operaciones/recorridos relacionados, evidencia, hipótesis y estado. Seguridad pide explicación al producto; producto pide revisión a seguridad. El comunicador conserva ambos estados y nunca convierte falta de lecturas en cero actividad o una hipótesis en un hecho.

## Estados

- `con_actividad_confirmada`: operaciones identificadas con evidencia.
- `sin_actividad_confirmada`: fuente de operaciones completa para el período, cero registros del producto; declarar alcance.
- `actividad_pendiente_de_identificar`: eventos sin atribución suficiente.
- `datos_insuficientes`: archivos, días o fuentes faltantes, o cobertura no comprobada.

Una ausencia de eventos de cámara no prueba ausencia de operaciones. Archivo presente tampoco garantiza extracción completa. Los operativos pueden atravesar períodos; sin actividad semanal no significa operativo cerrado.

## Pendientes explícitos

Generador de seguridad tiene casos y cifras históricos hardcodeados: se conservan como evidencia reportada, no detector vigente. `excel_extra.json` existe pero el generador no documenta su productor ni todos sus filtros. Desfase de cámaras +206 min y día operativo 22:00 están en scripts históricos: validar vigencia antes de generalizar. Series de comité y ajustes publicados requieren fuente original y aprobación para uso futuro.

## Vigencia de tablas

`docs/RUNS_TABLAS_CANONICAS.md` se declara supersedido por `docs/NIVELES_ABCD.md` (C/D/E). Scripts del informe e instrucciones existentes conservan las tablas históricas. Reproducción histórica y consulta vigente deben declarar su ruta; conciliación con dashboard e implementación pendiente. No presentar una elección arbitraria como canon resuelto.
