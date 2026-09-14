---
name: anomalias-comportamiento-vs-datos
description: anomalías = reglas R1/R2/R4/R5/R6 (R3 retirada, R2 redefinida 2026-09-04); classifyAnomaly ya no emite BEHAVIORAL
metadata:
  type: project
---

**Reemplazo total (2026-08-05, pedido del usuario):** una anomalía de comportamiento
se define **EXCLUSIVAMENTE** por estas reglas. Se apagaron ruta/arranque inválido,
retroceso de secuencia y las viejas reglas de oro (G2 calada→preingreso, G3 salto de
hito, G5 sin movimiento Excel). El panel/comité lista SOLO estas.

**Curación del set (2026-09-04, pedido del usuario):**
- Se retira **R3** (Ric→SL 40 min–6 h): quedó **absorbida por R6** (el caso que importa
  es el cruce a puerto sin calado). Se borraron `detectRicToSlBridgeWindow` y sus constantes.
- **R2 se REDEFINE** (antes «SL luego Ric mismo día ≤ 6 h», ahora **retorno SL→Ric < 2 h**,
  no pellet). Se mide del **último** registro en San Lorenzo al **primer** registro en
  Ricardone; robusto a fallo de cámara: cuenta CUALQUIER evento `siteId==='ricardone'`
  (ingreso/preingreso/calada/…) como retorno. Detector `detectSlThenRicReturn`, constante
  `SL_RIC_RETURN_MAX_MS = 2 h`. **R2 se evalúa ANTES que R1** para que el retorno desde el
  puerto quede etiquetado R2 y no lo trague el reingreso genérico R1.

Set vigente: **R1, R2, R4, R5, R6**. Reglas en `src/etl-core/domain/goldenAnomalyRules.ts` (`GOLDEN_ANOMALY_REASONS`):
- **R1** `RIC_REINGRESO_RAPIDO_NO_PELLET` — salida Ric (EGRESO) → reingreso Ric (INGRESO/PREINGRESO) ≤ 1 h. No pellet.
- **R2** `SL_LUEGO_RIC_RETORNO_2H_NO_PELLET` — último registro en San Lorenzo → primer registro en Ricardone < 2 h. No pellet.
- **R4** `RUTA_BALANZA_PLAYA_C16_BALANZA` — BALANZA_INGRESO → PLAYA → CELDA16(_CARGA|_DESCARGA) → (PLAYA) → BALANZA(_EGRESO).
- **R5** `CARGA_LUEGO_DESCARGA` — punto de carga (CELDA16_CARGA/CARGA_S7/CARGA_S8) y luego descarga (VOLCABLE/CELDA16_DESCARGA/DESCARGA_S7/SL_DESCARGA).
- **R6** `RIC_SL_MAS30M_SIN_CALADA_SL` — EGRESO Ric → SL_INGRESO en (30 min, 2 h] y SIN `SL_CALADA` en esa visita.

R1/R2/R6 cruzan journeys de la misma patente (`platePoints` = `plateGoldenTimeline` del pipeline).
R4/R5 son de secuencia dentro del journey. Orden en `evaluateGoldenAnomalyRules`: **R2 → R1 → R6 → R4 → R5**.

**Subgrupos de R2 (implementados 2026-09-04, corregidos tras validar con datos):** cada camión cae
en UN subgrupo (prioridad de asignación **a → b → c**), TODOS no pellet. Sub-motivos propios en
`anomaly_kind_reason` (no reglas aparte; la UI los agrupa bajo la tarjeta R2):
- **R2-a** `SL_RIC_2H_ERROR_DESTINO_NO_PELLET` — San Lorenzo fue su PRIMER destino: NO hay evento en Ricardone antes del SL que dispara el retorno. (El usuario confirmó que este caso existe y es importante.)
- **R2-b** `SL_RIC_2H_CICLO_COMPLETO_NO_PELLET` — hubo Ric antes (shuttle) y el viaje de retorno completó circuito (ejecutivo VÁLIDO o matriz COMPLETO). Acá caen los shuttle Ric↔SL con R7 completo de ida y vuelta.
- **R2-c** `SL_RIC_2H_SIN_CIRCUITO_NO_PELLET` — el resto: volvieron del puerto a Ricardone sin completar circuito.

**Gotcha estructural (bug corregido):** el hit de R2 se adjudica SOLO al journey de retorno (el que
CONTIENE el evento RIC* de regreso), vía `opts.journeyPoints` en `detectSlThenRicReturn`. Sin esto,
como R2 corre sobre `platePoints` (cross-journey), el mismo retorno se pegaba a TODOS los journeys de
la patente y con `circuitCompleted` per-journey el shuttle se dispersaba entre subgrupos (aparecía en
R2-a en vez de R2-b). `slWasFirstDestination` = no hay evento `ricardone` con t < SL* (último SL antes
del retorno). `circuitCompleted` viene de `committeeClassification.ts`
(`executive_status==='VALIDO' || matrixFinalStatus==='COMPLETO'`).
UI: `R2_SUBGROUPS` + `buildGoldenGroups` (agrupa por `parentRuleReason`) + secciones por subgrupo en
el detalle; `TruckGrid`/`TruckCard` reusables.

**UI Seguridad (2026-09-04):** cada regla tiene ficha de 3 partes en `SeguridadTab.tsx` (`GOLDEN_RULES`
+ `RuleFacet`): **Qué mira · Cuándo se incumple · Por qué importa**. El detalle del grupo la renderiza
en vez del texto de una línea. Los tags de reglas retiradas (R3, o el R2 viejo) de corridas guardadas
caen al grupo «Otras». **R2 redefinida y las reglas nuevas solo aplican re-corriendo el ETL** de cada ventana.

**Arquitectura:**
- `classifyAnomaly()` (`anomalyClassifier.ts`) YA NO emite `BEHAVIORAL`: solo `DATA_COVERAGE` (≤2 eventos / NO_EVALUABLE / INCOMPLETO) o `NONE`. Un ANOMALO de matriz/ejecutivo ya no es comportamiento.
- `applyGoldenAnomalyOverride()`: si hay hit R1–R5 → `BEHAVIORAL` (salvo que la base sea `EVENTOS_INSUFICIENTES`, que gana: sin evidencia mínima no hay comportamiento).
- Se cablea en `committeeClassification.ts::resolveCommitteeClassification` → columna `anomaly_kind`/`anomaly_kind_reason` de debug_matrix. **Fuente única** para UI y headless.
- Listado UI (`etlCircuitClassificationIndex.ts`): `isListedAnomalyCandidate` lista `anomalyKind === 'BEHAVIORAL'`. `isHardExcludedFromAnomalyList` se **limpió**: solo excluye flota registry (`excludeFromAnalytics`) y pellet en R1/R2 (el pellet solo se conoce tras stampear con Excel — tolvas 09–11 sin cámara). Ya NO excluye transile ni «de la vuelta» (esos vaciaban el panel y R4/R5 deben poder disparar sobre transile).
- `stampMissingExcelAnomalies` = **no-op** (G5 eliminada), firma intacta por los call sites de la UI.

**IMPORTANTE:** las corridas guardadas traen el `anomaly_kind` viejo en debug_matrix.
Las reglas nuevas solo aplican **re-corriendo el ETL** de cada ventana.
