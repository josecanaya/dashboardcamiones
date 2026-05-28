import { describe, expect, it } from 'vitest'
import {
  buildAnomalyReviewSummary,
  buildAnomalySequenceBreakdown,
  buildCommitteeCircuitCrossTab,
  committeeChartExportCsv,
  normalizeAnomalySequenceKey,
  type CircuitClassificationEntry,
} from './etlCircuitClassificationIndex'

function entry(partial: Partial<CircuitClassificationEntry>): CircuitClassificationEntry {
  return {
    journeyId: 'j1',
    plate: 'ABC123',
    normalizedPlate: 'ABC123',
    site: 'ricardone',
    matchedCircuitCode: 'R7',
    executiveCircuitCode: 'R7',
    executiveCircuitLabel: 'Ric→SL',
    executiveCircuitDisplay: 'R7 · Ric→SL',
    matrixFinalStatus: 'INCOMPLETO',
    executiveStatus: 'INCOMPLETO',
    validDetail: '',
    committeeGroup: 'ANOMALIAS',
    committeeReason: 'JOURNEY_INCOMPLETO',
    operationalVariationType: '',
    detectedSequence: 'INGRESO>PREINGRESO>CALADA',
    executiveReason: 'JOURNEY_INCOMPLETO',
    pieSliceLabel: 'ANOMALÍAS',
    usefulEventsCount: 3,
    executiveBucket: 'INCOMPLETO',
    matrixReason: 'EVENTOS_INSUFICIENTES',
    color: '#e11d48',
    ...partial,
  }
}

describe('etlCircuitClassificationIndex anomalías', () => {
  it('excluye incompletos (<3 evt) del listado por secuencia', () => {
    const summary = buildAnomalyReviewSummary([
      entry({ journeyId: 'a', usefulEventsCount: 2, detectedSequence: 'INGRESO' }),
      entry({ journeyId: 'b', usefulEventsCount: 2, detectedSequence: 'INGRESO' }),
      entry({ journeyId: 'c', usefulEventsCount: 4, detectedSequence: 'INGRESO>PREINGRESO>CALADA' }),
    ])
    expect(summary.incompleteCount).toBe(2)
    expect(summary.listedAnomalyCount).toBe(1)
    expect(summary.sequenceRows).toHaveLength(1)
    expect(summary.sequenceRows[0]!.count).toBe(1)
  })

  it('agrupa anomalías por secuencia detectada', () => {
    const rows = buildAnomalySequenceBreakdown([
      entry({ journeyId: 'a', plate: 'A1', detectedSequence: 'INGRESO>PREINGRESO>CALADA' }),
      entry({ journeyId: 'b', plate: 'A2', detectedSequence: 'INGRESO>PREINGRESO>CALADA' }),
      entry({ journeyId: 'c', plate: 'B1', detectedSequence: 'INGRESO>EGRESO' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]!.displaySequence).toBe('INGRESO>PREINGRESO>CALADA')
    expect(rows[0]!.count).toBe(2)
    expect(rows[1]!.count).toBe(1)
  })

  it('no asigna anomalías a filas de circuito en cross-tab', () => {
    const cross = buildCommitteeCircuitCrossTab([
      entry({ executiveCircuitCode: 'SIN_PUNTO' }),
      entry({
        journeyId: 'ok',
        committeeGroup: 'COMPLETOS',
        pieSliceLabel: 'COMPLETOS',
        executiveCircuitCode: 'R7',
      }),
    ])
    const sinPunto = cross.find((r) => r.code === 'SIN_PUNTO')
    expect(sinPunto).toBeUndefined()
    const r7 = cross.find((r) => r.code === 'R7')
    expect(r7?.completos).toBe(1)
    expect(r7?.anomalias).toBe(0)
  })

  it('normaliza claves de secuencia', () => {
    expect(normalizeAnomalySequenceKey('ingreso > preingreso')).toBe('INGRESO>PREINGRESO')
    expect(normalizeAnomalySequenceKey('')).toBe('(SIN_SECUENCIA_DETECTADA)')
  })

  it('exporta CSV unificado para gráficos de conciliación', () => {
    const entries = [
      entry({
        journeyId: 'ok1',
        committeeGroup: 'COMPLETOS',
        pieSliceLabel: 'COMPLETOS',
        executiveCircuitCode: 'R7',
        executiveCircuitLabel: 'Ric→SL',
        executiveCircuitDisplay: 'R7 · Ric→SL',
        detectedSequence: 'INGRESO>PREINGRESO>CALADA>EGRESO',
        usefulEventsCount: 5,
      }),
      entry({
        journeyId: 'var1',
        committeeGroup: 'VARIACIONES_OPERATIVAS',
        pieSliceLabel: 'VARIACIONES OPERATIVAS',
        executiveCircuitCode: 'R7',
        operationalVariationType: 'ESPERA_EN_CALADA',
        detectedSequence: 'INGRESO>PREINGRESO>CALADA>EGRESO',
        usefulEventsCount: 5,
      }),
      entry({ journeyId: 'an1', usefulEventsCount: 2, detectedSequence: 'INGRESO' }),
      entry({
        journeyId: 'an2',
        usefulEventsCount: 4,
        detectedSequence: 'INGRESO>PREINGRESO>CALADA>SL_INGRESO',
        executiveCircuitCode: 'R7',
      }),
    ]
    const crossTab = buildCommitteeCircuitCrossTab(entries)
    const anomalyReview = buildAnomalyReviewSummary(entries)
    const csv = committeeChartExportCsv({
      entries,
      crossTab,
      crossTabTotals: { total: 2, completos: 1, variaciones: 1 },
      anomalyReview,
      circuitBarSlices: [{ code: 'R7', label: 'Ric→SL', displayLabel: 'R7 · Ric→SL', count: 3 }],
    })
    expect(csv).toContain('record_type')
    expect(csv).toContain('CIRCUITO_COMITE')
    expect(csv).toContain('CIRCUITO_COMITE_CELDA')
    expect(csv).toContain('ANOMALIA_RECORRIDO')
    expect(csv).toContain('JOURNEY')
    expect(csv).toContain('ANOMALIA_INCOMPLETOS')
  })
})
