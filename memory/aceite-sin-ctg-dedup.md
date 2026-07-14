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

**CAUSA REAL del inflado (2026-07-14, la encontró el usuario):** la cámara del **punto de descarga en Renova repite tomas**, así que las operaciones aceite con **<2 cruces Truckflow** son ruido que infla el conteo. Regla: aceite necesita **≥2 cruces** para ser válido. El filtro `filterEntriesByMinTruckflowCrossings(entries, 2)` ya existía (toggle "Muestra validada Truckflow ≥2 cruces" en `TransformEtlTab.tsx`); estaba en `false` por defecto → ahora arranca en `true` para aceite. El archivo `conciliacion_comite_aceite_tf2_*` es la versión filtrada (realista).

**Guardia agregada:** `reconcileMovimientos` (`src/etl-core/reports/movimientosReconciliation.ts`) marca por patente si el ETL emite más operaciones que el Excel (nunca debería). Cableada en la integración → CSV `movimientos_reconciliation` + warning en logs.

**Nota:** el dedup por `external_operation_id` (arriba) resolvió el solape entre archivos; el inflado restante era esto (cruces <2). Al comparar contra un Excel, usar el MISMO set de archivos (ojo con exports tipo `sin_Avellaneda`).
