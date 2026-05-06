import type { RealJourneyEventDto, ReconstructedRealSiteId } from './realJourneyEvents.types'
import { inferSiteIdFromSectorCode } from './realJourneyEventsMapper'
import { lookupRealSectorCode, REAL_SECTOR_CODE_MAP } from '../data/realSectorCodeMap'
import { occurredAtLocalDayKey } from './realJourneyQuality'

/**
 * Resumen de cobertura por par sectorCode + deviceCode en el período del archivo.
 * Incluye filas SIN_DATOS para sectores del mapa sin eventos (deviceCode "—").
 */

export type CameraCoverageRow = {
  sectorCode: string
  deviceCode: string
  siteId: ReconstructedRealSiteId
  logicalSector: string
  firstEventAt: string
  lastEventAt: string
  activeDayCount: number
  totalEventCount: number
  uniquePlateCount: number
  uniqueJourneyCount: number
  /** Clave YYYY-MM-DD → cantidad de eventos */
  eventsByDay: Record<string, number>
  /** Índice 0–23 → cantidad de eventos (hora local) */
  eventsByHour: number[]
  /**
   * Estado principal de cobertura temporal + alertas de actividad (varias etiquetas si aplica).
   * Orden típico: temporal (ACTIVA_*, RECIEN_*, SIN_DATOS) y luego ACTIVIDAD_BAJA / ACTIVIDAD_REPETITIVA.
   */
  coverageStatus: string
}

export type CameraCoverageArchiveMeta = {
  firstEventAtGlobal: string
  lastEventAtGlobal: string
  archiveFirstDay: string
  archiveLastDay: string
  archiveDays: string[]
  archiveDayCount: number
}

export type CameraCoverageBuildResult = {
  archive: CameraCoverageArchiveMeta
  rows: CameraCoverageRow[]
}

const EMPTY_DEVICE = '—'

function norm(s: string): string {
  return (s ?? '').trim()
}

function pairKey(sectorCode: string, deviceCode: string): string {
  return `${norm(sectorCode)}\0${norm(deviceCode)}`
}

function hourFromOccurredAtLocal(occurredAt: string): number {
  const d = new Date(occurredAt)
  if (Number.isNaN(d.getTime())) return -1
  return d.getHours()
}

function buildEmptyHours(): number[] {
  return Array.from({ length: 24 }, () => 0)
}

/**
 * Período del archivo: min/max occurredAt y días de calendario presentes.
 */
export function getCameraCoverageArchiveMeta(events: RealJourneyEventDto[]): CameraCoverageArchiveMeta {
  let firstEventAtGlobal = ''
  let lastEventAtGlobal = ''
  const daySet = new Set<string>()

  for (const e of events) {
    const t = e.occurredAt
    if (!t) continue
    const ts = new Date(t).getTime()
    if (!Number.isFinite(ts)) continue
    if (!firstEventAtGlobal || ts < new Date(firstEventAtGlobal).getTime()) firstEventAtGlobal = t
    if (!lastEventAtGlobal || ts > new Date(lastEventAtGlobal).getTime()) lastEventAtGlobal = t
    const dk = occurredAtLocalDayKey(t)
    if (dk) daySet.add(dk)
  }

  const archiveDays = [...daySet].sort((a, b) => a.localeCompare(b))
  const archiveFirstDay = archiveDays[0] ?? ''
  const archiveLastDay = archiveDays[archiveDays.length - 1] ?? ''

  return {
    firstEventAtGlobal,
    lastEventAtGlobal,
    archiveFirstDay,
    archiveLastDay,
    archiveDays,
    archiveDayCount: archiveDays.length,
  }
}

/** Heurística: < 35 % del promedio de combinaciones que sí registraron eventos. */
function isLowVolume(count: number, avgWithData: number): boolean {
  if (count <= 0) return false
  if (avgWithData <= 0) return false
  return count < Math.max(2, avgWithData * 0.35)
}

/**
 * Heurística repetitiva: muchos eventos y poca variedad de patente/journey respecto del total.
 */
function isRepetitiveActivity(
  totalEventCount: number,
  uniquePlateCount: number,
  uniqueJourneyCount: number
): boolean {
  if (totalEventCount < 24) return false
  const plateRatio = uniquePlateCount > 0 ? totalEventCount / uniquePlateCount : totalEventCount
  const journeyRatio = uniqueJourneyCount > 0 ? totalEventCount / uniqueJourneyCount : totalEventCount
  return plateRatio >= 28 || journeyRatio >= 22
}

function temporalStatus(opts: {
  hasData: boolean
  archiveDayCount: number
  activeDayCount: number
  firstDay: string
  archiveFirstDay: string
}): 'SIN_DATOS' | 'ACTIVA_PERIODO_COMPLETO' | 'ACTIVA_PARCIAL' | 'RECIEN_INCORPORADA' {
  if (!opts.hasData) return 'SIN_DATOS'
  const { archiveDayCount, activeDayCount, firstDay, archiveFirstDay } = opts
  if (archiveDayCount === 0) return 'ACTIVA_PARCIAL'

  const recien =
    !!firstDay && !!archiveFirstDay && firstDay.localeCompare(archiveFirstDay) > 0
  if (recien) return 'RECIEN_INCORPORADA'

  if (activeDayCount >= archiveDayCount) return 'ACTIVA_PERIODO_COMPLETO'
  return 'ACTIVA_PARCIAL'
}

