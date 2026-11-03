import { describe, expect, it } from 'vitest'
import { applyVinculo, assignmentsFromCobertura, indexAssignments } from './vinculoLive.mjs'

const cob = {
  camiones: [{
    ctg: '1023', plate: 'EFC338', plates: ['EFC338', 'AB111CD'],
    lecturas: [
      { at: '2026-11-03T13:00:00.000Z', camara: 'RicCal04', patente: 'EFC338', clase: 'carta' },
      { at: '2026-11-03T13:30:00.000Z', camara: 'RicIngCamFrente', patente: 'EFC33B', clase: 'carta_corregida' },
    ],
  }],
  capturas: [
    { at: '2026-11-03T14:14:37.851Z', camara: 'RicB2Egreso', patente: 'IEC333', rivales: [{ ctg: '1023', patente: 'EFC338', prob: 82, por: 'pendiente' }, { ctg: '9', patente: 'AE852GC', prob: 18, por: 'leido' }] },
    { at: '2026-11-03T15:00:00.000Z', camara: 'RicSalida2', patente: '', rivales: [{ ctg: '7', patente: 'TAO150', prob: 40, por: 'pendiente' }] },
  ],
}

describe('vínculo en vivo', () => {
  it('del resultado del vínculo salen las capturas atribuidas, no las bien leídas', () => {
    const a = assignmentsFromCobertura(cob)
    expect(a.map((x) => `${x.readPlate}>${x.plate}`)).toEqual(['EFC33B>EFC338', 'IEC333>EFC338', '>TAO150'])
    expect(a[1]).toMatchObject({ prob: 0.82, como: 'paso_pendiente', rival: { plate: 'AE852GC', prob: 0.18 } })
  })

  it('asigna lo que el reconocedor dejó abierto si llega a la probabilidad; por debajo, sugerencia', () => {
    const index = indexAssignments(assignmentsFromCobertura(cob))
    const items = [
      { fragmentKey: 'f1', readPlate: 'IEC333', deviceCode: 'RicB2Egreso', at: '2026-11-03T14:14:38.300Z', level: 'fuera_sistema', rule: 'fuera_sistema' },
      { fragmentKey: 'f2', readPlate: 'SINPAT', deviceCode: 'RicSalida2', at: '2026-11-03T15:00:00.000Z', level: 'pendiente' },
      { fragmentKey: 'f3', readPlate: 'IEC333', deviceCode: 'RicB2Egreso', at: '2026-11-03T14:14:37.851Z', level: 'pendiente', decision: { action: 'review' } },
      { fragmentKey: 'f4', readPlate: 'EFC33B', deviceCode: 'RicIngCamFrente', at: '2026-11-03T13:30:00.000Z', level: 'casi_seguro', rule: 'cuenta', assignedPlate: 'EFC338' },
    ]
    const ev = [{ journeyUid: 'j-efc', normalizedPlate: 'EFC338', t: Date.parse('2026-11-03T13:00:00Z') }]
    const out = applyVinculo(items, index, ev, { minProb: 0.5, timeOf: (e) => e.t })
    expect(out[0]).toMatchObject({ level: 'casi_seguro', rule: 'vinculo', assignedPlate: 'EFC338', assignedJourneyUid: 'j-efc' })
    expect(out[0].reason).toContain('82 %')
    expect(out[1]).toMatchObject({ level: 'pendiente', vinculo: { plate: 'TAO150', prob: 0.4 } })
    expect(out[2]).toBe(items[2])
    expect(out[3]).toBe(items[3])
  })
})
