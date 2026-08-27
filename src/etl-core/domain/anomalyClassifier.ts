/**
 * Clasificador único de anomalías (función pura, etl-core/domain).
 *
 * Motivación (2026-07-13): hoy la etiqueta "anómalo" se decide en TRES lugares
 * que pueden discrepar entre sí:
 *   1. `committeeClassification.ts` → `committee_group: 'ANOMALIAS'` (17 ramas)
 *   2. `resolveExecutiveCircuitDecision` → `executive_status: 'ANOMALO'`
 *   3. `resolveExecutiveBucket` → `executive_bucket: 'ANOMALO'`
 *
 * El problema concreto: journeys que son solo INCOMPLETO (pocos eventos) o
 * NO_EVALUABLE (falta cobertura de cámaras) terminan en el panel de "caminos
 * anómalos", inflando la cifra que ve el comité. Eso es un problema de DATOS,
 * no de COMPORTAMIENTO del camión.
 *
 * Esta función separa esos dos ejes de forma explícita y en un solo lugar.
 * Los tres clasificadores deben derivar de acá (migración incremental).
 */

/** Naturaleza de la anomalía: ¿la causó el camión o la falta de datos? */
export type AnomalyKind =
  /** No hay anomalía: el recorrido es válido o se dedujo. */
  | 'NONE'
  /** El camión hizo algo que no respeta la operación esperada. Cuenta para el comité. */
  | 'BEHAVIORAL'
  /** No se puede afirmar nada por falta de eventos/cobertura. NO es anomalía del camión. */
  | 'DATA_COVERAGE'

/**
 * Razón canónica y única.
 *
 * REEMPLAZO TOTAL (2026-08-05): las anomalías de comportamiento se definen SOLO
 * por las reglas de `goldenAnomalyRules.ts` (R1–R6). Ya no se emite comportamiento
 * desde el estado de matriz/ejecutivo ni desde alertas de ruta/arranque.
 */
export type AnomalyReason =
  // --- BEHAVIORAL (solo reglas R1–R6, ver GOLDEN_ANOMALY_REASONS) ---
  /** R1: salida Ricardone → reingreso Ricardone ≤ 1 h, no pellet. */
  | 'RIC_REINGRESO_RAPIDO_NO_PELLET'
  /** R2: mismo día San Lorenzo primero y luego Ricardone, no pellet. */
  | 'SL_LUEGO_RIC_MISMO_DIA_NO_PELLET'
  /** R3: egreso Ricardone → ingreso San Lorenzo entre 40 min y 6 h. */
  | 'RIC_SL_TRAMO_40M_6H'
  /** R4: Balanza ingreso → Playa 3 → Celda 16 → (Playa 3) → Balanza. */
  | 'RUTA_BALANZA_PLAYA_C16_BALANZA'
  /** R5: pasa por punto de carga y luego por plataforma de descarga. */
  | 'CARGA_LUEGO_DESCARGA'
  /** R6: egreso Ricardone → ingreso San Lorenzo en > 30 min (≤ 2 h) sin pasar por Calado SL. */
  | 'RIC_SL_MAS30M_SIN_CALADA_SL'
  // --- DATA_COVERAGE ---
  /** Muy pocos eventos útiles para evaluar (ruido / captura parcial). */
  | 'EVENTOS_INSUFICIENTES'
  /** Cobertura de cámaras insuficiente para pronunciarse. */
  | 'COBERTURA_INSUFICIENTE'
  /** Faltan puntos clave de la secuencia, pero sin contradicción de comportamiento. */
  | 'SECUENCIA_INCOMPLETA'
  // --- NONE ---
  | null

export type AnomalyVerdict = {
  kind: AnomalyKind
  reason: AnomalyReason
}

/** Estados de la matriz de circuitos (subconjunto usado acá). */
export type MatrixFinalStatusLike = 'COMPLETO' | 'INCOMPLETO' | 'DEDUCIDO' | 'ANOMALO' | string

