import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadRealJourneyEventsFromFile,
  loadRealJourneyEventsFromApi,
  DEFAULT_REAL_JOURNEY_EVENTS_FILE,
  RECOMMENDED_JOURNEY_EXPORT_START_DATE,
  RECOMMENDED_JOURNEY_EXPORT_END_DATE,
} from '../services/realJourneyEventsDataSource'
import {
  reconstructRealJourneys,
  compareRealEvents,
  excludePuertoSanLorenzoSectorEvents,
  filterValidPlateRealEvents,
} from '../services/realJourneyEventsMapper'
import { buildIncompleteSequenceGroups } from '../services/realIncompleteAnalysis'
import {
  buildPlateEventRows,
  detectRicardoneEgressToSanLorenzoWindow,
  exportPlateEventsToCsv,
  filterEventsByPlate,
  normalizePlateQuery,
  plateMatchesQuery,
  plateSearchQueryIsValidArgentinaFormat,
  summarizeQualityFlagsAcross,
} from '../services/realPlateAudit'
import {
  buildRealDataDailySummary,
  buildPlateRowsByDay,
  occurredAtLocalDayKey,
  occurredAtCalendarBounds,
  enumerateLocalDatesInclusive,
} from '../services/realJourneyQuality'
import { buildPreliminaryCircuitDailySummary, enrichCaladaSanLorenzoConfidence } from '../services/realPreliminaryCircuit'
import {
  buildOperationalDepurationSnapshot,
  journeyMatchesOperationalScope,
  type OperationalJourneyScopeFilter,
} from '../services/realJourneyDepurationMap'
import { buildPlateQualitySummary } from '../services/realPlateQuality'
import { buildCameraCoverageSummary } from '../services/realCameraCoverage'
import { normalizeRealEventPoint } from '../services/realEventNormalization'
import type { IncompleteSequenceGroup } from '../services/realIncompleteAnalysis'
import { RealJourneyDiagnosticsView, type JourneyQuickFilter, type RealDataMainTab } from './RealJourneyDiagnosticsView'
import type { RealJourneyEventDto, ReconstructedRealJourney } from '../services/realJourneyEvents.types'

function formatCalendarDayOptionLabel(
  dayKey: string,
  eventCount: number | undefined,
  countLabel: 'valid' | 'all_reads'
): string {
  try {
    const parts = dayKey.split('-').map(Number)
    const dt = new Date(parts[0], parts[1] - 1, parts[2])
    const w = dt.toLocaleDateString(undefined, { weekday: 'short' })
    const n = eventCount ?? 0
    const tag = countLabel === 'all_reads' ? 'evt (lecturas totales)' : 'evt (pat. válida)'
    return n > 0 ? `${dayKey} (${w}) — ${n} ${tag}` : `${dayKey} (${w}) — sin datos`
  } catch {
    return dayKey
  }
}

type RealDataSource = 'api' | 'file'

const CALADA_INTERPLANT_MS = 12 * 3600 * 1000

/** Misma lista que OPS_KPI_PRELIMS en `realJourneyDepurationMap`; solo para vista ejecutiva sin tocar KPIs. */
const OPS_KPI_PRELIMS = new Set<string>([
  'PRELIM_RIC_LOOP_BALANZA',
  'PRELIM_RIC_DESCARGA_VOLCABLE',
  'PRELIM_RIC_LIQUIDO_PROBABLE',
  'PRELIM_RIC_DESCARGA_NO_VOLCABLE',
  'PRELIM_RIC_CALADA_A_SAN_LORENZO',
  'PRELIM_RIC_INGRESO_EGRESO_VALIDO',
  'PRELIM_RIC_PREINGRESO_EGRESO_VALIDO',
  'PRELIM_RIC_INGRESO_BALANZA_VALIDO',
  'PRELIM_RIC_PREINGRESO_BALANZA_VALIDO',
])

const INC_PRELIM_FILTERS = new Set<JourneyQuickFilter>([
  'inc_prelim',
  'inc_prelim_grouped',
  'inc_prelim_with_ing',
  'inc_prelim_without_ing',
  'inc_prelim_with_bal',
  'inc_prelim_with_volc',
  'inc_prelim_with_egr',
  'inc_prelim_sl',
])

