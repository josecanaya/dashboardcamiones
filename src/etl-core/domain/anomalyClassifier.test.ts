import { describe, it, expect } from 'vitest'
import {
  applyGoldenAnomalyOverride,
  classifyAnomaly,
  isBehavioralAnomaly,
  type ClassifyAnomalyInput,
} from './anomalyClassifier'

const base: ClassifyAnomalyInput = {
  matrixFinalStatus: 'COMPLETO',
  executiveStatus: 'VALIDO',
  frontEventCount: 6,
}

describe('classifyAnomaly (reemplazo total: NUNCA emite BEHAVIORAL)', () => {
  describe('DATA_COVERAGE (problema de datos, NO anomalía del camión)', () => {
    it('pocos eventos frontales → EVENTOS_INSUFICIENTES', () => {
      const v = classifyAnomaly({ ...base, frontEventCount: 2, matrixFinalStatus: 'INCOMPLETO' })
      expect(v).toEqual({ kind: 'DATA_COVERAGE', reason: 'EVENTOS_INSUFICIENTES' })
      expect(isBehavioralAnomaly(v)).toBe(false)
    })

    it('executive NO_EVALUABLE → COBERTURA_INSUFICIENTE', () => {
      const v = classifyAnomaly({
        ...base,
        matrixFinalStatus: 'ANOMALO',
        executiveStatus: 'NO_EVALUABLE',
      })
      expect(v).toEqual({ kind: 'DATA_COVERAGE', reason: 'COBERTURA_INSUFICIENTE' })
    })

    it('INCOMPLETO → SECUENCIA_INCOMPLETA', () => {
      const v = classifyAnomaly({ ...base, matrixFinalStatus: 'INCOMPLETO', executiveStatus: 'INCOMPLETO' })
      expect(v).toEqual({ kind: 'DATA_COVERAGE', reason: 'SECUENCIA_INCOMPLETA' })
      expect(isBehavioralAnomaly(v)).toBe(false)
    })
  })

  describe('NONE — un ANOMALO de secuencia YA NO es comportamiento', () => {
    it('matriz/ejecutivo ANOMALO con cobertura ok → NONE (solo R1–R5 marcan comportamiento)', () => {
      const v = classifyAnomaly({ ...base, matrixFinalStatus: 'ANOMALO', executiveStatus: 'ANOMALO' })
      expect(v).toEqual({ kind: 'NONE', reason: null })
      expect(isBehavioralAnomaly(v)).toBe(false)
    })

    it('completo y válido → NONE', () => {
      expect(classifyAnomaly(base)).toEqual({ kind: 'NONE', reason: null })
    })

    it('deducido válido → NONE', () => {
      const v = classifyAnomaly({ ...base, matrixFinalStatus: 'DEDUCIDO', executiveStatus: 'VALIDO' })
      expect(v).toEqual({ kind: 'NONE', reason: null })
    })
  })
})

describe('applyGoldenAnomalyOverride (R1–R5 son la única fuente de comportamiento)', () => {
  it('promueve NONE a BEHAVIORAL con razón de regla', () => {
    expect(applyGoldenAnomalyOverride({ kind: 'NONE', reason: null }, 'RIC_SL_TRAMO_40M_6H')).toEqual({
      kind: 'BEHAVIORAL',
      reason: 'RIC_SL_TRAMO_40M_6H',
    })
  })

  it('no pisa EVENTOS_INSUFICIENTES: sin evidencia mínima no hay comportamiento', () => {
    expect(
      applyGoldenAnomalyOverride(
        { kind: 'DATA_COVERAGE', reason: 'EVENTOS_INSUFICIENTES' },
        'CARGA_LUEGO_DESCARGA'
      )
    ).toEqual({ kind: 'DATA_COVERAGE', reason: 'EVENTOS_INSUFICIENTES' })
  })

  it('sí pisa COBERTURA_INSUFICIENTE y SECUENCIA_INCOMPLETA (hay eventos para juzgar)', () => {
    expect(
      applyGoldenAnomalyOverride(
        { kind: 'DATA_COVERAGE', reason: 'COBERTURA_INSUFICIENTE' },
        'RUTA_BALANZA_PLAYA_C16_BALANZA'
      )
    ).toEqual({ kind: 'BEHAVIORAL', reason: 'RUTA_BALANZA_PLAYA_C16_BALANZA' })
    expect(
      applyGoldenAnomalyOverride(
        { kind: 'DATA_COVERAGE', reason: 'SECUENCIA_INCOMPLETA' },
        'RIC_REINGRESO_RAPIDO_NO_PELLET'
      )
    ).toEqual({ kind: 'BEHAVIORAL', reason: 'RIC_REINGRESO_RAPIDO_NO_PELLET' })
  })
})
