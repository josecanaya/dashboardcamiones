---
name: transile-externo-feature
description: Estado y diseño de la feature "transile externo" (Excel es de vuelta → circuito por producto)
metadata:
  type: project
---

Feature "transile externo" iniciada 2026-07-13, espejando el patrón del transile interno ([[transile-interno-pattern]]).

**Regla de negocio (usuario):** un movimiento del Excel de Movimientos por Contrato es transile externo si la columna **`De La Vuelta`** (nombre real del header, normaliza a `delavuelta`) = SI. El camión recorre Ricardone→San Lorenzo (ingreso/preingreso/calada liq/balanza ing-egr/ingreso SLZ/balanza ing-egr SLZ/egreso SLZ) y vuelve a Ricardone a otro ciclo. Circuito por producto: PELLET (cualquier tipo)→R30/R31/R32, SOJA→R26, GIRASOL→R27/R28.

**Implementado (rebanada vertical, no destructiva):**
- Ingesta columna `es_de_vuelta` en `etlExternalMovimientosContrato.ts` + `normalizeDeVuelta` en `etlExternalNormalization.ts`.
- Módulo `transileExternoCiclo.ts` (+ test): filtra es_de_vuelta, agrupa por patente, clasifica producto→familia (PELLET tiene prioridad sobre SOJA). Sub-código exacto (30/31/32, 27/28) queda como set de candidatos hasta desambiguar.
- Wiring en `etlMovimientosContratoIntegration.ts`: CSVs `transile_externo_operaciones/sessions/summary` + stats.transileExterno + log. Consume `normalized` directo (no la fila mergeada).
- Panel `TransileExternoCicloPanel.tsx` en `PostTransformOptionalActions.tsx` (sección E, ámbar).

**Decisión del usuario PENDIENTE de aplicar (destructiva):** eligió "reutilizar/pisar los ejecutivos" para R26/R27, que hoy significan transile C16↔SL (`finalCircuitScoring.ts` EXECUTIVE_CIRCUIT_MATRIX + asignación por cámara en `etlRicSanLorenzoRoute.ts`) y R27 está en LIQUID_EXECUTIVE_CIRCUITS. Redefinir R26/R27 + crear R28/R30/R31/R32 en la matriz ejecutiva NO se aplicó todavía porque rompe la clasificación por cámara existente — requiere mostrarle el diff y confirmar antes de tocar. **Why:** evita romper clasificaciones en producción. **How to apply:** editar EXECUTIVE_CIRCUIT_MATRIX labels + agregar entradas, decidir si el camino Excel-producto reemplaza o coexiste con la asignación por cámara.

Falta también: el discriminador exacto para sub-códigos — el usuario aclaró (2026-07-13) que nace de **una matriz en un archivo Excel donde cada subcódigo corresponde a una secuencia lógica de pasos** que el camión debe seguir; aún no entregó ese Excel. Además: los camiones de transile externo hoy caen como ANOMALO en la clasificación ejecutiva; sacarlos de ahí depende del repurposing pendiente.

Ver [[etl-refactor-plan]] — el catálogo unificado de circuitos (Fase 3.1 del plan) es donde aterriza este repurposing.
