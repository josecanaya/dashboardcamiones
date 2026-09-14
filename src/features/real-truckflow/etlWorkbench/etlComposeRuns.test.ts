import { describe, expect, it } from 'vitest'
import {
  composeRunsIntoTransformOutput,
  computeRangeCoverage,
  selectNonOverlappingCover,
} from './etlComposeRuns'
import type { EtlTransformOutput } from './etlTransformContracts'

/** Corrida mínima con una tabla que tiene columna de día (`fecha`). */
function runWith(rows: { fecha: string; journey_id: string; camara: string }[]): EtlTransformOutput {
  return {
    csv: {},
    tables: {
      san_lorenzo_volcable_events: {
        headers: ['fecha', 'journey_id', 'camara'],
        rows,
      },
    },
    stats: {},
    rulesVersion: 'etl_transform_v16',
  } as unknown as EtlTransformOutput
}

describe('selectNonOverlappingCover', () => {
  it('descarta ventanas superpuestas redundantes y tapa el rango con tramos disjuntos', () => {
    const covering = [
      { runId: 'w1', from: '2026-08-20', to: '2026-08-26' },
      { runId: 'w2', from: '2026-08-27', to: '2026-09-02' },
      // Redundantes: subconjuntos superpuestos de w2.
      { runId: 'w2b', from: '2026-08-27', to: '2026-09-01' },
      { runId: 'w2c', from: '2026-08-31', to: '2026-09-01' },
      { runId: 'w2d', from: '2026-09-01', to: '2026-09-01' },
    ]
    const sel = selectNonOverlappingCover('2026-08-20', '2026-09-02', covering)
    expect(sel.map((s) => s.runId)).toEqual(['w1', 'w2'])
    expect(sel[0]).toMatchObject({ spanFrom: '2026-08-20', spanTo: '2026-08-26' })
    expect(sel[1]).toMatchObject({ spanFrom: '2026-08-27', spanTo: '2026-09-02' })
  })

  it('los tramos asignados son disjuntos (ningún día en dos corridas)', () => {
    const covering = [
      { runId: 'a', from: '2026-08-01', to: '2026-08-10' },
      { runId: 'b', from: '2026-08-05', to: '2026-08-15' }, // solapa a en 05..10
    ]
    const sel = selectNonOverlappingCover('2026-08-01', '2026-08-15', covering)
    // a cubre 01..10, b arranca su tramo en 11 (no 05) → sin días repetidos.
    expect(sel).toEqual([
      { runId: 'a', from: '2026-08-01', to: '2026-08-10', spanFrom: '2026-08-01', spanTo: '2026-08-10' },
      { runId: 'b', from: '2026-08-05', to: '2026-08-15', spanFrom: '2026-08-11', spanTo: '2026-08-15' },
    ])
  })

  it('recorta el tramo de la última corrida al fin del rango pedido', () => {
    const sel = selectNonOverlappingCover('2026-08-20', '2026-08-28', [
      { runId: 'w', from: '2026-08-20', to: '2026-09-02' },
    ])
    expect(sel).toEqual([
      { runId: 'w', from: '2026-08-20', to: '2026-09-02', spanFrom: '2026-08-20', spanTo: '2026-08-28' },
    ])
  })
})

describe('computeRangeCoverage', () => {
  it('expone selectedRuns sin solape junto con missingDays', () => {
    const cov = computeRangeCoverage('2026-08-18', '2026-08-28', [
      { runId: 'w1', from: '2026-08-20', to: '2026-08-26' },
      { runId: 'w2', from: '2026-08-24', to: '2026-08-28' }, // solapa w1
    ])
    expect(cov.selectedRuns.map((s) => s.runId)).toEqual(['w1', 'w2'])
    expect(cov.selectedRuns[1].spanFrom).toBe('2026-08-27') // w2 arranca tras w1
    expect(cov.missingDays).toEqual(['2026-08-18', '2026-08-19']) // 18,19 sin cobertura
  })
})

describe('composeRunsIntoTransformOutput', () => {
  it('cuenta cada día una sola vez usando el tramo asignado (no dobla el solape)', () => {
    // Dos corridas que comparten el día 08-26 en sus datos, pero con tramos disjuntos.
    const runA = runWith([
      { fecha: '2026-08-25', journey_id: 'excel:A25', camara: 'Volcable 1' },
      { fecha: '2026-08-26', journey_id: 'excel:A26', camara: 'Volcable 1' },
    ])
    const runB = runWith([
      { fecha: '2026-08-26', journey_id: 'excel:A26', camara: 'Volcable 1' }, // arrastre del día borde
      { fecha: '2026-08-27', journey_id: 'excel:B27', camara: 'Volcable 1' },
    ])
    const composed = composeRunsIntoTransformOutput(
      [
        { runId: 'A', output: runA, spanFrom: '2026-08-25', spanTo: '2026-08-26' },
        { runId: 'B', output: runB, spanFrom: '2026-08-27', spanTo: '2026-08-27' },
      ],
      '2026-08-25',
      '2026-08-27'
    )
    const rows = (composed.output.tables as unknown as Record<string, { rows: unknown[] }>)
      .san_lorenzo_volcable_events.rows
    // A26 aparece una sola vez (viene de A, no de B: B lo filtra por tramo).
    const ids = rows.map((r) => (r as { journey_id: string }).journey_id).sort()
    expect(ids).toEqual(['excel:A25', 'excel:A26', 'excel:B27'])
  })
})
