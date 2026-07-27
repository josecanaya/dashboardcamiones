/**
 * Veredicto único de circuito.
 *
 * Problema que resuelve: hoy conviven cinco taxonomías de estado casi sinónimas
 * (FinalCircuitStatus, ExecutiveBucket, JourneyMatrixFinalStatus, ExecutiveCircuitStatus,
 * SequenceFit), cada una calculada por su cuenta y escritas lado a lado en la misma fila
 * de `final_circuits`. Un journey puede quedar `circuito_probable` + `COMPLETO` + `PROBABLE`
 * a la vez, y cada tabla reporta una distinta. Ahí nacen los "criterios que se contradicen".
 *
 * Regla: se clasifica UNA vez y se proyecta. Las funciones `to*` de este módulo son
 * presentación pura — renombran, nunca vuelven a decidir.
 *
 * Módulo puro: sin React, sin DOM, sin imports a features/pages/services.
 */

/** Estado único. Superset de las taxonomías previas, sin sinónimos. */
export type CircuitStatus =
  | 'COMPLETO'
  | 'DEDUCIDO'
  | 'PROBABLE'
  | 'INCOMPLETO'
  | 'ANOMALO'
  | 'NO_EVALUABLE'
  | 'NO_DIFERENCIABLE'

/** Ajuste de la secuencia observada contra la esperada. Es un DATO, no un estado paralelo. */
export type SequenceFit = 'EXACT' | 'VARIANT' | 'DEDUCED' | 'PARTIAL' | 'BROKEN'

/**
 * Evidencia que sostiene el veredicto.
 * `null` en los booleanos = no evaluable (la corrida no lo midió). Nunca colapsar a `false`:
 * ausencia de dato no es un negativo medido.
 */
export type CircuitEvidence = {
  expectedPoints: number
  matchedPoints: number
  missingPoints: readonly string[]
  hasOperationalEntry: boolean | null
  hasOperationalExit: boolean | null
}

export type CircuitVerdict = {
  circuitCode: string
  status: CircuitStatus
  reason: string
  /** 0..1 */
  confidence: number
  sequenceFit: SequenceFit
  evidence: CircuitEvidence
}

/** Vista técnica de matriz y bucket ejecutivo legacy comparten este conjunto de 4 valores. */
export type MatrixFinalStatusView = 'COMPLETO' | 'DEDUCIDO' | 'INCOMPLETO' | 'ANOMALO'

/** Vista de comité (v10). */
export type CommitteeGroupView = 'COMPLETOS' | 'VARIACIONES_OPERATIVAS' | 'ANOMALIAS'

/**
 * Proyección técnica: colapsa el estado único a los 4 valores de matriz.
 * PROBABLE/NO_EVALUABLE/NO_DIFERENCIABLE no tienen valor propio en esta vista y caen en
 * ANOMALO, igual que documenta ETL_POWER_BI_CONTRACT.md.
 */
export function toMatrixFinalStatus(status: CircuitStatus): MatrixFinalStatusView {
  switch (status) {
    case 'COMPLETO':
      return 'COMPLETO'
    case 'DEDUCIDO':
      return 'DEDUCIDO'
    case 'INCOMPLETO':
      return 'INCOMPLETO'
    default:
      return 'ANOMALO'
  }
}

/**
 * Bucket ejecutivo (columna legacy). Comparte conjunto de valores con la vista de matriz,
 * por eso se deriva de la misma proyección: dos nombres para un solo criterio.
 */
export function toExecutiveBucket(status: CircuitStatus): MatrixFinalStatusView {
  return toMatrixFinalStatus(status)
}

/** Proyección de comité: DEDUCIDO suma dentro de COMPLETOS (ver contrato Power BI). */
export function toCommitteeGroup(
  status: CircuitStatus,
  hasContemplatedVariation = false
): CommitteeGroupView {
  if (status === 'COMPLETO' || status === 'DEDUCIDO') return 'COMPLETOS'
  if (hasContemplatedVariation) return 'VARIACIONES_OPERATIVAS'
  return 'ANOMALIAS'
}

/** Un veredicto es reconstruible si aporta un circuito utilizable para KPIs. */
export function isReconstructable(verdict: CircuitVerdict): boolean {
  return (
    verdict.status === 'COMPLETO' ||
    verdict.status === 'DEDUCIDO' ||
    verdict.status === 'PROBABLE'
  )
}