/**
 * Agrupa eventos por sectorCode + deviceCode y deriva estado de cobertura y forma de actividad.
 */
export function buildCameraCoverageSummary(events: RealJourneyEventDto[]): CameraCoverageBuildResult {
  const archive = getCameraCoverageArchiveMeta(events)

  type Acc = {
    sectorCode: string
    deviceCode: string
    firstAt: number
    lastAt: number
    days: Set<string>
    plates: Set<string>
    journeys: Set<string>
    total: number
    byDay: Record<string, number>
    hours: number[]
  }

  const map = new Map<string, Acc>()

  for (const e of events) {
    const sc = norm(e.sectorCode)
    let dc = norm(e.deviceCode)
    if (!sc) continue
    if (!dc) dc = EMPTY_DEVICE
    const k = pairKey(sc, dc)
    const t = new Date(e.occurredAt).getTime()

    let acc = map.get(k)
    if (!acc) {
      acc = {
        sectorCode: sc,
        deviceCode: dc,
        firstAt: t,
        lastAt: t,
        days: new Set(),
        plates: new Set(),
        journeys: new Set(),
        total: 0,
        byDay: {},
        hours: buildEmptyHours(),
      }
      map.set(k, acc)
    }

    acc.total += 1
    if (Number.isFinite(t)) {
      acc.firstAt = Math.min(acc.firstAt, t)
      acc.lastAt = Math.max(acc.lastAt, t)
    }

    const dk = occurredAtLocalDayKey(e.occurredAt)
    if (dk) {
      acc.days.add(dk)
      acc.byDay[dk] = (acc.byDay[dk] ?? 0) + 1
    }

    const p = (e.normalizedPlate ?? '').trim()
    if (p) acc.plates.add(p)

    const ju = norm(e.journeyUid)
    if (ju) acc.journeys.add(ju)

    const h = hourFromOccurredAtLocal(e.occurredAt)
    if (h >= 0 && h < 24) acc.hours[h]++
  }

  const combosWithData = [...map.values()]
  const totals = combosWithData.map((c) => c.total)
  const sumEvents = totals.reduce((a, b) => a + b, 0)
  const avgWithData =
    combosWithData.length > 0 ? sumEvents / combosWithData.length : 0

  const rowsObserved: CameraCoverageRow[] = []

  for (const acc of combosWithData) {
    const firstISO = Number.isFinite(acc.firstAt)
      ? new Date(acc.firstAt).toISOString()
      : ''
    const lastISO = Number.isFinite(acc.lastAt) ? new Date(acc.lastAt).toISOString() : ''
    let firstDay = ''
    if (firstISO) {
      firstDay = occurredAtLocalDayKey(firstISO)
    }

    const primary = temporalStatus({
      hasData: true,
      archiveDayCount: archive.archiveDayCount,
      activeDayCount: acc.days.size,
      firstDay,
      archiveFirstDay: archive.archiveFirstDay,
    })

    const tags = [primary]

    const low = isLowVolume(acc.total, avgWithData)
    const rept = isRepetitiveActivity(acc.total, acc.plates.size, acc.journeys.size)
    if (low) tags.push('ACTIVIDAD_BAJA')
    if (rept) tags.push('ACTIVIDAD_REPETITIVA')

    const entryMap = lookupRealSectorCode(acc.sectorCode)

    rowsObserved.push({
      sectorCode: acc.sectorCode,
      deviceCode: acc.deviceCode,
      siteId: (entryMap?.siteId ?? inferSiteIdFromSectorCode(acc.sectorCode)) as ReconstructedRealSiteId,
      logicalSector: entryMap?.logicalSector ?? '—',
      firstEventAt: firstISO,
      lastEventAt: lastISO,
      activeDayCount: acc.days.size,
      totalEventCount: acc.total,
      uniquePlateCount: acc.plates.size,
      uniqueJourneyCount: acc.journeys.size,
      eventsByDay: { ...acc.byDay },
      eventsByHour: [...acc.hours],
      coverageStatus: tags.join(' · '),
    })
  }

  const sectorCodesSeen = new Set(events.map((e) => norm(e.sectorCode)).filter(Boolean))
  const sintRows: CameraCoverageRow[] = []

  const expectedSectors = Object.keys(REAL_SECTOR_CODE_MAP)
  for (const sectorCode of expectedSectors.sort((a, b) => a.localeCompare(b))) {
    if (sectorCodesSeen.has(sectorCode)) continue
    const entryMap = lookupRealSectorCode(sectorCode)!
    sintRows.push({
      sectorCode,
      deviceCode: EMPTY_DEVICE,
      siteId: entryMap.siteId as ReconstructedRealSiteId,
      logicalSector: entryMap.logicalSector,
      firstEventAt: '',
      lastEventAt: '',
      activeDayCount: 0,
      totalEventCount: 0,
      uniquePlateCount: 0,
      uniqueJourneyCount: 0,
      eventsByDay: {},
      eventsByHour: buildEmptyHours(),
      coverageStatus: 'SIN_DATOS',
    })
  }

  rowsObserved.sort((a, b) => {
    const s = a.sectorCode.localeCompare(b.sectorCode)
    if (s !== 0) return s
    return a.deviceCode.localeCompare(b.deviceCode)
  })

  sintRows.sort((a, b) => a.sectorCode.localeCompare(b.sectorCode))

  const rows = [...rowsObserved, ...sintRows]
  return { archive, rows }
}
