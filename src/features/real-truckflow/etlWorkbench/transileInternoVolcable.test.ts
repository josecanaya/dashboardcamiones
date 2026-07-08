import { describe, expect, it } from 'vitest'
import {
  buildTransileInternoVolcableReport,
  clusterVolcableVisits,
  evaluateTransileSession,
  splitVolcableVisitSessions,
  transileInternoVolcableSessionsCsv,
  TRANSILE_LAP_MIN_MS,
  TRANSILE_SESSION_BREAK_MS,
  type VolcableVisit,
} from './transileInternoVolcable'
import type { RawJourneyEventLike } from './auditSlCameraExcelCoverage'
import type { ExcelOperationWithTruckflowRow } from './etlExcelFirstMerge'

function visit(ms: number, device = 'RicVolcable1'): VolcableVisit {
  return {
    ms,
    instant: new Date(ms).toISOString(),
    deviceCode: device,
    journeyUid: 'j1',
  }
}

describe('transileInternoVolcable', () => {
  it('agrupa lecturas a menos de 20 min', () => {
    const t0 = Date.parse('2026-06-10T10:00:00-03:00')
    const raw = [
      visit(t0),
      visit(t0 + 5 * 60_000),
      visit(t0 + TRANSILE_LAP_MIN_MS + 60_000),
    ]
    expect(clusterVolcableVisits(raw)).toHaveLength(2)
  })

  it('4 vueltas a 30 min → transile interno', () => {
    const t0 = Date.parse('2026-06-10T08:00:00-03:00')
    const gap = 30 * 60_000
    const visits = [0, 1, 2, 3].map((i) => visit(t0 + i * gap))
    const { inferred, valid_laps } = evaluateTransileSession(visits)
    expect(visits.length).toBe(4)
    expect(valid_laps).toBe(3)
    expect(inferred).toBe(true)
  })

  it('parte sesión si hay ≥ 3 h entre visitas', () => {
    const t0 = Date.parse('2026-06-10T08:00:00-03:00')
    const visits = [
      visit(t0),
      visit(t0 + 30 * 60_000),
      visit(t0 + TRANSILE_SESSION_BREAK_MS + 30 * 60_000),
      visit(t0 + TRANSILE_SESSION_BREAK_MS + 60 * 60_000),
    ]
    const clustered = clusterVolcableVisits(visits)
    const sessions = splitVolcableVisitSessions(clustered)
    expect(sessions.length).toBe(2)
    expect(evaluateTransileSession(sessions[0]!).inferred).toBe(false)
  })

  it('agrega ingreso/egreso del camión (Excel) a la sesión y al CSV', () => {
    const t0 = Date.parse('2026-06-10T08:00:00-03:00')
    const gap = 30 * 60_000
    const rawEvents: RawJourneyEventLike[] = [0, 1, 2, 3].map((i) => ({
      normalizedPlate: 'ABC123',
      deviceCode: 'RicVolcable1',
      occurredAt: new Date(t0 + i * gap).toISOString(),
    }))
    const ingreso = new Date(t0 - 40 * 60_000).toISOString()
    const salida = new Date(t0 + 3 * gap + 40 * 60_000).toISOString()
    const operations = [
      {
        plate_normalized: 'ABC123',
        truckflow_circuit_codes: 'R26',
        external_ingreso_at: ingreso,
        external_salida_at: salida,
      },
    ] as unknown as ExcelOperationWithTruckflowRow[]

    const report = buildTransileInternoVolcableReport({
      classifiedJourneys: [],
      rawEvents,
      operations,
    })
    const session = report.sessions.find((s) => s.inferred_transile_interno)
    expect(session).toBeDefined()
    expect(session!.ingreso_camion).toBe(ingreso)
    expect(session!.egreso_camion).toBe(salida)

    const csv = transileInternoVolcableSessionsCsv(report.sessions)
    expect(csv.split('\n')[0]).toContain('ingreso_camion')
    expect(csv.split('\n')[0]).toContain('egreso_camion')
    expect(csv).toContain(ingreso)
    expect(csv).toContain(salida)
  })
})
