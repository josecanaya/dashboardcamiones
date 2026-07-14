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

**Doctrina dual:** el journey **conserva** su circuito R*; las reglas de oro solo setean `anomaly_kind=BEHAVIORAL` (vía `applyGoldenAnomalyOverride` en `resolveCommitteeClassification`). Cross-tab muestra columna «Anom. oro» bajo el mismo R*; el panel de anomalías lista esos journeys con circuito + reason.

**No confundir:** cobertura LPR insuficiente → `DATA_COVERAGE` (incompletos). Reglas de oro → comportamiento aunque el circuito esté completo.