function isPreliminaryIncomplete(j: ReconstructedRealJourney): boolean {
  return j.preliminaryCircuitCode === 'PRELIM_INCOMPLETO'
}

function journeyMatchesIncompleteVariant(j: ReconstructedRealJourney, f: JourneyQuickFilter): boolean {
  if (!isPreliminaryIncomplete(j)) return false
  const codes = new Set(j.logicalCodeSequence)
  switch (f) {
    case 'inc_prelim':
    case 'inc_prelim_grouped':
      return true
    case 'inc_prelim_with_ing':
      return codes.has('INGRESO')
    case 'inc_prelim_without_ing':
      return !codes.has('INGRESO')
    case 'inc_prelim_with_bal':
      return (
        codes.has('BALANZA_INGRESO') ||
        codes.has('BALANZA_EGRESO') ||
        codes.has('BALANZA') ||
        j.hasBalanza
      )
    case 'inc_prelim_with_volc':
      return codes.has('VOLCABLE') || j.hasVolcable
    case 'inc_prelim_with_egr':
      return codes.has('EGRESO')
    case 'inc_prelim_sl':
      return codes.has('SL_INGRESO')
    default:
      return false
  }
}

function journeyMatchesQuickFilter(j: ReconstructedRealJourney, f: JourneyQuickFilter): boolean {
  if (INC_PRELIM_FILTERS.has(f)) return journeyMatchesIncompleteVariant(j, f)
  if (f === 'all') return true
  if (f === 'complete_minimal') return j.isCompleteMinimal
  if (f === 'incomplete') return !j.isCompleteMinimal
  if (f === 'solo_ingreso') return j.qualityFlags.includes('SOLO_INGRESO')
  if (f === 'solo_egreso') return j.qualityFlags.includes('SOLO_EGRESO')
  if (f === 'solo_volcable') return j.qualityFlags.includes('SOLO_VOLCABLE')
  if (f === 'volcable_ingreso') return j.qualityFlags.includes('VOLCABLE_CON_INGRESO')
  if (f === 'volcable_complete') return j.qualityFlags.includes('VOLCABLE_COMPLETO_MINIMO')
  if (f === 'mixed') return j.qualityFlags.includes('MIXTO_RICARDONE_SAN_LORENZO')
  if (f === 'long') return j.qualityFlags.includes('JOURNEY_SOSPECHOSO_LARGO')
  if (f === 'repeat') return j.qualityFlags.includes('JOURNEY_REPETICION_MISMO_SECTOR')
  return true
}

