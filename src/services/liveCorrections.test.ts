import { describe, expect, it } from 'vitest'
import type { RealJourneyEventDto } from '../etl-core/domain/journeyEvents.types'
import { applyLiveCorrections } from './liveCorrections'

const ev = (uid: string, plate: string, occurredAt = '2026-10-07T10:00:00Z') =>
  ({ id: 1, journeyUid: uid, truckPlate: plate, rawTruckPlate: plate, normalizedPlate: plate, isValidPlate: false, occurredAt, recordedAt: occurredAt, sequenceNumber: 1, eventCategory: '', eventType: '', sectorCode: 'S1', deviceCode: 'd', alertLevel: 0 }) as RealJourneyEventDto

describe('applyLiveCorrections', () => {
  it('renombra, suma al viaje vinculado y descarta según las decisiones de En vivo', () => {
    const r = applyLiveCorrections(
      [ev('bad', 'AB128CO'), ev('tractor', 'CAT'), ev('ok', 'AB123CD')],
      { generatedAt: '', corrections: [
        { site: 'ricardone', key: 'bad', kind: 'rename', plate: 'AB123CD', journeyUid: 'ok', source: 'link' },
        { site: 'ricardone', key: 'tractor', kind: 'drop', source: 'discard' },
      ] }
    )
    expect(r.renamed).toBe(1)
    expect(r.dropped).toBe(1)
    expect(r.events.map((e) => [e.journeyUid, e.normalizedPlate])).toEqual([['ok', 'AB123CD'], ['ok', 'AB123CD']])
  })
  it('sin uid usa la misma clave PATENTE#bloque que el reconocedor en vivo', () => {
    const e = ev('', 'XX12', '2026-10-07T10:00:00Z')
    const block = Math.floor((Date.parse('2026-10-07T10:00:00Z') + 206 * 60_000) / (12 * 3600_000))
    const r = applyLiveCorrections([e], { generatedAt: '', corrections: [{ site: 'ricardone', key: `XX12#${block}`, kind: 'drop', source: 'reject' }] })
    expect(r.events).toHaveLength(0)
  })
})
