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

function evWithCreated(deviceCode: string, occurredAt: string, createdAt: string): RealJourneyEventDto {
  return { deviceCode, occurredAt, createdAt } as RealJourneyEventDto
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

  it('bucketea por hora local: 08:14 y 08:46 caen en la misma ventana', () => {
    // `occurredAt` es la hora física del sensor = reloj de pared − 206 min. El instante operativo
    // suma esos 206 min: 04:48→08:14, 05:20→08:46 (misma ventana 08), 05:39→09:05 (ventana 09).
    const rows = buildCaladaCameraEvents({
      classifiedJourneys: [
        journey({
          journeyUid: 'j1',
          circuit: 'R1',
          events: [
            ev('RicCal01', '2026-07-20T04:48:00-03:00'),
            ev('RicCal01', '2026-07-20T05:20:00-03:00'),
            ev('RicCal01', '2026-07-20T05:39:00-03:00'),
          ],
        }),
      ],
    })
    expect(rows.map((r) => r.intervalo_hora.slice(11))).toEqual(['08:00:00', '08:00:00', '09:00:00'])
  })

  it('bucketea por hora de pared Argentina aunque el evento venga en UTC (Z)', () => {
    // 07:49Z == 04:49 en Argentina (−03:00); + 206 min = 08:15 (reloj de pared). La ventana debe
    // caer en las 08 sin importar la zona horaria del proceso que corre el ETL ni el skew del sensor.
    const rows = buildCaladaCameraEvents({
      classifiedJourneys: [
        journey({ journeyUid: 'j1', circuit: 'R1', events: [ev('RicCal01', '2026-07-20T07:49:00Z')] }),
      ],
    })
    expect(rows[0]!.hora).toBe('08:15')
    expect(rows[0]!.fecha).toBe('2026-07-20')
    expect(rows[0]!.intervalo_hora).toBe('2026-07-20T08:00:00')
  })

  it('usa el instante operativo occurredAt + 206 min (reloj de pared), NO createdAt (subida)', () => {
    // occurredAt es la hora física del sensor (reloj de pared − 206 min); createdAt es la hora de
    // SUBIDA a la nube, que con backlogs de subida amontona eventos y genera picos falsos. La
    // calada debe caer en occurredAt + 206 min = 08:24 + 3h26 = 11:50, ignorando createdAt (11:49).
    const rows = buildCaladaCameraEvents({
      classifiedJourneys: [
        journey({
          journeyUid: 'j1',
          circuit: 'R8',
          events: [
            evWithCreated('RicCal01', '2026-08-11T08:24:05.288-03:00', '2026-08-11T11:49:18.161-03:00'),
          ],
        }),
      ],
    })
    expect(rows[0]!.hora).toBe('11:50')
    expect(rows[0]!.fecha).toBe('2026-08-11')
    expect(rows[0]!.intervalo_hora).toBe('2026-08-11T11:00:00')
    expect(rows[0]!.timestamp).toBe('2026-08-11T11:50:05.288-03:00')
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
