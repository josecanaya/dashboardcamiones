import { describe, expect, it } from 'vitest'
import {
  buildTaxonomyCoherenceReport,
  detectTaxonomyContradictions,
  isReconstructable,
  toCommitteeGroup,
  toExecutiveBucket,
  toMatrixFinalStatus,
  type CircuitStatus,
  type CircuitVerdict,
} from './circuitVerdict'

const ALL_STATUSES: CircuitStatus[] = [
  'COMPLETO',
  'DEDUCIDO',
  'PROBABLE',
  'INCOMPLETO',
  'ANOMALO',
  'NO_EVALUABLE',
  'NO_DIFERENCIABLE',
]

function verdict(status: CircuitStatus): CircuitVerdict {
  return {
    circuitCode: 'R5',
    status,
    reason: 'test',
    confidence: 1,
    sequenceFit: 'EXACT',
    evidence: {
      expectedPoints: 9,
      matchedPoints: 9,
      missingPoints: [],
      hasOperationalEntry: true,
      hasOperationalExit: true,
    },
  }
}

describe('circuitVerdict — proyecciones puras', () => {
  it('la vista de matriz siempre cae en los 4 valores permitidos', () => {
    for (const status of ALL_STATUSES) {
      expect(['COMPLETO', 'DEDUCIDO', 'INCOMPLETO', 'ANOMALO']).toContain(toMatrixFinalStatus(status))
    }
  })

  it('executive_bucket y matrix_final_status son la misma proyección (no dos criterios)', () => {
    for (const status of ALL_STATUSES) {
      expect(toExecutiveBucket(status)).toBe(toMatrixFinalStatus(status))
    }
  })

  it('PROBABLE / NO_EVALUABLE / NO_DIFERENCIABLE colapsan en ANOMALO en la vista técnica', () => {
    expect(toMatrixFinalStatus('PROBABLE')).toBe('ANOMALO')
    expect(toMatrixFinalStatus('NO_EVALUABLE')).toBe('ANOMALO')
    expect(toMatrixFinalStatus('NO_DIFERENCIABLE')).toBe('ANOMALO')
  })

  it('DEDUCIDO suma dentro de COMPLETOS en la vista de comité', () => {
    expect(toCommitteeGroup('COMPLETO')).toBe('COMPLETOS')
    expect(toCommitteeGroup('DEDUCIDO')).toBe('COMPLETOS')
    expect(toCommitteeGroup('INCOMPLETO')).toBe('ANOMALIAS')
    expect(toCommitteeGroup('INCOMPLETO', true)).toBe('VARIACIONES_OPERATIVAS')
  })

  it('las proyecciones son puras: mismo estado, mismo resultado', () => {
    for (const status of ALL_STATUSES) {
      expect(toMatrixFinalStatus(status)).toBe(toMatrixFinalStatus(status))
      expect(toCommitteeGroup(status)).toBe(toCommitteeGroup(status))
    }
  })

  it('isReconstructable solo acepta circuitos utilizables para KPI', () => {
    expect(isReconstructable(verdict('COMPLETO'))).toBe(true)
    expect(isReconstructable(verdict('DEDUCIDO'))).toBe(true)
    expect(isReconstructable(verdict('PROBABLE'))).toBe(true)
    expect(isReconstructable(verdict('INCOMPLETO'))).toBe(false)
    expect(isReconstructable(verdict('ANOMALO'))).toBe(false)
    expect(isReconstructable(verdict('NO_EVALUABLE'))).toBe(false)
  })

  it('la evidencia distingue no-evaluable (null) de negativo medido (false)', () => {
    const v = verdict('INCOMPLETO')
    const noEvaluable = { ...v, evidence: { ...v.evidence, hasOperationalEntry: null } }
    const medido = { ...v, evidence: { ...v.evidence, hasOperationalEntry: false } }
    expect(noEvaluable.evidence.hasOperationalEntry).toBeNull()
    expect(medido.evidence.hasOperationalEntry).toBe(false)
    expect(noEvaluable.evidence.hasOperationalEntry).not.toBe(medido.evidence.hasOperationalEntry)
  })
})

