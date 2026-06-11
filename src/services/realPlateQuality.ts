/**
 * Capa: diagnóstico — lecturas inválidas por cámara. No obligatorio en pipeline Transform.
 */
import type { RealJourneyEventDto } from './realJourneyEvents.types'

export type TopInvalidReadingRow = {
  truckPlateOriginal: string
  normalizedPlate: string
  eventCount: number
  topSectorCode: string
  topDeviceCode: string
  firstOccurredAt: string
  lastOccurredAt: string
  sampleJourneyUids: string[]
}

export type InvalidByCameraRow = {
  sectorCode: string
  deviceCode: string
  totalEvents: number
  invalidPlateEvents: number
  pctInvalid: number
  topInvalidReadingsSummary: string
}

export type PlateQualitySummaryResult = {
  totalEvents: number
  validPlateEvents: number
  invalidPlateEvents: number
  validPlateEventRatio: number
  invalidPlateEventRatio: number
  uniqueValidPlates: number
  uniqueInvalidPlateReadings: number
  invalidReadingsBySectorCode: Record<string, number>
  invalidReadingsByDeviceCode: Record<string, number>
  topInvalidPlateReadings: TopInvalidReadingRow[]
  invalidByCameraRows: InvalidByCameraRow[]
}

export function buildPlateQualitySummary(events: RealJourneyEventDto[]): PlateQualitySummaryResult {
  const totalEvents = events.length
  let validPlateEvents = 0
  let invalidPlateEvents = 0
  const invalidBySector = new Map<string, number>()
  const invalidByDevice = new Map<string, number>()
  const validPlatesSet = new Set<string>()
  const invalidReadingsSet = new Set<string>() // normalized

  /** key: truckPlate original (OCR) */
  type InvAgg = {
    normalizedPlate: string
    count: number
    bySector: Map<string, number>
    byDevice: Map<string, number>
    journeyUids: Set<string>
    times: number[]
  }
  const byOriginal = new Map<string, InvAgg>()

  /** key sector|device */
  type CamAgg = { total: number; invalid: number; invalidStrings: Map<string, number> }
  const byCamera = new Map<string, CamAgg>()

  for (const e of events) {
    const valid = e.isValidPlate === true
    const raw = (e.rawTruckPlate ?? e.truckPlate ?? '').trim()
    const norm = e.normalizedPlate ?? ''
    const sc = (e.sectorCode ?? '').trim()
    const dc = (e.deviceCode ?? '').trim()
    const camKey = `${sc}\t${dc}`

    if (!byCamera.has(camKey)) byCamera.set(camKey, { total: 0, invalid: 0, invalidStrings: new Map() })
    const cam = byCamera.get(camKey)!
    cam.total++

    if (valid) {
      validPlateEvents++
      if (norm) validPlatesSet.add(norm)
    } else {
      invalidPlateEvents++
      if (norm) invalidReadingsSet.add(norm)
      if (sc) invalidBySector.set(sc, (invalidBySector.get(sc) ?? 0) + 1)
      if (dc) invalidByDevice.set(dc, (invalidByDevice.get(dc) ?? 0) + 1)
      cam.invalid++
      const k = raw || '(vacío)'
      cam.invalidStrings.set(k, (cam.invalidStrings.get(k) ?? 0) + 1)

      if (!byOriginal.has(k)) {
        byOriginal.set(k, {
          normalizedPlate: norm,
          count: 0,
          bySector: new Map(),
          byDevice: new Map(),
          journeyUids: new Set(),
          times: [],
        })
      }
      const ag = byOriginal.get(k)!
      ag.count++
      if (sc) ag.bySector.set(sc, (ag.bySector.get(sc) ?? 0) + 1)
      if (dc) ag.byDevice.set(dc, (ag.byDevice.get(dc) ?? 0) + 1)
      const ju = (e.journeyUid ?? '').trim()
      if (ju) ag.journeyUids.add(ju)
      const t = new Date(e.occurredAt).getTime()
      if (Number.isFinite(t)) ag.times.push(t)
    }
  }

  const topInvalidPlateReadings: TopInvalidReadingRow[] = [...byOriginal.entries()]
    .map(([truckPlateOriginal, ag]) => {
      const topSector = [...ag.bySector.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
      const topDevice = [...ag.byDevice.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
      const tmin = ag.times.length ? Math.min(...ag.times) : NaN
      const tmax = ag.times.length ? Math.max(...ag.times) : NaN
      return {
        truckPlateOriginal,
        normalizedPlate: ag.normalizedPlate || '—',
        eventCount: ag.count,
        topSectorCode: topSector,
        topDeviceCode: topDevice,
        firstOccurredAt: Number.isFinite(tmin) ? new Date(tmin).toISOString() : '',
        lastOccurredAt: Number.isFinite(tmax) ? new Date(tmax).toISOString() : '',
        sampleJourneyUids: [...ag.journeyUids].slice(0, 12),
      }
    })
    .sort((a, b) => b.eventCount - a.eventCount)

  const invalidByCameraRows: InvalidByCameraRow[] = [...byCamera.entries()]
    .map(([key, agg]) => {
      const [sectorCode, deviceCode] = key.split('\t')
      const pct = agg.total > 0 ? agg.invalid / agg.total : 0
      const topStrings = [...agg.invalidStrings.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      const summary = topStrings.map(([s, n]) => `${s}(${n})`).join(', ') || '—'
      return {
        sectorCode: sectorCode || '—',
        deviceCode: deviceCode || '—',
        totalEvents: agg.total,
        invalidPlateEvents: agg.invalid,
        pctInvalid: pct,
        topInvalidReadingsSummary: summary,
      }
    })
    .sort((a, b) => b.invalidPlateEvents - a.invalidPlateEvents)

  const validPlateEventRatio = totalEvents > 0 ? validPlateEvents / totalEvents : 0
  const invalidPlateEventRatio = totalEvents > 0 ? invalidPlateEvents / totalEvents : 0

  return {
    totalEvents,
    validPlateEvents,
    invalidPlateEvents,
    validPlateEventRatio,
    invalidPlateEventRatio,
    uniqueValidPlates: validPlatesSet.size,
    uniqueInvalidPlateReadings: invalidReadingsSet.size,
    invalidReadingsBySectorCode: Object.fromEntries([...invalidBySector.entries()].sort((a, b) => b[1] - a[1])),
    invalidReadingsByDeviceCode: Object.fromEntries([...invalidByDevice.entries()].sort((a, b) => b[1] - a[1])),
    topInvalidPlateReadings,
    invalidByCameraRows,
  }
}
