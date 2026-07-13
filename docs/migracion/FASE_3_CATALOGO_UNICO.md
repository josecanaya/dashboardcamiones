# FASE 3 — Un catálogo de circuitos, un clasificador

> La fase de mayor valor y mayor riesgo. Hoy el catálogo de circuitos está definido
> en 4 lugares y hay 3 clasificadores. Al cerrar esta fase: UNA fuente de verdad
> (`etl-core/domain/circuitCatalog.ts`) y UN clasificador (el vigente,
> `finalCircuitScoring`). Acá aterriza el pendiente funcional del transile externo
> (R26–R32 por producto).

## Fuentes actuales (leer las 4 antes de empezar)

| Fuente | Rol hoy |
|---|---|
| `src/features/real-truckflow/etlWorkbench/finalCircuitScoring.ts` → `EXECUTIVE_CIRCUIT_MATRIX` | La matriz ejecutiva R* vigente (clasificación) |
| `src/data/masterCircuitCatalog.ts` | Catálogo de negocio por planta (códigos A/B/E, nombres) |
| `src/features/real-truckflow/etlWorkbench/validCircuitMatrix.ts` | Secuencias lógicas válidas |
| `src/config/kpiCircuitMatrix.ts` | Config KPI por circuito |

---

## Paso 3.1 — Catálogo unificado (solo agregar, no borrar)

1. Creá `src/etl-core/domain/circuitCatalog.ts` con el tipo:

```ts
/** Fuente única de verdad de circuitos logísticos (clave: código ejecutivo R*). */
export type CircuitCatalogEntry = {
  code: string                      // 'R26'
  label: string                     // 'Transile externo Soja Ric↔SLZ'
  kind: 'recepcion' | 'despacho' | 'transile_interno' | 'transile_externo' | 'liquido' | 'inferido'
  product?: 'SOJA' | 'GIRASOL' | 'PELLET' | 'ACEITE' | ''
  coveragePercent: number
  hasStrongPoint: boolean
  enabledForClassification: boolean
  aliases?: string[]                // códigos técnicos legacy
  baseSequence?: string[]           // secuencia lógica S*/pasos
  allowedSequences?: string[][]
  kpi?: { /* copiar el shape que use kpiCircuitMatrix */ }
}
export const CIRCUIT_CATALOG: Record<string, CircuitCatalogEntry> = { /* ... */ }
```

2. Poblalo COPIANDO los datos de `EXECUTIVE_CIRCUIT_MATRIX` (todos los códigos),
   enriquecidos con lo de las otras 3 fuentes cuando exista (label de negocio,
   secuencias, kpi).
3. **Test de paridad** `circuitCatalog.test.ts`: para cada código de
   `EXECUTIVE_CIRCUIT_MATRIX`, el catálogo nuevo tiene la misma
   `coveragePercent`, `hasStrongPoint`, `enabledForClassification`, `aliases` y
   `baseSequence`. Este test es la red de esta fase.

**Commit:** `fase3: circuitCatalog unificado en etl-core/domain (+ test de paridad)`

## Paso 3.2 — 🛑 STOP-HUMANO: alta de R28/R30/R31/R32 y repurposing R26/R27

Contexto (decidido por el usuario 2026-07-13, ver PLAN_REFACTOR_ETL_AGENTES.md §7 y
memoria del proyecto):

- Transile externo por producto: PELLET→R30/R31/R32 · SOJA→R26 · GIRASOL→R27/R28.
- HOY R26/R27 significan "Transile C16↔SL" en la matriz y se asignan por evidencia
  de cámara en `finalCircuitScoring.ts` líneas ~989-995
  (`journeyIsTransileC16ToSl` / `journeyIsTransileSlToC16`).
- El discriminador de subcódigo (R30 vs 31 vs 32; R27 vs 28) sale de **una matriz
  Excel de secuencias de pasos que el usuario aún no entregó**.

Pedile al usuario:
1. La matriz Excel de secuencias por subcódigo (o que confirme trabajar con familias
   de candidatos mientras tanto).
2. Confirmación de qué pasa con los journeys que HOY se clasifican R26/R27 por
   cámara (C16↔SL): ¿se re-etiquetan? ¿nuevo código para ese caso?