describe('circuitVerdict — detección de contradicciones', () => {
  it('no marca nada cuando las taxonomías coinciden', () => {
    expect(
      detectTaxonomyContradictions({
        finalStatus: 'circuito_completo',
        matrixFinalStatus: 'COMPLETO',
        executiveBucket: 'COMPLETO',
        executiveStatus: 'VALIDO',
      })
    ).toEqual([])
  })

  it('marca COMPLETO en matriz contra INCOMPLETO ejecutivo', () => {
    const issues = detectTaxonomyContradictions({
      finalStatus: 'circuito_completo',
      matrixFinalStatus: 'COMPLETO',
      executiveBucket: 'COMPLETO',
      executiveStatus: 'INCOMPLETO',
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('executive_status=INCOMPLETO')
  })

  it('marca descartado contra COMPLETO', () => {
    const issues = detectTaxonomyContradictions({
      finalStatus: 'descartado',
      matrixFinalStatus: 'COMPLETO',
      executiveBucket: 'COMPLETO',
      executiveStatus: 'VALIDO',
    })
    expect(issues.some((i) => i.includes('descartado'))).toBe(true)
  })

  it('marca cuando el bucket ABLANDA el veredicto de matriz', () => {
    const issues = detectTaxonomyContradictions({
      finalStatus: 'circuito_probable',
      matrixFinalStatus: 'ANOMALO',
      executiveBucket: 'COMPLETO',
      executiveStatus: 'PROBABLE',
    })
    expect(issues.some((i) => i.includes('ablanda'))).toBe(true)
  })

  it('NO marca cuando el bucket endurece por alerta operativa (refinamiento legítimo)', () => {
    // matriz cierra la secuencia, pero una alerta INVALID_ROUTE lo lleva a ANOMALO.
    const issues = detectTaxonomyContradictions({
      finalStatus: 'circuito_completo',
      matrixFinalStatus: 'COMPLETO',
      executiveBucket: 'ANOMALO',
      executiveStatus: 'VALIDO',
    })
    expect(issues.filter((i) => i.includes('ablanda'))).toEqual([])
  })

  it('DEDUCIDO sobre COMPLETO endurece; COMPLETO sobre DEDUCIDO ablanda', () => {
    const endurece = detectTaxonomyContradictions({
      finalStatus: 'n/a',
      matrixFinalStatus: 'COMPLETO',
      executiveBucket: 'DEDUCIDO',
      executiveStatus: 'VALIDO',
    })
    expect(endurece.filter((i) => i.includes('ablanda'))).toEqual([])

    const ablanda = detectTaxonomyContradictions({
      finalStatus: 'n/a',
      matrixFinalStatus: 'DEDUCIDO',
      executiveBucket: 'COMPLETO',
      executiveStatus: 'VALIDO',
    })
    expect(ablanda.some((i) => i.includes('ablanda'))).toBe(true)
  })

  it('agrega por tipo de contradicción y cuenta filas afectadas', () => {
    const report = buildTaxonomyCoherenceReport([
      {
        finalStatus: 'circuito_completo',
        matrixFinalStatus: 'COMPLETO',
        executiveBucket: 'COMPLETO',
        executiveStatus: 'VALIDO',
      },
      {
        finalStatus: 'circuito_completo',
        matrixFinalStatus: 'COMPLETO',
        executiveBucket: 'COMPLETO',
        executiveStatus: 'ANOMALO',
      },
      {
        finalStatus: 'circuito_completo',
        matrixFinalStatus: 'COMPLETO',
        executiveBucket: 'COMPLETO',
        executiveStatus: 'INCOMPLETO',
      },
    ])
    expect(report.rowsChecked).toBe(3)
    expect(report.rowsWithContradiction).toBe(2)
    // Las dos contradicciones son del mismo tipo tras normalizar el valor concreto.
    expect(Object.values(report.issueCounts)).toContain(2)
  })

  it('un veredicto único no puede contradecirse consigo mismo', () => {
    for (const status of ALL_STATUSES) {
      const projected = toMatrixFinalStatus(status)
      const issues = detectTaxonomyContradictions({
        finalStatus: 'n/a',
        matrixFinalStatus: projected,
        executiveBucket: toExecutiveBucket(status),
        executiveStatus: 'VALIDO',
      })
      const bucketMismatch = issues.filter((i) => i.includes('executive_bucket'))
      expect(bucketMismatch, `status ${status}`).toEqual([])
    }
  })
})