/** Estados ejecutivos (subconjunto usado acá). */
export type ExecutiveStatusLike =
  | 'VALIDO'
  | 'PROBABLE'
  | 'INCOMPLETO'
  | 'ANOMALO'
  | 'NO_EVALUABLE'
  | 'NO_DIFERENCIABLE'
  | string

/**
 * Señales ya calculadas por el pipeline. Todas provienen de funciones existentes
 * (no se recalcula nada): matriz de circuitos, decisión ejecutiva y alertas.
 */
export type ClassifyAnomalyInput = {
  /** `classifyJourneyAgainstCircuitMatrix(...).finalStatus`. */
  matrixFinalStatus: MatrixFinalStatusLike
  /** `resolveExecutiveCircuitDecision(...).executiveStatus`. Ya separa NO_EVALUABLE. */
  executiveStatus: ExecutiveStatusLike
  /** Eventos frontales útiles (excluye cámaras traseras). */
  frontEventCount: number
}

/** Debajo de este umbral no hay evidencia suficiente para evaluar comportamiento. */
export const ANOMALY_MIN_FRONT_EVENTS = 2

/**
 * Verdicto base de datos vs. NONE.
 *
 * REEMPLAZO TOTAL (2026-08-05): esta función YA NO produce `BEHAVIORAL`. El
 * comportamiento anómalo lo aportan exclusivamente las reglas R1–R5 vía
 * `applyGoldenAnomalyOverride`. Acá solo se decide si el journey es un hueco de
 * datos (`DATA_COVERAGE`) — que lo saca del análisis del comité — o `NONE`.
 */
export function classifyAnomaly(input: ClassifyAnomalyInput): AnomalyVerdict {
  const matrix = normUpper(input.matrixFinalStatus)
  const executive = normUpper(input.executiveStatus)

  // 1. Sin eventos suficientes: no se puede afirmar comportamiento. Es dato.
  if (input.frontEventCount <= ANOMALY_MIN_FRONT_EVENTS) {
    return { kind: 'DATA_COVERAGE', reason: 'EVENTOS_INSUFICIENTES' }
  }

  // 2. La decisión ejecutiva ya declaró que no se puede evaluar por cobertura.
  if (executive === 'NO_EVALUABLE') {
    return { kind: 'DATA_COVERAGE', reason: 'COBERTURA_INSUFICIENTE' }
  }

  // 3. Incompleto sin contradicción = hueco de datos, NO anomalía de comportamiento.
  if (matrix === 'INCOMPLETO' || executive === 'INCOMPLETO') {
    return { kind: 'DATA_COVERAGE', reason: 'SECUENCIA_INCOMPLETA' }
  }

  // 4. Válido, probable o deducido. Un ANOMALO de secuencia ya NO es comportamiento.
  return { kind: 'NONE', reason: null }
}

/** True si el verdicto debe contar como anomalía real del camión (panel comité). */
export function isBehavioralAnomaly(verdict: AnomalyVerdict): boolean {
  return verdict.kind === 'BEHAVIORAL'
}

/**
 * Las reglas R1–R6 son la ÚNICA fuente de comportamiento anómalo: si hay hit,
 * el verdicto pasa a BEHAVIORAL con esa razón.
 *
 * Excepción (evidencia mínima): NO pisan `EVENTOS_INSUFICIENTES`. Con ≤2 eventos
 * frontales no hay con qué afirmar comportamiento; sin este guardia un journey de
 * 2 tomas entraría al panel de anomalías, que es lo que el eje comportamiento/datos
 * vino a separar.
 */
export function applyGoldenAnomalyOverride(
  base: AnomalyVerdict,
  goldenReason: AnomalyReason | null | undefined
): AnomalyVerdict {
  if (!goldenReason) return base
  if (base.kind === 'DATA_COVERAGE' && base.reason === 'EVENTOS_INSUFICIENTES') {
    return base
  }
  return { kind: 'BEHAVIORAL', reason: goldenReason }
}

function normUpper(v: unknown): string {
  return typeof v === 'string' ? v.trim().toUpperCase() : ''
}
