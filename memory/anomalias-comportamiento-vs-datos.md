---
name: anomalias-comportamiento-vs-datos
description: classifyAnomaly() + reglas de oro; dual circuito R* + BEHAVIORAL
metadata:
  type: project
---

La etiqueta "anómalo" se decide en **tres** clasificadores que pueden discrepar:
1. `committeeClassification.ts` → `committee_group: 'ANOMALIAS'` (17 ramas) — lo que ve el comité.
2. `resolveExecutiveCircuitDecision` → `executive_status: 'ANOMALO'` — alimenta el KPI `anomalous_journeys` (ya separa `NO_EVALUABLE`).
3. `resolveExecutiveBucket` → `executive_bucket: 'ANOMALO'` — secundario/CSV.

**Problema histórico:** journeys `INCOMPLETO` / `NO_EVALUABLE` (faltan cámaras) caían en anomalías del comité. Eso es DATOS, no COMPORTAMIENTO.

**Hecho 2026-07-14:** `classifyAnomaly()` en `src/etl-core/domain/anomalyClassifier.ts` → `{ kind: BEHAVIORAL | DATA_COVERAGE | NONE, reason }`. Panel lista solo `BEHAVIORAL`.

**Reglas de oro (2026-07-14+):** `src/etl-core/domain/goldenAnomalyRules.ts`
- G1 `SL_RIC_VUELTA_RAPIDA_NO_PELLET` — SL→Ric ≤30 min y no pellet (R30–R32)
- G2 `REGRESION_CALADA_PREINGRESO` — Calada→Preingreso <20 min
- G3 `SKIP_PUNTO_LAPSO_EXTREMO` — falta hito esperado + gap flanqueante >4 h
- G4 `RIC_SL_DEMORA` — Ric EGRESO→SL_INGRESO >30 min
- G5 `SIN_MOVIMIENTO_EXCEL` — entrada+salida (Ric o SL) y patente+**día de salida** ausente de Movimientos; stamped en UI v1 (`stampMissingExcelAnomalies`). Excel se cruza por horario de salida (ingreso D / fin madrugada D+1 → Excel del día D+1). **No dispara** si ya hay match Excel en `committee_reason` (`EXCEL_PLATAFORMA` / `EXTERNAL_MATCH_*`) ni si faltan `first/last_event_at`.

Excel «De la vuelta»=SI → excluida de anomalías / sospechosos SL→Ric.
