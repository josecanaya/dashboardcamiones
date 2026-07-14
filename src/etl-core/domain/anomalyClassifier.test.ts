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
  hasInvalidRouteOperationalAlert: false,
  hasInvalidJourneyStartOperationalAlert: false,
  frontEventCount: 6,
}

describe('classifyAnomaly', () => {
  describe('BEHAVIORAL (anomalía real del camión)', () => {
    it('alerta INVALID_ROUTE domina todo → RUTA_INVALIDA', () => {
      const v = classifyAnomaly({
        ...base,
        matrixFinalStatus: 'INCOMPLETO',
        executiveStatus: 'NO_EVALUABLE',
        frontEventCount: 1,
        hasInvalidRouteOperationalAlert: true,
      })
      expect(v).toEqual({ kind: 'BEHAVIORAL', reason: 'RUTA_INVALIDA' })
      expect(isBehavioralAnomaly(v)).toBe(true)
    })

    it('alerta INVALID_START_JOURNEY → ARRANQUE_INVALIDO', () => {
      const v = classifyAnomaly({ ...base, hasInvalidJourneyStartOperationalAlert: true })
      expect(v).toEqual({ kind: 'BEHAVIORAL', reason: 'ARRANQUE_INVALIDO' })
    })

    it('matriz ANOMALO con cobertura ok → RETROCESO_SECUENCIA', () => {
      const v = classifyAnomaly({ ...base, matrixFinalStatus: 'ANOMALO', executiveStatus: 'ANOMALO' })
      expect(v).toEqual({ kind: 'BEHAVIORAL', reason: 'RETROCESO_SECUENCIA' })
    })

    it('executive ANOMALO alcanza para comportamiento aunque matriz no lo diga', () => {
      const v = classifyAnomaly({ ...base, matrixFinalStatus: 'DEDUCIDO', executiveStatus: 'ANOMALO' })
      expect(v.kind).toBe('BEHAVIORAL')
      expect(v.reason).toBe('RETROCESO_SECUENCIA')
    })
  })

  describe('DATA_COVERAGE (problema de datos, NO anomalía del camión)', () => {
    it('pocos eventos frontales → EVENTOS_INSUFICIENTES', () => {
      const v = classifyAnomaly({ ...base, frontEventCount: 2, matrixFinalStatus: 'INCOMPLETO' })
      expect(v).toEqual({ kind: 'DATA_COVERAGE', reason: 'EVENTOS_INSUFICIENTES' })
      expect(isBehavioralAnomaly(v)).toBe(false)
    })

    it('executive NO_EVALUABLE → COBERTURA_INSUFICIENTE (sacado de anómalo)', () => {
      const v = classifyAnomaly({
        ...base,
        matrixFinalStatus: 'ANOMALO',
        executiveStatus: 'NO_EVALUABLE',
      })
      expect(v).toEqual({ kind: 'DATA_COVERAGE', reason: 'COBERTURA_INSUFICIENTE' })
    })

    it('INCOMPLETO sin contradicción → SECUENCIA_INCOMPLETA (no BEHAVIORAL)', () => {
      const v = classifyAnomaly({ ...base, matrixFinalStatus: 'INCOMPLETO', executiveStatus: 'INCOMPLETO' })
      expect(v).toEqual({ kind: 'DATA_COVERAGE', reason: 'SECUENCIA_INCOMPLETA' })
      expect(isBehavioralAnomaly(v)).toBe(false)
    })
  })

  describe('NONE (recorrido sano)', () => {
    it('completo y válido → NONE', () => {
      expect(classifyAnomaly(base)).toEqual({ kind: 'NONE', reason: null })
    })

    it('deducido válido → NONE', () => {
      const v = classifyAnomaly({ ...base, matrixFinalStatus: 'DEDUCIDO', executiveStatus: 'VALIDO' })
      expect(v).toEqual({ kind: 'NONE', reason: null })
    })
  })

  describe('prioridad: comportamiento domina sobre huecos de datos', () => {
    it('ANOMALO de matriz + INCOMPLETO ejecutivo → RETROCESO (no SECUENCIA_INCOMPLETA)', () => {
      const v = classifyAnomaly({ ...base, matrixFinalStatus: 'ANOMALO', executiveStatus: 'INCOMPLETO' })
      expect(v.reason).toBe('RETROCESO_SECUENCIA')
    })

    it('pero cobertura insuficiente frena la anomalía de comportamiento', () => {
      const v = classifyAnomaly({
        ...base,
        matrixFinalStatus: 'ANOMALO',
        executiveStatus: 'NO_EVALUABLE',
      })
      expect(v.kind).toBe('DATA_COVERAGE')
    })
  })

  describe('applyGoldenAnomalyOverride', () => {
    it('promueve NONE a BEHAVIORAL con razón de oro', () => {
      expect(applyGoldenAnomalyOverride({ kind: 'NONE', reason: null }, 'RIC_SL_DEMORA')).toEqual({
        kind: 'BEHAVIORAL',
        reason: 'RIC_SL_DEMORA',
      })
    })

    it('no pisa RUTA_INVALIDA', () => {
      expect(
        applyGoldenAnomalyOverride({ kind: 'BEHAVIORAL', reason: 'RUTA_INVALIDA' }, 'RIC_SL_DEMORA')
      ).toEqual({ kind: 'BEHAVIORAL', reason: 'RUTA_INVALIDA' })
    })
  })
})
