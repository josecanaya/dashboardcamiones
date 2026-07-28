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

/** Razón canónica y única (reemplaza los enums dispersos por clasificador). */
export type AnomalyReason =
  // --- BEHAVIORAL ---
  /** Alerta Truckflow INVALID_ROUTE: ruta inválida durante el viaje. */
  | 'RUTA_INVALIDA'
  /** Alerta Truckflow INVALID_START_JOURNEY: arranque en sector no habilitado. */
  | 'ARRANQUE_INVALIDO'
  /** La secuencia observada retrocede / contradice el circuito esperado. */
  | 'RETROCESO_SECUENCIA'
  /** Regla de oro G1: SL→Ric ≤30 min sin pellet. */
  | 'SL_RIC_VUELTA_RAPIDA_NO_PELLET'
  /** Regla de oro G2: Calada→Preingreso <20 min. */
  | 'REGRESION_CALADA_PREINGRESO'
  /** Regla de oro G3: skip de hito + lapso extremo entre flanqueantes. */
  | 'SKIP_PUNTO_LAPSO_EXTREMO'
  /** Regla de oro G4: Ric→SL >30 min. */
  | 'RIC_SL_DEMORA'
  /** Regla de oro G5: entrada+salida en planta pero no figura en Movimientos Excel (patente+día). */
  | 'SIN_MOVIMIENTO_EXCEL'
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
  /** Alerta operativa INVALID_ROUTE presente en el viaje. */
  hasInvalidRouteOperationalAlert: boolean
  /** Alerta operativa INVALID_START_JOURNEY presente en el viaje. */
  hasInvalidJourneyStartOperationalAlert: boolean
  /** Eventos frontales útiles (excluye cámaras traseras). */
  frontEventCount: number
}

/** Debajo de este umbral no hay evidencia suficiente para evaluar comportamiento. */
export const ANOMALY_MIN_FRONT_EVENTS = 2

/**
 * Verdicto único de anomalía. Orden de prioridad pensado para que una causa de
 * comportamiento (ruta/arranque inválido, retroceso) domine sobre un hueco de datos,
 * pero un dato insuficiente NUNCA se reporte como anomalía de comportamiento.
 */
export function classifyAnomaly(input: ClassifyAnomalyInput): AnomalyVerdict {
  const matrix = normUpper(input.matrixFinalStatus)
  const executive = normUpper(input.executiveStatus)

  // 1. Alertas operativas duras = comportamiento inequívoco (aunque falten cámaras).
  if (input.hasInvalidRouteOperationalAlert) {
    return { kind: 'BEHAVIORAL', reason: 'RUTA_INVALIDA' }
  }
  if (input.hasInvalidJourneyStartOperationalAlert) {
    return { kind: 'BEHAVIORAL', reason: 'ARRANQUE_INVALIDO' }
  }

  // 2. Sin eventos suficientes: no se puede afirmar comportamiento. Es dato.
  if (input.frontEventCount <= ANOMALY_MIN_FRONT_EVENTS) {
    return { kind: 'DATA_COVERAGE', reason: 'EVENTOS_INSUFICIENTES' }
  }

  // 3. La decisión ejecutiva ya declaró que no se puede evaluar por cobertura.
  if (executive === 'NO_EVALUABLE') {
    return { kind: 'DATA_COVERAGE', reason: 'COBERTURA_INSUFICIENTE' }
  }

  // 4. Retroceso / contradicción de secuencia = comportamiento (con cobertura ok).
  if (matrix === 'ANOMALO' || executive === 'ANOMALO') {
    return { kind: 'BEHAVIORAL', reason: 'RETROCESO_SECUENCIA' }
  }

  // 5. Incompleto sin contradicción = hueco de datos, NO anomalía de comportamiento.
  if (matrix === 'INCOMPLETO' || executive === 'INCOMPLETO') {
    return { kind: 'DATA_COVERAGE', reason: 'SECUENCIA_INCOMPLETA' }
  }

  // 6. Válido, probable o deducido.
  return { kind: 'NONE', reason: null }
}

/** True si el verdicto debe contar como anomalía real del camión (panel comité). */
export function isBehavioralAnomaly(verdict: AnomalyVerdict): boolean {
  return verdict.kind === 'BEHAVIORAL'
}

/**
 * Las reglas de oro (comportamiento temporal) ganan sobre NONE / DATA_COVERAGE.
 * No pisan alertas duras ya BEHAVIORAL (ruta/arranque inválido).
 *
 * Excepción (evidencia mínima): NO pisan `EVENTOS_INSUFICIENTES`. Con ≤2 eventos
 * frontales no hay con qué afirmar comportamiento — una regla como G3 («faltó un
 * hito y el lapso entre flanqueantes es extremo») se dispara sola cuando lo único
 * que pasa es que faltan cámaras. Eso metía journeys de 2 tomas en el panel de
 * anomalías, que es justo lo que el eje comportamiento/datos vino a separar.
 */
export function applyGoldenAnomalyOverride(
  base: AnomalyVerdict,
  goldenReason: AnomalyReason | null | undefined
): AnomalyVerdict {
  if (!goldenReason) return base
  if (
    base.kind === 'BEHAVIORAL' &&
    (base.reason === 'RUTA_INVALIDA' || base.reason === 'ARRANQUE_INVALIDO')
  ) {
    return base
  }
  if (base.kind === 'DATA_COVERAGE' && base.reason === 'EVENTOS_INSUFICIENTES') {
    return base
  }
  return { kind: 'BEHAVIORAL', reason: goldenReason }
}

function normUpper(v: unknown): string {
  return typeof v === 'string' ? v.trim().toUpperCase() : ''
}
