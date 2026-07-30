import { describe, expect, it } from 'vitest'
import {
  buildCaladaCameraEvents,
  caladaCameraEventsCsv,
  CALADA_CAMERA_EVENTS_HEADERS,
} from './etlCaladaCameraActivity'
import type { ClassifiedJourneyForTiming } from './etlSegmentTiming'
import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'

function ev(deviceCode: string, occurredAt: string): RealJourneyEventDto {
  return { deviceCode, occurredAt } as RealJourneyEventDto
}

function journey(
  partial: {
    journeyUid: string
    plate?: string
    circuit: string
    events: RealJourneyEventDto[]
  }
): ClassifiedJourneyForTiming {
  return {
    journey: {
      journeyUid: partial.journeyUid,
      normalizedPlate: partial.plate ?? 'AB123CD',
      plate: partial.plate ?? 'AB123CD',
      events: partial.events,
    } as unknown as ClassifiedJourneyForTiming['journey'],
    executiveCircuitCode: partial.circuit,
    committeeGroup: 'COMPLETOS',
  }
}

describe('buildCaladaCameraEvents', () => {
  it('emite una fila por evento de calada, con la cámara del deviceCode', () => {
    const rows = buildCaladaCameraEvents({
      classifiedJourneys: [
        journey({
          journeyUid: 'j1',
          plate: 'GFW767',
          circuit: 'R1',
          events: [
            ev('RicIngCamFrente', '2026-07-20T08:00:00-03:00'),
            ev('RicCal04', '2026-07-20T08:15:00-03:00'),
            ev('RicBalIngFte', '2026-07-20T08:40:00-03:00'),
          ],
        }),
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.camara).toBe('RicCal04')
    expect(rows[0]!.circuito).toBe('R1')
    expect(rows[0]!.patente).toBe('GFW767')
    expect(rows[0]!.journey_id).toBe('j1')
  })

  it('captura las 6 cámaras sólidas y la de líquidos', () => {
    const cams = ['RicCal01', 'RicCal02', 'RicCal03', 'RicCal04', 'RicCal05', 'RicCal06', 'RicCalLiq']
    const rows = buildCaladaCameraEvents({
      classifiedJourneys: cams.map((c, i) =>
        journey({ journeyUid: `j${i}`, circuit: 'R8', events: [ev(c, `2026-07-20T09:0${i}:00-03:00`)] })
      ),
    })
    expect(new Set(rows.map((r) => r.camara))).toEqual(new Set(cams))
  })

  it('ignora eventos que no son de calada', () => {
    const rows = buildCaladaCameraEvents({
      classifiedJourneys: [
        journey({
          journeyUid: 'j1',
          circuit: 'R7',
          events: [ev('RicIngCamFrente', '2026-07-20T08:00:00-03:00'), ev('RicEgrCamFrente', '2026-07-20T10:00:00-03:00')],
        }),
      ],
    })
    expect(rows).toHaveLength(0)
  })

  it('bucketea en ventanas de 30 min por hora local', () => {
    const rows = buildCaladaCameraEvents({
      classifiedJourneys: [
        journey({
          journeyUid: 'j1',
          circuit: 'R1',
          events: [ev('RicCal01', '2026-07-20T08:14:00-03:00'), ev('RicCal01', '2026-07-20T08:46:00-03:00')],
        }),
      ],
    })
    expect(rows.map((r) => r.intervalo_30min.slice(11))).toEqual(['08:00:00', '08:30:00'])
  })

  it('pobla producto desde el mapa por journey', () => {
    const rows = buildCaladaCameraEvents({
      classifiedJourneys: [
        journey({ journeyUid: 'j1', circuit: 'R8', events: [ev('RicCalLiq', '2026-07-20T09:00:00-03:00')] }),
      ],
      productByJourneyUid: new Map([['j1', 'ACEITE GIRASOL REFINADO']]),
    })
    expect(rows[0]!.producto).toBe('ACEITE GIRASOL REFINADO')
  })

  it('CSV con headers estables', () => {
    const csv = caladaCameraEventsCsv(
      buildCaladaCameraEvents({
        classifiedJourneys: [journey({ journeyUid: 'j1', circuit: 'R1', events: [ev('RicCal02', '2026-07-20T08:00:00-03:00')] })],
      })
    )
    expect(csv.split('\n')[0]).toBe(CALADA_CAMERA_EVENTS_HEADERS.join(','))
    expect(csv).toContain('RicCal02')
  })
})