Con las respuestas: actualizá `CIRCUIT_CATALOG` (labels nuevos, entradas R28/R30-32
con `kind: 'transile_externo'` y `product`), y actualizá el test de paridad para las
divergencias EXPLÍCITAMENTE aprobadas (documentalas en el test con comentario).

**Commit:** `fase3: R26-R32 transile externo en catálogo (decisión usuario <fecha>)`

## Paso 3.3 — `finalCircuitScoring` lee del catálogo

1. `EXECUTIVE_CIRCUIT_MATRIX` pasa a construirse DESDE `CIRCUIT_CATALOG`
   (map/filter), manteniendo el mismo shape exportado. Nada más cambia.
2. Verificación: golden verde + test de paridad verde + tests de scoring
   (`finalCircuitScoring.test.ts`, `committeeClassification.test.ts`).

**Commit:** `fase3: EXECUTIVE_CIRCUIT_MATRIX derivada de circuitCatalog`

## Paso 3.4 — Clasificación del transile externo deja de ser ANOMALO

**Objetivo funcional:** los journeys cuyo movimiento Excel tiene `es_de_vuelta=true`
deben clasificarse con su circuito externo (por producto) en vez de caer en ANOMALO.

1. Localizá en `etlMovimientosContratoIntegration.ts` dónde se construye
   `transileExternoReport` (búsqueda: `buildTransileExternoReport`).
2. El reporte ya trae `circuit_assigned`/`circuit_candidates` por operación con
   patente y ventana temporal. Cruzalo con los journeys clasificados (mismo patrón
   que usa `excelCircuitHintForSession` en
   `etl-core/reports/transileInternoVolcable.ts`): patente + solapamiento temporal.
3. Para cada journey matcheado cuyo estado ejecutivo sea `ANOMALO` o
   `NO_EVALUABLE`, emití una fila de **override propuesto** en una nueva tabla
   `transile_externo_reclasificacion` (journey_uid, estado_original,
   circuito_propuesto, evidencia). NO mutes la clasificación todavía.
4. 🛑 STOP-HUMANO: mostrá al usuario la tabla con datos reales. Si aprueba, aplicá
   el override en el punto único donde se resuelve el estado ejecutivo final
   (buscá `resolveExecutiveCircuit` en `finalCircuitScoring.ts`) con una regla
   nueva y test propio. El golden cambiará: regenerá el snapshot con aprobación.

**Commits:** `fase3: tabla de reclasificación transile externo (propuesta)` y luego
`fase3: override ejecutivo transile externo (aprobado por usuario)`

## Paso 3.5 — Borrar clasificadores legacy

1. Migrá los consumidores de `circuitEtlV2` (son 2: `powerBiEtlExportBuilder.ts`,
   `realCommitteePipeline.ts`) al clasificador vigente. Uno por commit.
2. Migrá los consumidores de `realPreliminaryCircuit` (grep para lista actual;
   incluye `realJourneyEventsMapper.ts`, `realJourneyQuality.ts`, páginas de
   diagnóstico). Si una página de diagnóstico legacy lo hace inviable,
   🛑 STOP-HUMANO: proponer eliminar esa página.
3. Cuando `grep -rn "circuitEtlV2\|realPreliminaryCircuit" src --include="*.ts*"`
   solo devuelva los propios archivos → borralos (`git rm`), junto con sus tests.
4. Verificación R2 completa + `npm test` entero.

**Commit:** `fase3: eliminados circuitEtlV2 y realPreliminaryCircuit (−2.9k LOC)`

## Paso 3.6 — Partir `etlSegmentTiming.ts` (5.019 LOC) — opcional si hay tiempo

Solo si los pasos anteriores están verdes. Partir por secciones naturales usando
la receta de shims de Fase 1 (buscar los bloques de comentario `// ===` o agrupar
por prefijo de función). Un commit por sección extraída. El golden es el juez.

## ✅ Criterio de salida de la Fase 3

- `CIRCUIT_CATALOG` es la única definición; las otras 3 fuentes re-exportan o murieron.
- Transile externo clasifica por producto (no ANOMALO) — aprobado con datos reales.
- `circuitEtlV2` y `realPreliminaryCircuit` no existen.
