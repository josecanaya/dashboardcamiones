/**
 * Capa: calidad — flags y reglas por journey (sectores Ricardone / San Lorenzo).
 * Soporte a reconstrucción y filtros; no reemplaza el clasificador ejecutivo vigente.
 */
import { lookupRealSectorCode } from '../data/realSectorCodeMap'
import type { RealJourneyEventDto } from './realJourneyEvents.types'
import type { ReconstructedRealJourneyCore, ReconstructedRealJourneyWithQuality } from './realJourneyEvents.types'

/** Códigos de sector usados en reglas de calidad (Ricardone / San Lorenzo). */
export const RICARDONE_SECTOR = {
  INGRESO: 'RICARDONE_INGRESO_CAMIONES',
  PREINGRESO: 'RICARDONE_PREINGRESO',
  BALANZA: 'RICARDONE_BALANZA',
  EGRESO: 'RICARDONE_EGRESO_CAMIONES',
  VOLCABLE_1: 'RICARDONE_VOLCABLE_1',
  VOLCABLE_2: 'RICARDONE_VOLCABLE_2',
} as const

export const SAN_LORENZO_SECTOR = {
  INGRESO: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES',
  BALANZA_INGRESO: 'PUERTO_SAN_LORENZO_BALANZA_INGRESO',
  BALANZA_SALIDA: 'PUERTO_SAN_LORENZO_BALANZA_SALIDA',
  EGRESO: 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES',
} as const

const SUSPICIOUS_LONG_MINUTES = 12 * 60
const SAME_SECTOR_DOMINANCE_THRESHOLD = 0.8

function normSector(s: string): string {
  return (s ?? '').trim()
}

function compareEventsByOccurredAtAsc(a: RealJourneyEventDto, b: RealJourneyEventDto): number {
  return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
}

function collectSectorPresence(seq: string[]) {
  const set = new Set<string>()
  for (const s of seq) {
    const n = normSector(s)
    if (n) set.add(n)
  }
  return set
}