/** Vista de diagnóstico: datos reales desde API o archivo local. */
export function RealJourneyDiagnosticsPage() {
  const [dataSource, setDataSource] = useState<RealDataSource>('api')
  const [apiStartDate, setApiStartDate] = useState(RECOMMENDED_JOURNEY_EXPORT_START_DATE)
  const [apiEndDate, setApiEndDate] = useState(RECOMMENDED_JOURNEY_EXPORT_END_DATE)

  const [filePath, setFilePath] = useState(DEFAULT_REAL_JOURNEY_EVENTS_FILE)
  const [eventsUnfiltered, setEventsUnfiltered] = useState<RealJourneyEventDto[]>([])
  const [events, setEvents] = useState<RealJourneyEventDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedDay, setSelectedDay] = useState('')
  const [journeyQuickFilter, setJourneyQuickFilter] = useState<JourneyQuickFilter>('all')
  const [prelimCircuitFilter, setPrelimCircuitFilter] = useState('')
  const [plateQuery, setPlateQuery] = useState('')
  const [onlyThisPlateScope, setOnlyThisPlateScope] = useState(false)
  const [interplantWindowHours, setInterplantWindowHours] = useState(12)
  /** Default: NO — análisis operativo sólo patentes válidas; opción diagnostic amplía conteos en selector de día. */
  const [includeInvalidPlateDiagnostics, setIncludeInvalidPlateDiagnostics] = useState(false)
  const [depurationScopeFilter, setDepurationScopeFilter] =
    useState<OperationalJourneyScopeFilter>('all')
  const [mainTab, setMainTab] = useState<RealDataMainTab>('resumen')
  const [drawerCircuitCode, setDrawerCircuitCode] = useState<string | null>(null)
  const [drawerIncompleteGroup, setDrawerIncompleteGroup] = useState<IncompleteSequenceGroup | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list =
        dataSource === 'api'
          ? await loadRealJourneyEventsFromApi(apiStartDate.trim(), apiEndDate.trim())
          : await loadRealJourneyEventsFromFile(filePath.trim() || undefined)
      const ricardoneOnly = excludePuertoSanLorenzoSectorEvents(list)
      setEventsUnfiltered(list)
      setEvents(ricardoneOnly)
    } catch (e) {
      setEventsUnfiltered([])
      setEvents([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [dataSource, apiStartDate, apiEndDate, filePath])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (journeyQuickFilter !== 'inc_prelim_grouped') return
    setMainTab('incompletos')
  }, [journeyQuickFilter])

  const journeysBatch = useMemo(() => reconstructRealJourneys(events), [events])
  const journeys = useMemo(
    () => enrichCaladaSanLorenzoConfidence(journeysBatch, eventsUnfiltered, CALADA_INTERPLANT_MS),
    [journeysBatch, eventsUnfiltered]
  )

  const journeysFullPipelineBatch = useMemo(() => reconstructRealJourneys(eventsUnfiltered), [eventsUnfiltered])
  const journeysFullPipeline = useMemo(
    () =>
      enrichCaladaSanLorenzoConfidence(journeysFullPipelineBatch, eventsUnfiltered, CALADA_INTERPLANT_MS),
    [journeysFullPipelineBatch, eventsUnfiltered]
  )

  const journeysOperational = useMemo(
    () => journeys.filter((j) => j.feedsOperationalAnalytics),
    [journeys]
  )

  const depurationSnapshot = useMemo(() => buildOperationalDepurationSnapshot(events, journeys), [events, journeys])
  const operationalEvents = useMemo(() => filterValidPlateRealEvents(events), [events])

  const plateQualitySummary = useMemo(() => buildPlateQualitySummary(events), [events])

  const plateNorm = useMemo(() => normalizePlateQuery(plateQuery), [plateQuery])

  const plateQueryFormatWarning = Boolean(plateNorm && !plateSearchQueryIsValidArgentinaFormat(plateQuery))

  const plateEventsAll = useMemo(
    () => (plateNorm ? filterEventsByPlate(eventsUnfiltered, plateQuery) : []),
    [eventsUnfiltered, plateQuery, plateNorm]
  )

  const plateJourneysBatch = useMemo(
    () => (plateEventsAll.length ? reconstructRealJourneys(plateEventsAll) : []),
    [plateEventsAll]
  )
  const plateJourneysFull = useMemo(
    () =>
      plateJourneysBatch.length
        ? enrichCaladaSanLorenzoConfidence(plateJourneysBatch, eventsUnfiltered, CALADA_INTERPLANT_MS)
        : [],
    [plateJourneysBatch, eventsUnfiltered]
  )

  const journeyByUidPlate = useMemo(() => {
    const m = new Map<string, ReconstructedRealJourney>()
    for (const j of plateJourneysFull) m.set(j.journeyUid, j)
    return m
  }, [plateJourneysFull])

  const plateTimelineRows = useMemo(
    () => buildPlateEventRows(plateEventsAll, journeyByUidPlate),
    [plateEventsAll, journeyByUidPlate]
  )

  const interplantHintsForPlate = useMemo(
    () =>
      plateJourneysFull.length
        ? detectRicardoneEgressToSanLorenzoWindow(plateJourneysFull, interplantWindowHours * 3600000)
        : [],
    [plateJourneysFull, interplantWindowHours]
  )

  const dailySummaries = useMemo(
    () => buildRealDataDailySummary(operationalEvents, journeysOperational),
    [operationalEvents, journeysOperational]
  )

  const eventCountValidByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of dailySummaries) {
      if (row.day) m.set(row.day, row.eventCount)
    }
    return m
  }, [dailySummaries])

  const eventCountAllRicardoneByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of events) {
      const d = occurredAtLocalDayKey(e.occurredAt)
      if (d) m.set(d, (m.get(d) ?? 0) + 1)
    }
    return m
  }, [events])

  const { minDay: eventMinDay, maxDay: eventMaxDay } = useMemo(
    () => occurredAtCalendarBounds(events),
    [events]
  )
  const calendarDayOptions = useMemo(
    () => enumerateLocalDatesInclusive(eventMinDay, eventMaxDay),
    [eventMinDay, eventMaxDay]
  )

  const eventCountByCalendarDay = useMemo(() => {
    return includeInvalidPlateDiagnostics ? eventCountAllRicardoneByDay : eventCountValidByDay
  }, [includeInvalidPlateDiagnostics, eventCountAllRicardoneByDay, eventCountValidByDay])

  const calendarDayPickerIndex =
    selectedDay && calendarDayOptions.length ? calendarDayOptions.indexOf(selectedDay) : -1

  const plateRowsByDay = useMemo(() => buildPlateRowsByDay(operationalEvents), [operationalEvents])

  const journeysScopedOperational = useMemo(
    () =>
      selectedDay ? journeysOperational.filter((j) => j.day === selectedDay) : journeysOperational,
    [journeysOperational, selectedDay]
  )

  const prelimCircuitCardMetrics = useMemo(() => {
    const list = journeysScopedOperational
    const n = (code: string) => list.filter((j) => j.preliminaryCircuitCode === code).length
    return {
      totalOperational: list.length,
      volcable: n('PRELIM_RIC_DESCARGA_VOLCABLE'),
      sinVolcable: n('PRELIM_RIC_DESCARGA_NO_VOLCABLE'),
      caladaSl: n('PRELIM_RIC_CALADA_A_SAN_LORENZO'),
      liquido: n('PRELIM_RIC_LIQUIDO_PROBABLE'),
      loopBalanza: n('PRELIM_RIC_LOOP_BALANZA'),
      soloVolcable: n('PRELIM_SOLO_VOLCABLE'),
      incompletos: n('PRELIM_INCOMPLETO'),
      minIngEgr: n('PRELIM_RIC_INGRESO_EGRESO_VALIDO'),
      minPreEg: n('PRELIM_RIC_PREINGRESO_EGRESO_VALIDO'),
      partialIngBal: n('PRELIM_RIC_INGRESO_BALANZA_VALIDO'),
      partialPreBal: n('PRELIM_RIC_PREINGRESO_BALANZA_VALIDO'),
    }
  }, [journeysScopedOperational])

  const prelimCircuitDailyRows = useMemo(
    () => buildPreliminaryCircuitDailySummary(journeys),
    [journeys]
  )
  const prelimCircuitDailyFiltered = useMemo(
    () => (selectedDay ? prelimCircuitDailyRows.filter((r) => r.day === selectedDay) : prelimCircuitDailyRows),
    [prelimCircuitDailyRows, selectedDay]
  )

  const journeysForTablePipeline = useMemo(
    () => (journeyQuickFilter === 'inc_prelim_sl' ? journeysFullPipeline : journeys),
    [journeyQuickFilter, journeysFullPipeline, journeys]
  )

  const filteredJourneys = useMemo(() => {
    return journeysForTablePipeline.filter((j) => {
      if (selectedDay && j.day !== selectedDay) return false
      if (prelimCircuitFilter && j.preliminaryCircuitCode !== prelimCircuitFilter) return false
      if (!journeyMatchesOperationalScope(j, depurationScopeFilter)) return false
      if (onlyThisPlateScope && plateNorm && !plateMatchesQuery(j.normalizedPlate, plateNorm)) return false
      return journeyMatchesQuickFilter(j, journeyQuickFilter)
    })
  }, [
    journeysForTablePipeline,
    selectedDay,
    prelimCircuitFilter,
    depurationScopeFilter,
    journeyQuickFilter,
    onlyThisPlateScope,
    plateNorm,
  ])

  const journeysForIncompleteAnalysis = useMemo(() => {
    let list = journeysOperational
    if (selectedDay) list = list.filter((j) => j.day === selectedDay)
    if (onlyThisPlateScope && plateNorm) list = list.filter((j) => plateMatchesQuery(j.normalizedPlate, plateNorm))
    return list
  }, [journeysOperational, selectedDay, onlyThisPlateScope, plateNorm])

  const incompleteGroups = useMemo(
    () => buildIncompleteSequenceGroups(journeysForIncompleteAnalysis),
    [journeysForIncompleteAnalysis]
  )

  const incompleteTotal = useMemo(
    () => journeysForIncompleteAnalysis.filter((j) => j.preliminaryCircuitCode === 'PRELIM_INCOMPLETO').length,
    [journeysForIncompleteAnalysis]
  )

  const incompleteRankings = useMemo(() => {
    const inc = journeysForIncompleteAnalysis.filter((j) => j.preliminaryCircuitCode === 'PRELIM_INCOMPLETO')
    const top5 = incompleteGroups.slice(0, 5).reduce((s, g) => s + g.count, 0)
    const pctTop5 = incompleteTotal > 0 ? (top5 / incompleteTotal) * 100 : 0
    const codes = (j: ReconstructedRealJourney) => new Set(j.logicalCodeSequence)
    return {
      topSignature: incompleteGroups[0]?.signature ?? '—',
      topCount: incompleteGroups[0]?.count ?? 0,
      pctTop5,
      withIngreso: inc.filter((j) => codes(j).has('INGRESO')).length,
      withBalanza: inc.filter((j) => j.hasBalanza || [...codes(j)].some((c) => c.startsWith('BALANZA'))).length,
      withVolcable: inc.filter((j) => j.hasVolcable || codes(j).has('VOLCABLE')).length,
      withEgreso: inc.filter((j) => codes(j).has('EGRESO')).length,
      onlySlFull: inc.filter((j) => {
        const tracked = ['INGRESO', 'PREINGRESO', 'BALANZA_INGRESO', 'BALANZA_EGRESO', 'VOLCABLE', 'EGRESO', 'SL_INGRESO']
        const present = tracked.filter((t) => codes(j).has(t))
        return present.length === 1 && present[0] === 'SL_INGRESO'
      }).length,
    }
  }, [incompleteGroups, incompleteTotal, journeysForIncompleteAnalysis])

  const filteredPlateRows = useMemo(() => {
    let rows = !selectedDay ? plateRowsByDay : plateRowsByDay.filter((r) => r.day === selectedDay)
    if (onlyThisPlateScope && plateNorm) {
      rows = rows.filter((r) => plateMatchesQuery(r.plate, plateNorm))
    }
    return rows
  }, [plateRowsByDay, selectedDay, onlyThisPlateScope, plateNorm])

  const plateSummary = useMemo(() => {
    if (!plateEventsAll.length) return null
    const times = plateEventsAll
      .map((e) => new Date(e.occurredAt).getTime())
      .filter((t) => Number.isFinite(t))
    const days = new Set(plateEventsAll.map((e) => occurredAtLocalDayKey(e.occurredAt)).filter(Boolean))
    const sectors = new Set<string>()
    const devices = new Set<string>()
    for (const e of plateEventsAll) {
      const s = (e.sectorCode ?? '').trim()
      const d = (e.deviceCode ?? '').trim()
      if (s) sectors.add(s)
      if (d) devices.add(d)
    }
    const circuits = new Set<string>()
    for (const j of plateJourneysFull) circuits.add(j.preliminaryCircuitCode)
    const flags = summarizeQualityFlagsAcross(plateJourneysFull)
    const flagTop = [...flags.entries()].slice(0, 8)
    return {
      totalEvents: plateEventsAll.length,
      totalJourneys: plateJourneysFull.length,
      firstAt: times.length ? new Date(Math.min(...times)).toISOString() : '',
      lastAt: times.length ? new Date(Math.max(...times)).toISOString() : '',
      dayCount: days.size,
      sectors: [...sectors].sort(),
      devices: [...devices].sort(),
      circuits: [...circuits].sort(),
      flagTop,
    }
  }, [plateEventsAll, plateJourneysFull])

  const downloadPlateCsv = useCallback(() => {
    if (!plateTimelineRows.length) return
    const csv = '\uFEFF' + exportPlateEventsToCsv(plateTimelineRows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `auditoria_patente_${plateNorm || 'export'}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [plateTimelineRows, plateNorm])

  const cameraCoverageSummary = useMemo(() => buildCameraCoverageSummary(events), [events])

  const donutJourneys = useMemo(() => {
    const list = selectedDay ? journeys.filter((j) => j.day === selectedDay) : journeys
    let usefulKpi = 0
    let discarded = 0
    let incompleteReal = 0
    let diagOnly = 0
    for (const j of list) {
      if (j.isDiscardedOperational) {
        discarded++
        continue
      }
      if (!j.feedsOperationalAnalytics) continue
      if (j.preliminaryCircuitCode === 'PRELIM_INCOMPLETO') {
        incompleteReal++
      } else if (OPS_KPI_PRELIMS.has(j.preliminaryCircuitCode)) {
        usefulKpi++
      } else {
        diagOnly++
      }
    }
    return { usefulKpi, discarded, incompleteReal, diagOnly, total: list.length }
  }, [journeys, selectedDay])

  const circuitBarItems = useMemo(() => {
    const defs: { id: string; label: string; code: string }[] = [
      { id: 'min-ie', label: 'Ingreso → Egreso válido mínimo', code: 'PRELIM_RIC_INGRESO_EGRESO_VALIDO' },
      { id: 'min-pe', label: 'Preingreso → Egreso válido mínimo', code: 'PRELIM_RIC_PREINGRESO_EGRESO_VALIDO' },
      { id: 'pinb', label: 'Ingreso → Balanza válido parcial', code: 'PRELIM_RIC_INGRESO_BALANZA_VALIDO' },
      { id: 'ppb', label: 'Preingreso → Balanza válido parcial', code: 'PRELIM_RIC_PREINGRESO_BALANZA_VALIDO' },
      { id: 'nv', label: 'Descarga sin Volcable', code: 'PRELIM_RIC_DESCARGA_NO_VOLCABLE' },
      { id: 'v', label: 'Descarga Volcable', code: 'PRELIM_RIC_DESCARGA_VOLCABLE' },
      { id: 'sl', label: 'Calada probable San Lorenzo', code: 'PRELIM_RIC_CALADA_A_SAN_LORENZO' },
      { id: 'loop', label: 'Loop balanza', code: 'PRELIM_RIC_LOOP_BALANZA' },
      { id: 'inc', label: 'Incompletos reales', code: 'PRELIM_INCOMPLETO' },
    ]
    return defs.map((d) => ({
      id: d.code,
      label: d.label,
      count: journeysScopedOperational.filter((j) => j.preliminaryCircuitCode === d.code).length,
      colorClass: d.code === 'PRELIM_INCOMPLETO' ? 'bg-amber-500' : 'bg-sky-500',
    }))
  }, [journeysScopedOperational])

  const circuitSummaryRows = useMemo(() => {
    const list = journeysScopedOperational
    const by = new Map<string, ReconstructedRealJourney[]>()
    for (const j of list) {
      const c = j.preliminaryCircuitCode
      if (!by.has(c)) by.set(c, [])
      by.get(c)!.push(j)
    }
    const rows = [...by.entries()].map(([code, grp]) => {
      const durations = grp.map((g) => g.durationMinutes).sort((a, b) => a - b)
      const mean = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
      const p90Idx = durations.length ? Math.max(0, Math.ceil(durations.length * 0.9) - 1) : 0
      const p90 = durations.length ? durations[p90Idx] : 0
      const plates = new Set(grp.map((g) => (g.plate ?? '').trim()).filter(Boolean))
      const confCounts = new Map<string, number>()
      for (const g of grp) {
        const k = g.preliminaryCircuitConfidence ?? '—'
        confCounts.set(k, (confCounts.get(k) ?? 0) + 1)
      }
      const confidence = [...confCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
      return {
        code,
        count: grp.length,
        uniquePlates: plates.size,
        meanDur: Math.round(mean * 10) / 10,
        p90,
        confidence,
      }
    })
    rows.sort((a, b) => b.count - a.count)
    return rows
  }, [journeysScopedOperational])

  const drawerCircuitJourneys = useMemo(() => {
    if (!drawerCircuitCode) return []
    return journeysScopedOperational
      .filter((j) => j.preliminaryCircuitCode === drawerCircuitCode)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
      .slice(0, 40)
  }, [drawerCircuitCode, journeysScopedOperational])

  const depurationExecutiveRows = useMemo(() => {
    const g = depurationSnapshot.general
    const raw = Math.max(1, g.rawJourneyCount)
    const invalid = g.invalidPlateOnlyJourneyCount
    const soloIng = g.discardedSoloIngresoCount
    const soloEgr = g.discardedSoloEgresoCount
    const incompleteReal = journeys.filter(
      (j) => j.feedsOperationalAnalytics && j.preliminaryCircuitCode === 'PRELIM_INCOMPLETO'
    ).length
    const useful = g.operationalUsefulJourneyCount
    return [
      {
        key: 'inv',
        label: 'Patente inválida',
        count: invalid,
        pct: invalid / raw,
        reason: 'JourneyUid sin lecturas con patente Argentina válida; no entra al pipeline operativo.',
        kpi: 'No' as const,
      },
      {
        key: 'soloIng',
        label: 'Solo ingreso descartado',
        count: soloIng,
        pct: soloIng / raw,
        reason: 'Posible paso por ruta; un solo punto INGRESO Ricardone en el journey.',
        kpi: 'No' as const,
      },
      {
        key: 'soloEgr',
        label: 'Solo egreso descartado',
        count: soloEgr,
        pct: soloEgr / raw,
        reason: 'Posible paso por ruta; un solo punto EGRESO Ricardone en el journey.',
        kpi: 'No' as const,
      },
      {
        key: 'inc',
        label: 'Incompleto real',
        count: incompleteReal,
        pct: incompleteReal / raw,
        reason: 'Patrón no cubierto por reglas preliminares; útil para investigación, no para KPI primario.',
        kpi: 'Parcial' as const,
      },
      {
        key: 'ok',
        label: 'Operativo útil',
        count: useful,
        pct: useful / raw,
        reason: 'Journeys no descartados que alimentan análisis operativo en esta vista.',
        kpi: 'Sí' as const,
      },
    ]
  }, [depurationSnapshot, journeys])

  const topDiscardInfo = useMemo(() => {
    const rows = depurationSnapshot.categoryRows.filter(
      (r) => r.category.startsWith('DESCARTADO') && r.count > 0
    )
    rows.sort((a, b) => b.count - a.count)
    const top = rows[0]
    if (!top) return { label: '—', count: 0, detail: 'Sin categorías de descarte en el período.' }
    return { label: top.category, count: top.count, detail: top.interpretation }
  }, [depurationSnapshot])

  const integrityLabel = useMemo(() => {
    if (error) return { tone: 'rose' as const, text: 'Error de carga' }
    const u = depurationSnapshot.general.pctOperationalUsefulVsRaw
    if (u >= 0.72) return { tone: 'emerald' as const, text: 'Sistemas óptimos' }
    if (u >= 0.45) return { tone: 'amber' as const, text: 'Revisión recomendada' }
    return { tone: 'rose' as const, text: 'Calidad degradada' }
  }, [error, depurationSnapshot])

  const datasetQualityBadge = useMemo(() => {
    const u = depurationSnapshot.general.pctOperationalUsefulVsRaw * 100
    if (u >= 82) return { cls: 'bg-emerald-100 text-emerald-900 ring-emerald-200', text: `CALIDAD: BUENO (${u.toFixed(0)}%)` }
    if (u >= 55) return { cls: 'bg-amber-100 text-amber-900 ring-amber-200', text: `CALIDAD: MEDIA (${u.toFixed(0)}%)` }
    return { cls: 'bg-rose-100 text-rose-900 ring-rose-200', text: `CALIDAD: BAJA (${u.toFixed(0)}%)` }
  }, [depurationSnapshot])

  const cameraStatusCounts = useMemo(() => {
    const observed = cameraCoverageSummary.rows.filter((r) => r.totalEventCount > 0)
    let activas = 0
    let parciales = 0
    let baja = 0
    let repetitiva = 0
    for (const r of observed) {
      const s = r.coverageStatus
      if (s.includes('ACTIVIDAD_REPETITIVA')) repetitiva++
      else if (s.includes('ACTIVIDAD_BAJA')) baja++
      else if (s.includes('ACTIVA_PARCIAL')) parciales++
      else if (s.includes('ACTIVA_PERIODO_COMPLETO')) activas++
      else activas++
    }
    return { activas, parciales, baja, repetitiva, combos: observed.length }
  }, [cameraCoverageSummary])

  const topInvalidPlateReading = plateQualitySummary.topInvalidPlateReadings[0]?.truckPlateOriginal ?? '—'

  /** Nodos ejecutivos para búsqueda de patente (primer hit por hito). */
  const plateMilestoneTimeline = useMemo(() => {
    if (!plateEventsAll.length) return []
    type Slot = 'INGRESO' | 'PREINGRESO' | 'BALANZA' | 'EGRESO'
    const canonical: Slot[] = ['INGRESO', 'PREINGRESO', 'BALANZA', 'EGRESO']
    const sorted = [...plateEventsAll].sort(compareRealEvents)
    const found: Partial<Record<Slot, RealJourneyEventDto>> = {}

    const matchSlot = (logical: string, slot: Slot): boolean => {
      if (slot === 'BALANZA')
        return logical === 'BALANZA_INGRESO' || logical === 'BALANZA_EGRESO' || logical === 'BALANZA'
      return logical === slot
    }

    for (const ev of sorted) {
      const logical = normalizeRealEventPoint(ev).logicalCode.trim()
      for (const slot of canonical) {
        if (found[slot]) continue
        if (matchSlot(logical, slot)) found[slot] = ev
      }
    }
    return canonical.map((slot) => ({ slot, event: found[slot] }))
  }, [plateEventsAll])

  return (
    <RealJourneyDiagnosticsView
      loading={loading}
      error={error}
      dataSource={dataSource}
      setDataSource={setDataSource}
      apiStartDate={apiStartDate}
      apiEndDate={apiEndDate}
      setApiStartDate={setApiStartDate}
      setApiEndDate={setApiEndDate}
      filePath={filePath}
      setFilePath={setFilePath}
      load={load}
      includeInvalidPlateDiagnostics={includeInvalidPlateDiagnostics}
      setIncludeInvalidPlateDiagnostics={setIncludeInvalidPlateDiagnostics}
      selectedDay={selectedDay}
      setSelectedDay={setSelectedDay}
      calendarDayOptions={calendarDayOptions}
      calendarDayPickerIndex={calendarDayPickerIndex}
      eventCountByCalendarDay={eventCountByCalendarDay}
      formatCalendarDayOptionLabel={formatCalendarDayOptionLabel}
      eventMinDay={eventMinDay}
      eventMaxDay={eventMaxDay}
      prelimCircuitFilter={prelimCircuitFilter}
      setPrelimCircuitFilter={setPrelimCircuitFilter}
      journeyQuickFilter={journeyQuickFilter}
      setJourneyQuickFilter={setJourneyQuickFilter}
      depurationScopeFilter={depurationScopeFilter}
      setDepurationScopeFilter={setDepurationScopeFilter}
      onlyThisPlateScope={onlyThisPlateScope}
      setOnlyThisPlateScope={setOnlyThisPlateScope}
      plateQuery={plateQuery}
      setPlateQuery={setPlateQuery}
      plateNorm={plateNorm}
      interplantWindowHours={interplantWindowHours}
      setInterplantWindowHours={setInterplantWindowHours}
      mainTab={mainTab}
      setMainTab={setMainTab}
      journeys={journeys}
      events={events}
      plateQualitySummary={plateQualitySummary}
      depurationSnapshot={depurationSnapshot}
      donutJourneys={donutJourneys}
      prelimCircuitCardMetrics={prelimCircuitCardMetrics}
      circuitBarItems={circuitBarItems}
      circuitSummaryRows={circuitSummaryRows}
      cameraCoverageSummary={cameraCoverageSummary}
      cameraStatusCounts={cameraStatusCounts}
      topInvalidPlateReading={topInvalidPlateReading}
      plateEventsAll={plateEventsAll}
      plateJourneysFull={plateJourneysFull}
      plateSummary={plateSummary}
      plateQueryFormatWarning={plateQueryFormatWarning}
      plateTimelineRows={plateTimelineRows}
      interplantHintsForPlate={interplantHintsForPlate}
      plateMilestoneTimeline={plateMilestoneTimeline}
      downloadPlateCsv={downloadPlateCsv}
      incompleteGroups={incompleteGroups}
      incompleteTotal={incompleteTotal}
      incompleteRankings={incompleteRankings}
      depurationExecutiveRows={depurationExecutiveRows}
      topDiscardInfo={topDiscardInfo}
      integrityLabel={integrityLabel}
      datasetQualityBadge={datasetQualityBadge}
      filteredJourneys={filteredJourneys}
      filteredPlateRows={filteredPlateRows}
      prelimCircuitDailyFiltered={prelimCircuitDailyFiltered}
      drawerCircuitCode={drawerCircuitCode}
      setDrawerCircuitCode={setDrawerCircuitCode}
      drawerCircuitJourneys={drawerCircuitJourneys}
      drawerIncompleteGroup={drawerIncompleteGroup}
      setDrawerIncompleteGroup={setDrawerIncompleteGroup}
    />
  )
}
