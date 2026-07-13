import { describe, it, expect } from 'vitest'
import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import {
  buildCircuitEtlV2CsvBundle,
  buildOperationalSessionsPlateSite,
  classifyOperationalSession,
  CIRCUIT_ETL_V2_FILENAMES,
} from './powerBiCircuitCsvBundle'

function ev(o: Partial<RealJourneyEventDto>): RealJourneyEventDto {
  return {
    id: 1,
    createdAt: '',
    modifiedAt: '',
    journeyUid: 'ju1',
    sequenceNumber: 1,
    eventCategory: 'TEST',
    eventType: 'TEST',
    occurredAt: '2026-05-17T10:00:00.000Z',
    recordedAt: '2026-05-17T10:00:00.000Z',
    truckPlate: 'AB123CD',
    rawTruckPlate: 'AB123CD',
    normalizedPlate: 'AB123CD',
    isValidPlate: true,
    sectorCode: 'RICARDONE_INGRESO_CAMIONES',
    deviceCode: 'RicIngCamFrente',
    alertLevel: 0,
    ...o,
  }
}

describe('powerBiCircuitCsvBundle', () => {
  it('fusiona mismos UID de viaje dentro de gap 4h y bandera merged_fragment', () => {
    const events: RealJourneyEventDto[] = [
      ev({ id: 1, occurredAt: '2026-05-17T10:00:00.000Z', recordedAt: '2026-05-17T10:00:00.000Z', journeyUid: 'a' }),
      ev({
        id: 2,
        sequenceNumber: 2,
        occurredAt: '2026-05-17T11:30:00.000Z',
        recordedAt: '2026-05-17T11:30:00.000Z',
        journeyUid: 'b',
        deviceCode: 'RicCal01',
        sectorCode: 'RICARDONE_CALADA',
      }),
    ]
    const s = buildOperationalSessionsPlateSite(events)
    expect(s).toHaveLength(1)
    expect(s[0]!.merged_fragment).toBe(true)
    expect(s[0]!.source_journey_uids.sort()).toEqual(['a', 'b'])
  })

  it('circuito Celda16 sin PREINGRESO (S0) puede ser COMPLETO_RECONSTRUIDO con núcleo observable', () => {
    const t0 = '2026-05-17T10:00:00.000Z'
    const step = (i: number) => new Date(new Date(t0).getTime() + i * 600_000).toISOString()

    const events: RealJourneyEventDto[] = [
      ev({ id: 1, occurredAt: step(0), recordedAt: step(0), deviceCode: 'RicIngCamFrente', sectorCode: 'RICARDONE_INGRESO_CAMIONES' }),
      ev({ id: 2, sequenceNumber: 2, occurredAt: step(1), recordedAt: step(1), deviceCode: 'RicCal01', sectorCode: 'RICARDONE_CALADA' }),
      ev({
        id: 3,
        sequenceNumber: 3,
        occurredAt: step(2),
        recordedAt: step(2),
        deviceCode: 'RicB1Ingreso',
        sectorCode: 'RICARDONE_BALANZA',
      }),
      ev({
        id: 4,
        sequenceNumber: 4,
        occurredAt: step(3),
        recordedAt: step(3),
        deviceCode: 'RicVolcable1',
        sectorCode: 'RICARDONE_VOLCABLE_1',
      }),
      ev({
        id: 5,
        sequenceNumber: 5,
        occurredAt: step(4),
        recordedAt: step(4),
        deviceCode: 'RicC16Descarga1',
        sectorCode: 'RICARDONE_CELDA_16',
      }),
      ev({
        id: 6,
        sequenceNumber: 6,
        occurredAt: step(5),
        recordedAt: step(5),
        deviceCode: 'RicCalLiq',
        sectorCode: 'RICARDONE_CALADA',
      }),
      ev({
        id: 7,
        sequenceNumber: 7,
        occurredAt: step(6),
        recordedAt: step(6),
        deviceCode: 'RicB1Egreso',
        sectorCode: 'RICARDONE_BALANZA',
      }),
      ev({
        id: 8,
        sequenceNumber: 8,
        occurredAt: step(7),
        recordedAt: step(7),
        deviceCode: 'RicEgrCamFrente',
        sectorCode: 'RICARDONE_EGRESO_CAMIONES',
      }),
    ]

    const c = classifyOperationalSession({
      reconstructed_journey_id: 'rv2_test',
      source_journey_uids: ['ju1'],
      events,
      normalized_plate: 'AB123CD',
      site_id: 'ricardone',
      merged_fragment: false,
      source_plates_strict: ['AB123CD'],
      canonical_plate: 'AB123CD',
      plate_match_type: 'EXACT',
      plate_match_confidence: 1,
      fuzzy_merged_count: 0,
    })

    expect(['COMPLETO_CONFIRMADO', 'COMPLETO_RECONSTRUIDO', 'VARIACION_OPERATIVA']).toContain(c.circuit_status)
    expect(c.matrix?.circuit_type).toBe('RICARDONE_CELDA16_RECEPCION')
    expect(c.missing_points_count).toBe(0)
    expect(c.observed_sequence.split('>')).toEqual(expect.arrayContaining(['S0', 'S2', 'S4', 'S5', 'S6', 'S7']))
  })

  it('bundle incluye CSV v2 esperados con reconstruction_rate en summary', () => {
    const bundle = buildCircuitEtlV2CsvBundle([], { rawEventsCountHint: 0 })
    expect(bundle.map((b) => b.filename).sort()).toEqual(Object.values(CIRCUIT_ETL_V2_FILENAMES).sort())
    const q = bundle.find((b) => b.filename === CIRCUIT_ETL_V2_FILENAMES.etl_quality_summary_v2)!.csv
    expect(q).toContain('reconstruction_rate')
    expect(q).toContain('merged_journeys_count')
  })
})
