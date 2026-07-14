---
name: anomalias-comportamiento-vs-datos
description: classifyAnomaly() separa anomalía real del camión de hueco de datos; hay 3 clasificadores paralelos
metadata:
  type: project
---

La etiqueta "anómalo" se decide hoy en **tres** clasificadores que pueden discrepar:
1. `committeeClassification.ts` → `committee_group: 'ANOMALIAS'` (17 ramas) — lo que ve el comité.
2. `resolveExecutiveCircuitDecision` → `executive_status: 'ANOMALO'` — alimenta el KPI `anomalous_journeys` (ya separa `NO_EVALUABLE`).
3. `resolveExecutiveBucket` → `executive_bucket: 'ANOMALO'` — secundario/CSV.

**Problema:** journeys `INCOMPLETO` (pocos eventos) o `NO_EVALUABLE` (falta cobertura de cámaras) caían igual en `committee_group=ANOMALIAS`, inflando la cifra. Eso es problema de DATOS, no de COMPORTAMIENTO.

**Hecho 2026-07-14:** se creó `classifyAnomaly()` puro en `src/etl-core/domain/anomalyClassifier.ts` → `{ kind: BEHAVIORAL | DATA_COVERAGE | NONE, reason }`. Decisión del usuario: unificar en función pura y sacar "no evaluable por datos" de anómalo, pero por ahora **marcar sin mover** (columna `anomaly_kind` en `final_circuits`, sin cambiar `committee_group`). Cableado solo en el clasificador del comité (`resolveCommitteeClassification` es ahora wrapper del core). Golden master: conteos intactos, solo re-baseline del hash de `final_circuits`.

**Pendiente:** cablear los otros dos clasificadores y decidir si el KPI del comité pasa a contar solo `BEHAVIORAL`. Relacionado con [[etl-refactor-plan]] (Fase 3, catálogo único).
