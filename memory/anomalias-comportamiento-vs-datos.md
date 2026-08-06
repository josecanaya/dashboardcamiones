---
name: anomalias-comportamiento-vs-datos
description: anomalías = SOLO 5 reglas R1–R5 (reemplazo total 2026-08-05); classifyAnomaly ya no emite BEHAVIORAL
metadata:
  type: project
---

**Reemplazo total (2026-08-05, pedido del usuario):** una anomalía de comportamiento
se define **EXCLUSIVAMENTE** por estas 5 reglas. Se apagaron ruta/arranque inválido,
retroceso de secuencia y las viejas reglas de oro (G2 calada→preingreso, G3 salto de
hito, G5 sin movimiento Excel). El panel/comité lista SOLO estas.

Reglas en `src/etl-core/domain/goldenAnomalyRules.ts` (`GOLDEN_ANOMALY_REASONS`):
- **R1** `RIC_REINGRESO_RAPIDO_NO_PELLET` — salida Ric (EGRESO) → reingreso Ric (INGRESO/PREINGRESO) ≤ 1 h. No pellet.
- **R2** `SL_LUEGO_RIC_MISMO_DIA_NO_PELLET` — mismo día: SL_INGRESO primero y luego INGRESO/PREINGRESO Ric. No pellet.
- **R3** `RIC_SL_TRAMO_40M_6H` — EGRESO Ric → SL_INGRESO, banda [40 min, 6 h].
- **R4** `RUTA_BALANZA_PLAYA_C16_BALANZA` — BALANZA_INGRESO → PLAYA → CELDA16(_CARGA|_DESCARGA) → (PLAYA) → BALANZA(_EGRESO).
- **R5** `CARGA_LUEGO_DESCARGA` — punto de carga (CELDA16_CARGA/CARGA_S7/CARGA_S8) y luego descarga (VOLCABLE/CELDA16_DESCARGA/DESCARGA_S7/SL_DESCARGA).

R1/R2/R3 cruzan journeys de la misma patente (`platePoints` = `plateGoldenTimeline` del pipeline;
R2 necesita `day`, ya poblado en `buildGoldenTimelineFromJourney`). R4/R5 son de secuencia dentro del journey.

**Arquitectura:**
- `classifyAnomaly()` (`anomalyClassifier.ts`) YA NO emite `BEHAVIORAL`: solo `DATA_COVERAGE` (≤2 eventos / NO_EVALUABLE / INCOMPLETO) o `NONE`. Un ANOMALO de matriz/ejecutivo ya no es comportamiento.
- `applyGoldenAnomalyOverride()`: si hay hit R1–R5 → `BEHAVIORAL` (salvo que la base sea `EVENTOS_INSUFICIENTES`, que gana: sin evidencia mínima no hay comportamiento).
- Se cablea en `committeeClassification.ts::resolveCommitteeClassification` → columna `anomaly_kind`/`anomaly_kind_reason` de debug_matrix. **Fuente única** para UI y headless.
- Listado UI (`etlCircuitClassificationIndex.ts`): `isListedAnomalyCandidate` lista `anomalyKind === 'BEHAVIORAL'`. `isHardExcludedFromAnomalyList` se **limpió**: solo excluye flota registry (`excludeFromAnalytics`) y pellet en R1/R2 (el pellet solo se conoce tras stampear con Excel — tolvas 09–11 sin cámara). Ya NO excluye transile ni «de la vuelta» (esos vaciaban el panel y R4/R5 deben poder disparar sobre transile).
- `stampMissingExcelAnomalies` = **no-op** (G5 eliminada), firma intacta por los call sites de la UI.

**IMPORTANTE:** las corridas guardadas traen el `anomaly_kind` viejo en debug_matrix.
Las reglas nuevas solo aplican **re-corriendo el ETL** de cada ventana.
