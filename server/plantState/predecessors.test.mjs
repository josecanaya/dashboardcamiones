import { describe, expect, it } from 'vitest'
import { applyLinks, findPredecessors, nodeModelCatalog } from './plateIdentification.mjs'

const catalog = nodeModelCatalog()
function ev(plate, uid, sectorCode, deviceCode, wallIso) {
  const occurred = new Date(Date.parse(wallIso) - 206 * 60_000).toISOString()
  return { journeyUid: uid, truckPlate: plate, normalizedPlate: plate, sectorCode, deviceCode, occurredAt: occurred, recordedAt: occurred }
}

describe('findPredecessors', () => {
  const now = Date.parse('2026-09-08T12:00:00-03:00')
  const events = [
    // Bien leído recién desde Calada.
    ev('AB123CD', 'jOk', '2-S2', 'RicCal03', '2026-09-08T11:20:00-03:00'),
    ev('AB123CD', 'jOk', '2-S3', 'RicEgrCamFrente', '2026-09-08T11:40:00-03:00'),
    // Su Preingreso quedó bajo una patente mal leída.
    ev('AB128CO', 'jBad', '2-S1', 'RicPreIngInFr', '2026-09-08T11:00:00-03:00'),
    // Otro camión que siguió leyéndose después: no es candidato.
    ev('AB123CC', 'jOther', '2-S1', 'RicPreIngInFr', '2026-09-08T10:58:00-03:00'),
    ev('AB123CC', 'jOther', '2-S2', 'RicCal03', '2026-09-08T11:35:00-03:00'),
  ]

  it('propone el viaje mal leído que encaja antes y excluye el que siguió', () => {
    const r = findPredecessors(events, now, 'AB123CD', { catalog })
    expect(r.startsAtEntry).toBe(false)
    expect(r.firstNode).toBe('S2')
    expect(r.candidates[0].journeyKey).toBe('jBad')
    expect(r.candidates.some((c) => c.journeyKey === 'jOther')).toBe(false)
    expect(r.candidates[0].reads[0].node).toBe('S1')
  })

  it('un viaje anterior de la misma patente (recorrido partido por la nube) es candidato', () => {
    const split = [
      ev('BXN336', 'jA', '2-S1', 'RicPreIngInFr', '2026-09-08T10:50:00-03:00'),
      ev('BXN336', 'jB', '2-S2', 'RicCal03', '2026-09-08T11:30:00-03:00'),
    ]
    const r = findPredecessors(split, now, 'BXN336', { catalog })
    expect(r.firstNode).toBe('S2')
    expect(r.candidates[0].journeyKey).toBe('jA')
    expect(r.candidates[0].samePlate).toBe(true)
  })

  it('una vuelta anterior completa de la misma patente se muestra como viaje previo, no como candidato', () => {
    const trips = [
      ev('BXN336', 'v1', '2-S2', 'RicCal03', '2026-09-08T10:35:00-03:00'),
      ev('BXN336', 'v1', '2-S3', 'RicEgrCamFrente', '2026-09-08T10:42:00-03:00'),
      ev('BXN336', 'v2', '2-S2', 'RicCal03', '2026-09-08T11:30:00-03:00'),
      ev('XX9', 'p', '2-S1', 'RicPreIngInFr', '2026-09-08T11:10:00-03:00'),
      ev('C4T', 'q', '2-S1', 'RicPreIngInFr', '2026-09-08T11:12:00-03:00'),
    ]
    const r = findPredecessors(trips, now, 'BXN336', { catalog })
    expect(r.previousTrips.map((t) => t.journeyKey)).toEqual(['v1'])
    expect(r.previousTrips[0].reads.map((x) => x.node)).toEqual(['S2', 'S3'])
    expect(r.candidates.some((c) => c.journeyKey === 'v1')).toBe(false)
  })

  it('en San Lorenzo devuelve su recorrido en Ricardone y no lo propone como lectura perdida', () => {
    const ric = [
      ev('AB675DP', 'r1', '2-S1', 'RicPreIngInFr', '2026-09-08T08:00:00-03:00'),
      ev('AB675DP', 'r1', '2-S2', 'RicCal03', '2026-09-08T08:30:00-03:00'),
      ev('AB675DP', 'r1', '2-S3', 'RicEgrCamFrente', '2026-09-08T08:50:00-03:00'),
    ]
    const sl = [ev('AB675DP', 's1', 'SL_VOLCABLE', 'SLZVolcableC1', '2026-09-08T09:40:00-03:00')]
    const r = findPredecessors(sl, now, 'AB675DP', { catalog, otherSiteEvents: ric })
    expect(r.otherPlantTrips.map((t) => t.journeyKey)).toEqual(['r1'])
    expect(r.otherPlantTrips[0].reads.map((x) => x.node)).toEqual(['S1', 'S2', 'S3'])
    expect(r.candidates.some((c) => c.journeyKey === 'r1')).toBe(false)
  })

  it('un viaje ya vinculado no se vuelve a proponer y el vínculo reescribe sus eventos', () => {
    const r = findPredecessors(events, now, 'AB123CD', { catalog, linkedKeys: ['jBad'] })
    expect(r.candidates.some((c) => c.journeyKey === 'jBad')).toBe(false)
    const out = applyLinks(events, [{ journeyKey: 'jBad', plate: 'AB123CD', journeyUid: 'jOk' }])
    const moved = out.find((e) => e.identifiedFromPlate === 'AB128CO')
    expect(moved.normalizedPlate).toBe('AB123CD')
    expect(moved.journeyUid).toBe('jOk')
  })
})
