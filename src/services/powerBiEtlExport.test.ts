import { describe, it, expect } from 'vitest'
import type { RealJourneyEventDto } from './realJourneyEvents.types'
import type { RealAlertDto } from './realTruckflowApi'
import { buildCommitteeOperationalPipeline } from './realCommitteePipeline'
import {
  buildCommitteePowerBiEtlExport,
  buildCommitteePowerBiMinimalExport,
  buildPowerBiZipDownloadName,
  POWER_BI_COMMITTEE_FILENAMES,
  POWER_BI_COMMITTEE_FILE_COUNT,
  POWER_BI_ETL_DEBUG_FILE_COUNT,
  POWER_BI_ETL_FILENAMES,
  POWER_BI_ETL_SCHEMA_VERSION,
  POWER_BI_CSV_HEADERS,
} from './powerBiEtlExport'

function parseOneCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQ = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQ = true
    } else if (c === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

function csvFirstRow(csv: string): string[] {
  const body = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv
  const line = body.split(/\r?\n/, 1)[0] ?? ''
  return parseOneCsvLine(line)
}

function csvSecondRow(csv: string): string[] {
  const body = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv
  const lines = body.split(/\r?\n/)
  const line = lines[1] ?? ''
  return parseOneCsvLine(line)
}

function rowToRecord(headers: readonly string[], row: string[]): Record<string, string> {
  const r: Record<string, string> = {}
  headers.forEach((h, i) => {
    r[h] = row[i] ?? ''
  })
  return r
}

function baseEvent(over: Partial<RealJourneyEventDto>): RealJourneyEventDto {
  return {
    id: 1,
    createdAt: '',
    modifiedAt: '',
    journeyUid: 'j-test-1',
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
    ...over,
  }
}

describe('buildPowerBiZipDownloadName', () => {
  it('comité: prefijo powerbi-comite_, sufijo .zip y sin dos puntos', () => {
    const name = buildPowerBiZipDownloadName(new Date(2026, 4, 17, 23, 1, 2), 'committee')
    expect(name).toMatch(/^powerbi-comite_2026-05-17_/)
    expect(name).toMatch(/\.zip$/i)
    expect(name).not.toContain(':')
  })

  it('debug: prefijo powerbi-etl-debug_', () => {
    const name = buildPowerBiZipDownloadName(new Date(2026, 4, 17, 12, 0, 0), 'debug')
    expect(name).toMatch(/^powerbi-etl-debug_2026-05-17_/)
  })
})

describe('buildCommitteePowerBiMinimalExport (export comité · 5 CSV)', () => {
  it('solo incluye filenames de POWER_BI_COMMITTEE_FILENAMES y BOM UTF-8', () => {
    const events: RealJourneyEventDto[] = [
      baseEvent({
        id: 1,
        occurredAt: '2026-05-17T08:00:00.000Z',
        recordedAt: '2026-05-17T08:00:00.000Z',
        sectorCode: 'RICARDONE_INGRESO_CAMIONES',
        deviceCode: 'RicIngCamFrente',
      }),
    ]
    const committee = buildCommitteeOperationalPipeline(events, [])
    const iso = '2026-05-17T12:00:00.000Z'
    const bundle = buildCommitteePowerBiMinimalExport({
      apiBaseUrl: 'http://example.test:8090',
      exportedAtIso: iso,
      lastLoadedAt: iso,
      eventsRawRicardone: events,
      alertsRaw: [],
      committee,
    })
    expect(bundle).toHaveLength(POWER_BI_COMMITTEE_FILE_COUNT)
    expect(POWER_BI_COMMITTEE_FILE_COUNT).toBe(5)
    const names = bundle.map((b) => b.filename).sort()
    expect(names).toEqual(Object.values(POWER_BI_COMMITTEE_FILENAMES).slice().sort())
    for (const f of bundle) {
      expect(f.csv.charCodeAt(0)).toBe(0xfeff)
    }
    expect(bundle.some((f) => f.filename === POWER_BI_ETL_FILENAMES.raw_events_api)).toBe(false)
    expect(bundle.some((f) => f.filename === POWER_BI_ETL_FILENAMES.etl_summary)).toBe(false)
  })
})

describe('buildCommitteePowerBiEtlExport (contrato CSV Power BI · debug)', () => {
  it('genera el bundle legacy + circuitos ETL v2 (nombres fijos en POWER_BI_ETL_FILENAMES y BOM UTF-8)', () => {
    const events: RealJourneyEventDto[] = [
      baseEvent({
        id: 1,
        sequenceNumber: 1,
        occurredAt: '2026-05-17T08:00:00.000Z',
        recordedAt: '2026-05-17T08:00:00.000Z',
        sectorCode: 'RICARDONE_INGRESO_CAMIONES',
        deviceCode: 'RicIngCamFrente',
      }),
      baseEvent({
        id: 2,
        sequenceNumber: 2,
        occurredAt: '2026-05-17T09:00:00.000Z',
        recordedAt: '2026-05-17T09:00:00.000Z',
        sectorCode: 'RICARDONE_EGRESO_CAMIONES',
        deviceCode: 'RicEgrCamFrente',
      }),
    ]
    const alerts: RealAlertDto[] = []
    const committee = buildCommitteeOperationalPipeline(events, alerts)
    const iso = '2026-05-17T12:00:00.000Z'
    const bundle = buildCommitteePowerBiEtlExport({
      apiBaseUrl: 'http://example.test:8090',
      queryStart: '2026-05-17',
      queryEnd: '2026-05-17',
      exportedAtIso: iso,
      lastLoadedAt: iso,
      eventsRawRicardone: events,
      alertsRaw: alerts,
      committee,
    })

    expect(bundle).toHaveLength(POWER_BI_ETL_DEBUG_FILE_COUNT)
    expect(POWER_BI_ETL_DEBUG_FILE_COUNT).toBe(Object.keys(POWER_BI_ETL_FILENAMES).length)
    const names = bundle.map((b) => b.filename).sort()
    expect(names).toEqual(Object.values(POWER_BI_ETL_FILENAMES).slice().sort())
    for (const f of bundle) {
      expect(f.csv.charCodeAt(0)).toBe(0xfeff)
    }
  })

  it('las cabeceras coinciden con POWER_BI_CSV_HEADERS', () => {
    const events: RealJourneyEventDto[] = [
      baseEvent({
        id: 1,
        occurredAt: '2026-05-17T08:00:00.000Z',
        recordedAt: '2026-05-17T08:00:00.000Z',
      }),
      baseEvent({
        id: 2,
        sequenceNumber: 2,
        occurredAt: '2026-05-17T09:00:00.000Z',
        recordedAt: '2026-05-17T09:00:00.000Z',
        sectorCode: 'RICARDONE_EGRESO_CAMIONES',
        deviceCode: 'RicEgrCamFrente',
      }),
    ]
    const committee = buildCommitteeOperationalPipeline(events, [])
    const iso = '2026-05-17T12:00:00.000Z'
    const bundle = buildCommitteePowerBiEtlExport({
      apiBaseUrl: 'http://example.test:8090',
      exportedAtIso: iso,
      lastLoadedAt: iso,
      eventsRawRicardone: events,
      alertsRaw: [],
      committee,
    })

    const byName = Object.fromEntries(bundle.map((b) => [b.filename, b.csv]))

    expect(csvFirstRow(byName[POWER_BI_ETL_FILENAMES.raw_events_api])).toEqual([...POWER_BI_CSV_HEADERS.raw_events_api])
    expect(csvFirstRow(byName[POWER_BI_ETL_FILENAMES.raw_alerts_api])).toEqual([...POWER_BI_CSV_HEADERS.raw_alerts_api])
    expect(csvFirstRow(byName[POWER_BI_ETL_FILENAMES.clean_events])).toEqual([...POWER_BI_CSV_HEADERS.clean_events])
    expect(csvFirstRow(byName[POWER_BI_ETL_FILENAMES.clean_alerts])).toEqual([...POWER_BI_CSV_HEADERS.clean_alerts])
    expect(csvFirstRow(byName[POWER_BI_ETL_FILENAMES.clean_circuits])).toEqual([...POWER_BI_CSV_HEADERS.clean_circuits])
    expect(csvFirstRow(byName[POWER_BI_ETL_FILENAMES.camera_diagnostics])).toEqual([...POWER_BI_CSV_HEADERS.camera_diagnostics])
    expect(csvFirstRow(byName[POWER_BI_ETL_FILENAMES.alert_summary])).toEqual([...POWER_BI_CSV_HEADERS.alert_summary])
    expect(csvFirstRow(byName[POWER_BI_ETL_FILENAMES.etl_summary])).toEqual([...POWER_BI_CSV_HEADERS.etl_summary])
  })

  it('clean_circuits.csv: tabla de circuitos por journey_uid con columnas clave para modelo principal', () => {
    const events: RealJourneyEventDto[] = [
      baseEvent({
        id: 1,
        occurredAt: '2026-05-17T08:00:00.000Z',
        sectorCode: 'RICARDONE_INGRESO_CAMIONES',
        deviceCode: 'RicIngCamFrente',
      }),
      baseEvent({
        id: 2,
        sequenceNumber: 2,
        occurredAt: '2026-05-17T09:00:00.000Z',
        sectorCode: 'RICARDONE_EGRESO_CAMIONES',
        deviceCode: 'RicEgrCamFrente',
      }),
    ]
    const committee = buildCommitteeOperationalPipeline(events, [])
    const bundle = buildCommitteePowerBiEtlExport({
      apiBaseUrl: 'http://example.test:8090',
      exportedAtIso: new Date().toISOString(),
      lastLoadedAt: new Date().toISOString(),
      eventsRawRicardone: events,
      alertsRaw: [],
      committee,
    })
    const csv = bundle.find((b) => b.filename === POWER_BI_ETL_FILENAMES.clean_circuits)!.csv
    const headers = csvFirstRow(csv)
    expect(headers).toContain('journey_uid')
    expect(headers).toContain('preliminary_circuit_code')
    expect(headers).toContain('included_in_clean_layer')
    expect(headers).toContain('committee_operational_circuit')
    const row1 = csvSecondRow(csv)
    const rec = rowToRecord(headers, row1)
    expect(rec.journey_uid).toBeTruthy()
    expect(rec.preliminary_circuit_code).toBeTruthy()
    expect(['true', 'false']).toContain(rec.included_in_clean_layer)
  })

  it('camera_diagnostics.csv: una fila por device+sector con columnas usadas en diagnóstico por cámara', () => {
    const events: RealJourneyEventDto[] = [
      baseEvent({
        id: 1,
        occurredAt: '2026-05-17T08:00:00.000Z',
        sectorCode: 'RICARDONE_INGRESO_CAMIONES',
        deviceCode: 'RicIngCamFrente',
      }),
      baseEvent({
        id: 2,
        sequenceNumber: 2,
        occurredAt: '2026-05-17T09:00:00.000Z',
        sectorCode: 'RICARDONE_EGRESO_CAMIONES',
        deviceCode: 'RicEgrCamFrente',
      }),
    ]
    const committee = buildCommitteeOperationalPipeline(events, [])
    const bundle = buildCommitteePowerBiEtlExport({
      apiBaseUrl: 'http://example.test:8090',
      exportedAtIso: new Date().toISOString(),
      lastLoadedAt: new Date().toISOString(),
      eventsRawRicardone: events,
      alertsRaw: [],
      committee,
    })
    const csv = bundle.find((b) => b.filename === POWER_BI_ETL_FILENAMES.camera_diagnostics)!.csv
    const lines = csv.split(/\r?\n/).filter(Boolean)
    expect(lines.length).toBeGreaterThanOrEqual(2)
    const headers = csvFirstRow(csv)
    expect(headers).toContain('device_code')
    expect(headers).toContain('sector_code')
    expect(headers).toContain('suggested_status')
    expect(headers).toContain('lpr_per_100_events')
    expect(headers).toContain('recommended_action')
  })

  it('clean_alerts: exporta todas las alertas aligned del comité aunque no estén en clean_events.relatedAlerts', () => {
    const events: RealJourneyEventDto[] = [
      baseEvent({
        id: 1,
        journeyUid: 'j-lpr-trip',
        occurredAt: '2026-05-17T10:05:00.000Z',
        recordedAt: '2026-05-17T10:05:00.000Z',
        sectorCode: 'RICARDONE_INGRESO_CAMIONES',
        deviceCode: 'RicIngCamFrente',
      }),
    ]
    const alerts: RealAlertDto[] = [
      {
        id: 'alt-991',
        journeyUid: 'j-lpr-trip',
        occurredAt: '2026-05-17T10:05:42.000Z',
        recordedAt: '2026-05-17T10:05:42.000Z',
        sectorCode: 'RICARDONE_INGRESO_CAMIONES',
        deviceCode: 'RicIngCamFrente',
        alertType: 'LPR_MALFUNCTION',
        reason: 'Sin lectura',
        message: 'LPR offline',
      },
    ]
    const committee = buildCommitteeOperationalPipeline(events, alerts)
    expect(committee.alertsAlignedToSegments.length).toBeGreaterThan(0)

    const bundle = buildCommitteePowerBiEtlExport({
      apiBaseUrl: 'http://example.test:8090',
      exportedAtIso: new Date().toISOString(),
      lastLoadedAt: new Date().toISOString(),
      eventsRawRicardone: events,
      alertsRaw: alerts,
      committee,
    })

    const cleanAlertsCsv = bundle.find((b) => b.filename === POWER_BI_ETL_FILENAMES.clean_alerts)!.csv
    const dataLines = cleanAlertsCsv.split(/\r?\n/).filter(Boolean)
    expect(dataLines.length - 1).toBe(committee.alertsAlignedToSegments.length)

    const sumCsv = bundle.find((b) => b.filename === POWER_BI_ETL_FILENAMES.etl_summary)!.csv
    const sh = csvFirstRow(sumCsv)
    const sr = csvSecondRow(sumCsv)
    const srec = rowToRecord(sh, sr)
    expect(srec.clean_alerts_count).toBe(String(dataLines.length - 1))

    const alertCsv = bundle.find((b) => b.filename === POWER_BI_ETL_FILENAMES.alert_summary)!.csv
    expect(csvFirstRow(alertCsv)).toEqual([...POWER_BI_CSV_HEADERS.alert_summary])
    expect(alertCsv.split(/\r?\n/).filter(Boolean).length).toBeGreaterThanOrEqual(2)

    const hdr = csvFirstRow(cleanAlertsCsv)
    const r1 = csvSecondRow(cleanAlertsCsv)
    const first = rowToRecord(hdr, r1)
    expect(hdr).toContain('has_related_event')
    expect(hdr).toContain('etl_status')
    expect(['true', 'false']).toContain(first.has_related_event)
  })

  it('etl_summary.csv: una fila, schema_version y conteos numéricos parseables para cards', () => {
    const events: RealJourneyEventDto[] = [
      baseEvent({ id: 1, occurredAt: '2026-05-17T08:00:00.000Z' }),
      baseEvent({
        id: 2,
        sequenceNumber: 2,
        occurredAt: '2026-05-17T09:00:00.000Z',
        sectorCode: 'RICARDONE_EGRESO_CAMIONES',
        deviceCode: 'RicEgrCamFrente',
      }),
    ]
    const committee = buildCommitteeOperationalPipeline(events, [])
    const bundle = buildCommitteePowerBiEtlExport({
      apiBaseUrl: 'http://example.test:8090',
      queryStart: '2026-05-17',
      queryEnd: '2026-05-17',
      exportedAtIso: '2026-05-17T12:00:00.000Z',
      lastLoadedAt: '2026-05-17T11:00:00.000Z',
      eventsRawRicardone: events,
      alertsRaw: [],
      committee,
    })
    const csv = bundle.find((b) => b.filename === POWER_BI_ETL_FILENAMES.etl_summary)!.csv
    const lines = csv.split(/\r?\n/).filter(Boolean)
    expect(lines.length).toBe(2)

    const headers = csvFirstRow(csv)
    const row = csvSecondRow(csv)
    const rec = rowToRecord(headers, row)
    expect(rec.schema_version).toBe(POWER_BI_ETL_SCHEMA_VERSION)
    expect(rec.query_start).toBe('2026-05-17')
    expect(rec.selected_start_datetime).toBe('2026-05-17')
    expect(rec.generated_at).toBe('2026-05-17T12:00:00.000Z')
    expect(rec.raw_events_count).toBe('2')
    expect(rec.raw_events_ricardone_count).toBe('2')
    expect(rec.clean_alerts_count).toBe('0')

    const numericKeys = [
      'raw_events_count',
      'raw_events_ricardone_count',
      'raw_alerts_fetched_count',
      'committee_segmented_event_count',
      'clean_layer_clean_event_rows',
      'clean_layer_clean_journey_rows',
      'dataset_reconstructed_journey_count',
    ] as const
    for (const k of numericKeys) {
      expect(Number.isFinite(Number(rec[k]))).toBe(true)
    }
  })
})
