import { describe, expect, it } from 'vitest'
import type { RealJourneyEventDto } from './realJourneyEvents.types'
import { applyJourneyCycleSplitsToEvents, shouldSplitJourneyAtBoundary } from './realJourneyCycleSplit'

function ev(
  partial: Partial<RealJourneyEventDto> & {
    occurredAt: string
    deviceCode: string
    sectorCode: string
  }
): RealJourneyEventDto {
  return {
    id: partial.id ?? '1',
    journeyUid: partial.journeyUid ?? 'uid-1',
    sequenceNumber: partial.sequenceNumber ?? 1,
    truckPlate: 'AE785CS',
    normalizedPlate: 'AE785CS',
    isValidPlate: true,
    eventType: 'physical',
    eventCategory: 'sector_entered',
    ...partial,
  } as RealJourneyEventDto
}

describe('shouldSplitJourneyAtBoundary', () => {
  it('no parte si solo cruzó medianoche con hueco < 6 h', () => {
    const a = ev({
      occurredAt: '2026-05-13T23:30:00-03:00',
      deviceCode: 'RicB1Ingreso',
      sectorCode: 'RICARDONE_BALANZA',
    })
    const b = ev({
      occurredAt: '2026-05-14T02:00:00-03:00',
      deviceCode: 'RicB2Egreso',
      sectorCode: 'RICARDONE_BALANZA',
    })
    expect(shouldSplitJourneyAtBoundary(a, b)).toBe(false)
  })

  it('parte si hay ≥ 6 h entre lecturas (días distintos con espera real)', () => {
    const a = ev({
      occurredAt: '2026-05-13T18:00:00-03:00',
      deviceCode: 'RicB2Egreso',
      sectorCode: 'RICARDONE_BALANZA',
    })
    const b = ev({
      occurredAt: '2026-05-14T08:00:00-03:00',
      deviceCode: 'RicIngCamFrente',
      sectorCode: 'RICARDONE_INGRESO_CAMIONES',
    })
    expect(shouldSplitJourneyAtBoundary(a, b)).toBe(true)
  })

  it('parte tras BALANZA_EGRESO y nuevo INGRESO el mismo día', () => {
    const a = ev({
      occurredAt: '2026-05-14T10:00:00-03:00',
      deviceCode: 'RicB2Egreso',
      sectorCode: 'RICARDONE_BALANZA',
    })
    const b = ev({
      occurredAt: '2026-05-14T14:00:00-03:00',
      deviceCode: 'RicIngCamFrente',
      sectorCode: 'RICARDONE_INGRESO_CAMIONES',
    })
    expect(shouldSplitJourneyAtBoundary(a, b)).toBe(true)
  })
})

describe('applyJourneyCycleSplitsToEvents', () => {
  it('divide dos ciclos unidos por Truckflow', () => {
    const uid = '06ea3e62-e1da-4465-9f88-61f8a39e8c5d'
    const mk = (at: string, deviceCode: string, sectorCode: string, seq: number) =>
      ev({
        journeyUid: uid,
        occurredAt: at,
        deviceCode,
        sectorCode,
        sequenceNumber: seq,
        id: String(seq),
      })

    const events = [
      mk('2026-05-13T08:00:00-03:00', 'RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', 1),
      mk('2026-05-13T11:00:00-03:00', 'RicB2Egreso', 'RICARDONE_BALANZA', 4),
      mk('2026-05-14T08:00:00-03:00', 'RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', 5),
      mk('2026-05-14T12:00:00-03:00', 'RicB2Egreso', 'RICARDONE_BALANZA', 9),
    ]

    const r = applyJourneyCycleSplitsToEvents(events)
    expect(r.splitsApplied).toBe(1)
    expect(new Set(r.events.map((e) => e.journeyUid)).size).toBe(2)
  })

  it('caso real AE785CS API: 1 UID → 4 viajes', () => {
    const uid = '06ea3e62-505e-4a87-adfa-9dc0c572b3b8'
    const rows: [string, string, string, number][] = [
      ['2026-05-28T09:12:02.161-03:00', 'RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', 1],
      ['2026-05-28T11:24:31.959-03:00', 'RicB2Egreso', 'RICARDONE_BALANZA', 5],
      ['2026-05-29T13:43:50.318-03:00', 'RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', 6],
      ['2026-05-29T20:26:53.218-03:00', 'RicB2Egreso', 'RICARDONE_BALANZA', 9],
      ['2026-05-31T21:18:11.026-03:00', 'RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', 10],
      ['2026-05-31T21:57:54.438-03:00', 'RicB1Ingreso', 'RICARDONE_BALANZA', 13],
      ['2026-06-01T00:34:29.262-03:00', 'RicB2Egreso', 'RICARDONE_BALANZA', 14],
    ]
    const events = rows.map(([at, dev, sec, seq]) =>
      ev({ journeyUid: uid, occurredAt: at, deviceCode: dev, sectorCode: sec, sequenceNumber: seq, id: String(seq) })
    )

    const r = applyJourneyCycleSplitsToEvents(events)
    expect(r.splitsApplied).toBe(3)
    expect(r.outputJourneyCount).toBe(4)
  })
})