function dominantSectorStats(seq: string[]): { code: string | null; ratio: number } {
  const n = seq.length
  if (!n) return { code: null, ratio: 0 }
  const counts = new Map<string, number>()
  for (const s of seq) {
    const k = normSector(s)
    if (!k) continue
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let bestCode: string | null = null
  let best = 0
  for (const [code, c] of counts) {
    if (c > best) {
      best = c
      bestCode = code
    }
  }
  return { code: bestCode, ratio: best / n }
}

/**
 * Fecha local YYYY-MM-DD a partir de occurredAt (ISO u otro parseable por Date).
 */
export function occurredAtLocalDayKey(occurredAt: string): string {
  const d = new Date(occurredAt)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Primera y última fecha local presente en occurredAt entre los eventos. */
export function occurredAtCalendarBounds(events: Pick<RealJourneyEventDto, 'occurredAt'>[]): {
  minDay: string
  maxDay: string
} {
  let minT = Infinity
  let maxT = -Infinity
  for (const e of events) {
    const t = new Date(e.occurredAt).getTime()
    if (!Number.isFinite(t)) continue
    minT = Math.min(minT, t)
    maxT = Math.max(maxT, t)
  }
  if (!Number.isFinite(minT) || !Number.isFinite(maxT)) return { minDay: '', maxDay: '' }
  const minDay = occurredAtLocalDayKey(new Date(minT).toISOString())
  const maxDay = occurredAtLocalDayKey(new Date(maxT).toISOString())
  return { minDay, maxDay }
}

/** Lista YYYY-MM-DD de cada día de calendario entre minDay y maxDay (inclusive). */
export function enumerateLocalDatesInclusive(minDay: string, maxDay: string): string[] {
  if (!minDay || !maxDay || minDay > maxDay) return []
  const parse = (k: string) => {
    const [y, m, d] = k.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const out: string[] = []
  const end = parse(maxDay)
  for (let cur = parse(minDay); cur <= end; cur.setDate(cur.getDate() + 1)) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const day = String(cur.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${day}`)
  }
  return out
}

export function analyzeRealJourneyQuality(j: ReconstructedRealJourneyCore): ReconstructedRealJourneyWithQuality {
  const seq = j.rawSectorSequence
  const present = collectSectorPresence(seq)

  const hasRicardoneIngreso = present.has(RICARDONE_SECTOR.INGRESO)
  const hasRicardoneEgreso = present.has(RICARDONE_SECTOR.EGRESO)
  const hasPreingreso = present.has(RICARDONE_SECTOR.PREINGRESO)
  const hasBalanza = present.has(RICARDONE_SECTOR.BALANZA)
  const hasVolcable =
    present.has(RICARDONE_SECTOR.VOLCABLE_1) || present.has(RICARDONE_SECTOR.VOLCABLE_2)
  const hasSanLorenzoIngreso = present.has(SAN_LORENZO_SECTOR.INGRESO)

  let hasRicardone = false
  let hasSanLorenzo = false
  for (const code of present) {
    if (code.startsWith('RICARDONE_')) hasRicardone = true
    if (code.startsWith('PUERTO_SAN_LORENZO_')) hasSanLorenzo = true
  }
  const isMixedPlant = hasRicardone && hasSanLorenzo

  const isCompleteMinimal = hasRicardoneIngreso && hasRicardoneEgreso
  const isSuspiciousLong = j.durationMinutes > SUSPICIOUS_LONG_MINUTES

  const { code: dominantSectorCode, ratio: dominantSectorRatio } = dominantSectorStats(seq)
  const isRepeatedSameSector =
    dominantSectorCode != null && seq.length > 0 && dominantSectorRatio > SAME_SECTOR_DOMINANCE_THRESHOLD

  const otherRelevantRicardone =
    hasPreingreso || hasBalanza || hasVolcable || hasSanLorenzoIngreso

  const qualityFlags: string[] = []

  if (isCompleteMinimal) qualityFlags.push('VIAJE_COMPLETO_MINIMO')
  else qualityFlags.push('VIAJE_INCOMPLETO')

  if (hasRicardoneIngreso) qualityFlags.push('CON_INGRESO')
  else qualityFlags.push('SIN_INGRESO')

  if (hasRicardoneEgreso) qualityFlags.push('CON_EGRESO')
  else qualityFlags.push('SIN_EGRESO')

  if (hasRicardoneIngreso && !hasRicardoneEgreso && !otherRelevantRicardone) {
    qualityFlags.push('SOLO_INGRESO')
  }

  if (hasRicardoneEgreso && !hasRicardoneIngreso) {
    qualityFlags.push('SOLO_EGRESO')
  }

  if (hasVolcable && !hasRicardoneIngreso && !hasRicardoneEgreso) {
    qualityFlags.push('SOLO_VOLCABLE')
  }

  if (hasVolcable && hasRicardoneIngreso && !hasRicardoneEgreso) {
    qualityFlags.push('VOLCABLE_CON_INGRESO')
  }

  if (hasRicardoneIngreso && hasVolcable && hasRicardoneEgreso) {
    qualityFlags.push('VOLCABLE_COMPLETO_MINIMO')
  }

  if (isMixedPlant) qualityFlags.push('MIXTO_RICARDONE_SAN_LORENZO')
  if (isSuspiciousLong) qualityFlags.push('JOURNEY_SOSPECHOSO_LARGO')
  if (isRepeatedSameSector) qualityFlags.push('JOURNEY_REPETICION_MISMO_SECTOR')

  return {
    ...j,
    hasRicardoneIngreso,
    hasRicardoneEgreso,
    hasPreingreso,
    hasBalanza,
    hasVolcable,
    hasSanLorenzoIngreso,
    isCompleteMinimal,
    isMixedPlant,
    isSuspiciousLong,
    dominantSectorCode,
    dominantSectorRatio,
    qualityFlags,
  }
}

export type RealDataDailySummary = {
  day: string
  eventCount: number
  journeyCount: number
  uniquePlateCount: number
  uniqueSectorCodeCount: number
  uniqueDeviceCodeCount: number
  /** Viajes con al menos ingreso Ricardone + egreso Ricardone (mismo journeyUid). No valida circuito logístico. */
  completeMinimalCount: number
  incompleteCount: number
  withIngresoCount: number
  withoutIngresoCount: number
  withEgresoCount: number
  withoutEgresoCount: number
  onlyIngresoCount: number
  onlyEgresoCount: number
  onlyVolcableCount: number
  volcableWithIngresoCount: number
  volcableCompleteMinimalCount: number
  mixedPlantCount: number
  suspiciousLongCount: number
  repeatedSameSectorCount: number
}

function hasFlag(j: ReconstructedRealJourneyWithQuality, f: string): boolean {
  return j.qualityFlags.includes(f)
}

export function buildRealDataDailySummary(
  events: RealJourneyEventDto[],
  journeys: ReconstructedRealJourneyWithQuality[]
): RealDataDailySummary[] {
  const daySet = new Set<string>()
  for (const e of events) {
    const k = occurredAtLocalDayKey(e.occurredAt)
    if (k) daySet.add(k)
  }
  for (const j of journeys) {
    if (j.day) daySet.add(j.day)
  }

  const days = [...daySet].sort((a, b) => a.localeCompare(b))

  return days.map((day) => {
    const eventsDay = events.filter((e) => occurredAtLocalDayKey(e.occurredAt) === day)
    const eventCount = eventsDay.length

    const plates = new Set<string>()
    const sectors = new Set<string>()
    const devices = new Set<string>()
    for (const e of eventsDay) {
      const p = (e.normalizedPlate ?? '').trim()
      if (p) plates.add(p)
      const sc = normSector(e.sectorCode)
      if (sc) sectors.add(sc)
      const dc = normSector(e.deviceCode)
      if (dc) devices.add(dc)
    }

    const jDay = journeys.filter((j) => j.day === day)

    const countFlag = (f: string) => jDay.filter((j) => hasFlag(j, f)).length

    return {
      day,
      eventCount,
      journeyCount: jDay.length,
      uniquePlateCount: plates.size,
      uniqueSectorCodeCount: sectors.size,
      uniqueDeviceCodeCount: devices.size,
      completeMinimalCount: jDay.filter((j) => j.isCompleteMinimal).length,
      incompleteCount: jDay.filter((j) => !j.isCompleteMinimal).length,
      withIngresoCount: countFlag('CON_INGRESO'),
      withoutIngresoCount: countFlag('SIN_INGRESO'),
      withEgresoCount: countFlag('CON_EGRESO'),
      withoutEgresoCount: countFlag('SIN_EGRESO'),
      onlyIngresoCount: countFlag('SOLO_INGRESO'),
      onlyEgresoCount: countFlag('SOLO_EGRESO'),
      onlyVolcableCount: countFlag('SOLO_VOLCABLE'),
      volcableWithIngresoCount: countFlag('VOLCABLE_CON_INGRESO'),
      volcableCompleteMinimalCount: countFlag('VOLCABLE_COMPLETO_MINIMO'),
      mixedPlantCount: countFlag('MIXTO_RICARDONE_SAN_LORENZO'),
      suspiciousLongCount: countFlag('JOURNEY_SOSPECHOSO_LARGO'),
      repeatedSameSectorCount: countFlag('JOURNEY_REPETICION_MISMO_SECTOR'),
    }
  })
}

export type SectorDayRow = {
  day: string
  sectorCode: string
  logicalSector: string
  eventCount: number
  journeyCount: number
  pctOfDayEvents: number
}

export function buildSectorRowsByDay(events: RealJourneyEventDto[]): SectorDayRow[] {
  const byDay = new Map<string, Map<string, { events: number; journeys: Set<string> }>>()

  for (const e of events) {
    const day = occurredAtLocalDayKey(e.occurredAt)
    const sc = normSector(e.sectorCode)
    if (!day || !sc) continue
    if (!byDay.has(day)) byDay.set(day, new Map())
    const m = byDay.get(day)!
    if (!m.has(sc)) m.set(sc, { events: 0, journeys: new Set() })
    const row = m.get(sc)!
    row.events += 1
    const ju = (e.journeyUid ?? '').trim()
    if (ju) row.journeys.add(ju)
  }

  const out: SectorDayRow[] = []
  const sortedDays = [...byDay.keys()].sort((a, b) => a.localeCompare(b))
  for (const day of sortedDays) {
    const dayEvents = events.filter((e) => occurredAtLocalDayKey(e.occurredAt) === day).length
    const m = byDay.get(day)!
    const codes = [...m.keys()].sort((a, b) => a.localeCompare(b))
    for (const sectorCode of codes) {
      const cell = m.get(sectorCode)!
      const entry = lookupRealSectorCode(sectorCode)
      out.push({
        day,
        sectorCode,
        logicalSector: entry?.logicalSector ?? '—',
        eventCount: cell.events,
        journeyCount: cell.journeys.size,
        pctOfDayEvents: dayEvents > 0 ? cell.events / dayEvents : 0,
      })
    }
  }
  return out
}

export type PlateDayRow = {
  day: string
  plate: string
  eventCount: number
  journeyCount: number
  /** Lista de sectorCode distintos (orden alfabético; diagnóstico legado). */
  sectorsDetected: string
  /** Secuencia temporal de deviceCode sin repeticiones consecutivas (lecturas ordenadas por tiempo). */
  camerasSequenceDetected: string
  firstOccurredAt: string
  lastOccurredAt: string
}

function collapseConsecutiveNonEmpty(strings: Iterable<string>): string[] {
  const out: string[] = []
  for (const raw of strings) {
    const s = (raw ?? '').trim()
    if (!s) continue
    if (out.length === 0 || out[out.length - 1] !== s) out.push(s)
  }
  return out
}

export function buildPlateRowsByDay(events: RealJourneyEventDto[]): PlateDayRow[] {
  type Agg = {
    events: RealJourneyEventDto[]
    journeys: Set<string>
    sectors: Set<string>
  }
  const byDayPlate = new Map<string, Map<string, Agg>>()

  for (const e of events) {
    const day = occurredAtLocalDayKey(e.occurredAt)
    const plate = (e.normalizedPlate ?? '').trim()
    if (!day || !plate) continue
    if (!byDayPlate.has(day)) byDayPlate.set(day, new Map())
    const pm = byDayPlate.get(day)!
    if (!pm.has(plate)) pm.set(plate, { events: [], journeys: new Set(), sectors: new Set() })
    const a = pm.get(plate)!
    a.events.push(e)
    if (e.journeyUid) a.journeys.add(e.journeyUid)
    const sc = normSector(e.sectorCode)
    if (sc) a.sectors.add(sc)
  }

  const out: PlateDayRow[] = []
  const days = [...byDayPlate.keys()].sort((a, b) => a.localeCompare(b))
  for (const day of days) {
    const pm = byDayPlate.get(day)!
    const plates = [...pm.keys()].sort((a, b) => a.localeCompare(b))
    for (const plate of plates) {
      const a = pm.get(plate)!
      const times = a.events
        .map((e) => new Date(e.occurredAt).getTime())
        .filter((t) => Number.isFinite(t))
      const first = times.length ? new Date(Math.min(...times)).toISOString() : ''
      const last = times.length ? new Date(Math.max(...times)).toISOString() : ''
      const sectorsList = [...a.sectors].sort((x, y) => x.localeCompare(y))
      const chronological = [...a.events].sort(compareEventsByOccurredAtAsc)
      const camerasSeq = collapseConsecutiveNonEmpty(chronological.map((e) => e.deviceCode))
      out.push({
        day,
        plate,
        eventCount: a.events.length,
        journeyCount: a.journeys.size,
        sectorsDetected: sectorsList.join(', '),
        camerasSequenceDetected: camerasSeq.join(' → '),
        firstOccurredAt: first,
        lastOccurredAt: last,
      })
    }
  }
  return out.sort((a, b) => {
    if (a.day !== b.day) return a.day.localeCompare(b.day)
    if (b.eventCount !== a.eventCount) return b.eventCount - a.eventCount
    return a.plate.localeCompare(b.plate)
  })
}
