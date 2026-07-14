---
name: aceite-sin-ctg-dedup
description: Aceite/líquido no tiene CTG; los movimientos se deduplican por external_operation_id
metadata: 
  node_type: memory
  type: project
  originSessionId: 7ed3b1fd-7685-4f37-a582-348eb9fe40ad
---

Los movimientos de **aceite/líquido no llevan CTG** (la carta de porte es solo de granos). Por eso `buildStableExcelOperationId` cae al camino comprobante/remito/compuesto (patente+ingreso+fecha+hora) — que NO incluye `row_index` ni `source_file`, así que `external_operation_id` **sí es estable** entre archivos.

**Bug encontrado 2026-07-14:** al cargar varios Excel semanales/planta que se solapan, ninguna etapa deduplicaba, así que el aceite se inflaba (~930 filas para 266 operaciones reales). El usuario lo detectó porque el "rubro aceite" daba 930.

**Fix:** `dedupeMovimientosByOperationId` (función pura en `src/etl-core/ingest/dedupeMovimientos.ts`), cableada en `runMovimientosContratoIntegration` tras normalizar (cubre carga fresca y `preNormalizedMovimientos`). Colapsa por `external_operation_id`, conserva la fila más completa, loguea el solape. NO deduplica filas con id vacío. Relacionado con [[etl-refactor-plan]].

**Pendiente de verificar por el usuario con datos reales:** que el conteo baje a ~266 y que no quede una multiplicación secundaria en `etlCircuitClassificationIndex` (una operación → varias entradas por `matched_journey_uids`).