/** Foto de las taxonomías paralelas tal como se escriben hoy en `final_circuits`. */
export type TaxonomySnapshot = {
  /** FinalCircuitStatus, p. ej. `circuito_completo` */
  finalStatus: string
  /** JourneyMatrixFinalStatus, p. ej. `COMPLETO` */
  matrixFinalStatus: string
  /** ExecutiveBucket legacy, p. ej. `COMPLETO` */
  executiveBucket: string
  /** ExecutiveCircuitStatus, p. ej. `VALIDO` */
  executiveStatus: string
}

/**
 * Detecta contradicciones REALES entre las taxonomías paralelas de una misma fila.
 *
 * Conservador a propósito: solo marca combinaciones que no pueden ser ciertas a la vez.
 * Mientras el pipeline siga calculándolas por separado, esto es el detector de la clase de
 * bug; cuando todo derive de CircuitVerdict, debe devolver siempre lista vacía.
 */
export function detectTaxonomyContradictions(snapshot: TaxonomySnapshot): string[] {
  const issues: string[] = []
  const { finalStatus, matrixFinalStatus, executiveBucket, executiveStatus } = snapshot

  if (matrixFinalStatus === 'COMPLETO' && (executiveStatus === 'INCOMPLETO' || executiveStatus === 'ANOMALO')) {
    issues.push(`matrix_final_status=COMPLETO pero executive_status=${executiveStatus}`)
  }
  if (finalStatus === 'descartado' && matrixFinalStatus === 'COMPLETO') {
    issues.push('final_status=descartado pero matrix_final_status=COMPLETO')
  }
  if (finalStatus === 'circuito_completo' && executiveStatus === 'NO_EVALUABLE') {
    issues.push('final_status=circuito_completo pero executive_status=NO_EVALUABLE')
  }
  if (finalStatus === 'incompleto_revision' && matrixFinalStatus === 'COMPLETO') {
    issues.push('final_status=incompleto_revision pero matrix_final_status=COMPLETO')
  }
  // executive_bucket puede ENDURECER el veredicto de matriz (p. ej. una alerta
  // INVALID_ROUTE lo lleva a ANOMALO aunque la secuencia cerrara): eso es un
  // refinamiento legítimo. Lo que no puede hacer es ABLANDARLO — declarar completo un
  // viaje que la matriz dio por incompleto o anómalo.
  if (isSofterThan(executiveBucket, matrixFinalStatus)) {
    issues.push(
      `executive_bucket=${executiveBucket} ablanda matrix_final_status=${matrixFinalStatus}`
    )
  }

  return issues
}

/** Severidad relativa de la vista de 4 valores (mayor = peor). */
const SEVERITY: Record<string, number> = {
  COMPLETO: 0,
  DEDUCIDO: 1,
  INCOMPLETO: 2,
  ANOMALO: 3,
}

/** true si `bucket` afirma un estado MEJOR que el de la matriz (no permitido). */
function isSofterThan(bucket: string, matrix: string): boolean {
  const b = SEVERITY[bucket]
  const m = SEVERITY[matrix]
  if (b === undefined || m === undefined) return false
  return b < m
}

export type TaxonomyCoherenceReport = {
  rowsChecked: number
  rowsWithContradiction: number
  issueCounts: Record<string, number>
}

/** Agrega contradicciones sobre todas las filas de una corrida (para stats del run). */
export function buildTaxonomyCoherenceReport(
  snapshots: readonly TaxonomySnapshot[]
): TaxonomyCoherenceReport {
  const issueCounts: Record<string, number> = {}
  let rowsWithContradiction = 0

  for (const snapshot of snapshots) {
    const issues = detectTaxonomyContradictions(snapshot)
    if (issues.length > 0) rowsWithContradiction++
    for (const issue of issues) {
      // Normaliza el valor concreto para poder agrupar por tipo de contradicción.
      const key = issue.replace(/=[A-Za-z_]+/g, '=*')
      issueCounts[key] = (issueCounts[key] ?? 0) + 1
    }
  }

  return { rowsChecked: snapshots.length, rowsWithContradiction, issueCounts }
}
