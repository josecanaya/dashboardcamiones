import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from 'react'
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
  filterRicardoneSiteEventsOnly,
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
import {
  fetchAlerts,
  fetchJourneyEvents,
  REAL_TRUCKFLOW_BASE_URL,
  resolveRealTruckflowApiOrigin,
  type RealAlertDto,
  type RealTruckflowQueryParams,
} from '../services/realTruckflowApi'
import { buildCleanRealDataset, mapCleanJourneysToHistoricalTrips } from '../services/realTruckflowCleanDataset'
import {
  applyAlertsQuickFilter,
  normalizeRealAlertForView,
  type AlertsQuickFilter,
  type NormalizedRealAlertView,
} from '../services/realAlertsInspector'
import { investigateNearbyAlerts } from '../services/nearbyAlertResearch'
import { getEventOperationalInstantIso } from '../services/liveCameraDiagnostics'
import type { IncompleteSequenceGroup } from '../services/realIncompleteAnalysis'
import { RealJourneyDiagnosticsView, type JourneyQuickFilter, type RealDataMainTab, type RealDataTimeFilterMode } from './RealJourneyDiagnosticsView'
import type { RealJourneyEventDto, ReconstructedRealJourney } from '../services/realJourneyEvents.types'
import { buildRearCameraFilterTrace } from '../services/rearCameraFilter'
import {
  buildCommitteeOperationalPipeline,
  buildCommitteeLprAlertsByCamera,
  committeeEtlHintFromMeta,
  type CommitteePipelineResult,
} from '../services/realCommitteePipeline'
import {
  buildCommitteePowerBiEtlExport,
  buildCommitteePowerBiMinimalFromSegmented,
  POWER_BI_COMMITTEE_FILENAMES,
  downloadPowerBiNamedCsvZipSync,
  triggerSinglePowerBiCsvDownload,
  type PowerBiCommitteeCsvKey,
  type PowerBiNamedCsv,
} from '../services/powerBiEtlExport'
import { ETL_DEV_MODE, ETL_MAIN_TAB_IDS, ETL_PRODUCT_TAB_IDS } from '../config/committeeEtlLite'
import { useRealTruckflowWorkspaceOptional } from '../features/real-truckflow/RealTruckflowWorkspaceContext'
import { EtlExportTab } from '../features/real-truckflow/tabs/EtlExportTab'

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

/** Deja que el navegador pinte y procese entrada antes del trabajo síncrono pesado (pipeline comité, etc.). */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    } else {
      setTimeout(resolve, 0)
    }
  })
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getRecentDefaultRange(): { startDate: string; endDate: string } {
  const today = toDateInputValue(new Date())
  return { startDate: today, endDate: today }
}

function toIsoLocalDateTime(value: Date): string {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  const hh = String(value.getHours()).padStart(2, '0')
  const mm = String(value.getMinutes()).padStart(2, '0')
  const ss = String(value.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`
}

function parsePowerBiLocalStart(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const parts = (timeStr || '00:00').split(':')
  const hh = Number(parts[0]) || 0
  const mm = Number(parts[1]) || 0
  return new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0)
}

function parsePowerBiLocalEnd(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const parts = (timeStr || '23:59').split(':')
  const hh = Number(parts[0]) || 0
  const mm = Number(parts[1]) || 0
  return new Date(y, (m || 1) - 1, d || 1, hh, mm, 59, 999)
}

type PowerBiExportLoadedState = {
  queryStart: string
  queryEnd: string
  loadedAtIso: string
  eventsReceived: number
  alertsReceived: number
  operationalEvents: number
  operationalAlerts: number
  circuitsGenerated: number
  zeroEventsNotice: boolean
  zeroAlertsNotice: boolean
  eventsRicardone: RealJourneyEventDto[]
  alertsRaw: RealAlertDto[]
  /** Para no recalcular el comité completo al exportar CSV (mismo dataset que este load). */
  committee: CommitteePipelineResult
  /** CSV comité ya generados al cargar: el click de export solo dispará descarga y no pierde el «user gesture» de Chromium. */
  committeeMinimalArtifacts: PowerBiNamedCsv[]
}

function toWeekInputValue(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function weekInputToDateRange(value: string): { start: Date; end: Date } | null {
  const match = value.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const week = Number(match[2])
  const jan4 = new Date(year, 0, 4)
  const jan4Day = jan4.getDay() || 7
  const start = new Date(year, 0, 4 - jan4Day + 1 + (week - 1) * 7)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start, end }
}

function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number>>) {
  const csv =
    '\uFEFF' +
    [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function exportSimpleBarPng(
  filename: string,
  title: string,
  items: Array<{ label: string; value: number; color: string }>
) {
  const width = 1200
  const height = 680
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 28px Arial'
  ctx.fillText(title, 40, 48)
  const max = Math.max(1, ...items.map((x) => x.value))
  const chartTop = 90
  const chartBottom = 560
  const chartHeight = chartBottom - chartTop
  const barW = Math.max(60, Math.floor((width - 120) / Math.max(1, items.length) - 30))
  items.forEach((it, i) => {
    const x = 60 + i * (barW + 30)
    const h = Math.round((it.value / max) * chartHeight)
    const y = chartBottom - h
    ctx.fillStyle = it.color
    ctx.fillRect(x, y, barW, h)
    ctx.fillStyle = '#1f2937'
    ctx.font = '12px Arial'
    ctx.fillText(it.label.slice(0, 20), x, chartBottom + 18)
    ctx.font = 'bold 12px Arial'
    ctx.fillText(String(it.value), x, y - 6)
  })
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

function buildAlertsChannelQueryNoTimeFilter(): RealTruckflowQueryParams {
  return {}
}

/** Misma lista que OPS_KPI_PRELIMS en `realJourneyDepurationMap`; solo para vista ejecutiva sin tocar KPIs. */
const OPS_KPI_PRELIMS = new Set<string>([
  'CIRCUITO_CELDA16_DESCARGA',
  'CIRCUITO_CELDA16_CARGA',
  'CIRCUITO_VOLCABLE_1_2',
  'CIRCUITO_LIQUIDO',
  'CIRCUITO_SAN_LORENZO',
  'DESPACHO_SIN_PUNTO_INSTRUMENTADO',
  'TRANSILE_VOLCABLE_BALANZA',
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
  return j.preliminaryCircuitCode === 'REGISTRO_INCOMPLETO'
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

/** Vista de diagnóstico: datos reales desde API o archivo local (implementación histórica). */
export function RealJourneyDiagnosticsPageLegacy() {
  const recentRange = getRecentDefaultRange()
  const [dataSource, setDataSource] = useState<RealDataSource>('api')
  const [apiStartDate, setApiStartDate] = useState(recentRange.startDate || RECOMMENDED_JOURNEY_EXPORT_START_DATE)
  const [apiEndDate, setApiEndDate] = useState(recentRange.endDate || RECOMMENDED_JOURNEY_EXPORT_END_DATE)
  const [timeFilterMode, setTimeFilterMode] = useState<RealDataTimeFilterMode>('day')
  const [timeFilterMonth, setTimeFilterMonth] = useState((recentRange.endDate || toDateInputValue(new Date())).slice(0, 7))
  const [timeFilterWeek, setTimeFilterWeek] = useState(toWeekInputValue(new Date()))
  const [timeFilterDay, setTimeFilterDay] = useState(recentRange.endDate || toDateInputValue(new Date()))
  const [timeFilterAllDay, setTimeFilterAllDay] = useState(true)
  const [timeFilterStartTime, setTimeFilterStartTime] = useState('00:00')
  const [timeFilterEndTime, setTimeFilterEndTime] = useState('23:59')
  const [appliedTimeRangeLabel, setAppliedTimeRangeLabel] = useState('')

  const [filePath, setFilePath] = useState(DEFAULT_REAL_JOURNEY_EVENTS_FILE)
  const [eventsUnfiltered, setEventsUnfiltered] = useState<RealJourneyEventDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedDay, setSelectedDay] = useState('')
  const [circuitRangeStartDate, setCircuitRangeStartDate] = useState('')
  const [circuitRangeEndDate, setCircuitRangeEndDate] = useState('')
  const [journeyQuickFilter, setJourneyQuickFilter] = useState<JourneyQuickFilter>('all')
  const [prelimCircuitFilter, setPrelimCircuitFilter] = useState('')
  const [plateQuery, setPlateQuery] = useState('')
  const [journeyQuery, setJourneyQuery] = useState('')
  const [onlyThisPlateScope, setOnlyThisPlateScope] = useState(false)
  const [interplantWindowHours, setInterplantWindowHours] = useState(12)
  /** Default: NO — análisis operativo sólo patentes válidas; opción diagnostic amplía conteos en selector de día. */
  const [includeInvalidPlateDiagnostics, setIncludeInvalidPlateDiagnostics] = useState(false)
  const [depurationScopeFilter, setDepurationScopeFilter] =
    useState<OperationalJourneyScopeFilter>('all')
  const [mainTab, setMainTab] = useState<RealDataMainTab>('extraccion_datos')
  const [showExcludedRearEvents, setShowExcludedRearEvents] = useState(false)
  const [showExcludedRearAlerts, setShowExcludedRearAlerts] = useState(false)
  const [drawerCircuitCode, setDrawerCircuitCode] = useState<string | null>(null)
  const [drawerIncompleteGroup, setDrawerIncompleteGroup] = useState<IncompleteSequenceGroup | null>(null)
  const [apiQuery, setApiQuery] = useState<RealTruckflowQueryParams>({
    startDate: recentRange.startDate || RECOMMENDED_JOURNEY_EXPORT_START_DATE,
    endDate: recentRange.endDate || RECOMMENDED_JOURNEY_EXPORT_END_DATE,
    plate: '',
    device: '',
    sector: '',
    site: '',
    journeyUuid: '',
  })
  const [rawAlerts, setRawAlerts] = useState<RealAlertDto[]>([])
  const [alertsQuery, setAlertsQuery] = useState<RealTruckflowQueryParams>({
    startDate: recentRange.startDate || RECOMMENDED_JOURNEY_EXPORT_START_DATE,
    endDate: recentRange.endDate || RECOMMENDED_JOURNEY_EXPORT_END_DATE,
    plate: '',
    device: '',
    sector: '',
    site: '',
    journeyUuid: '',
  })
  const [alertsRawStandalone, setAlertsRawStandalone] = useState<RealAlertDto[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const [alertsLastQueryUrl, setAlertsLastQueryUrl] = useState('')
  const [alertsLastQueriedAt, setAlertsLastQueriedAt] = useState('')
  const [alertsQuickFilter, setAlertsQuickFilter] = useState<AlertsQuickFilter>('all')
  const [selectedAlert, setSelectedAlert] = useState<NormalizedRealAlertView | null>(null)
  const [selectedAlertJourneyEvents, setSelectedAlertJourneyEvents] = useState<RealJourneyEventDto[]>([])
  const [selectedAlertJourneyLoading, setSelectedAlertJourneyLoading] = useState(false)
  const [selectedAlertJourneyError, setSelectedAlertJourneyError] = useState<string | null>(null)
  const [etlLoadingEvents, setEtlLoadingEvents] = useState(false)
  const [etlLoadingAlerts, setEtlLoadingAlerts] = useState(false)
  const [etlError, setEtlError] = useState<string | null>(null)
  const [lastQueryUrl, setLastQueryUrl] = useState('')
  const [cleanDataset, setCleanDataset] = useState<ReturnType<typeof buildCleanRealDataset> | null>(null)
  const [datasetProcessedAt, setDatasetProcessedAt] = useState('')
  const [lastLoadedAt, setLastLoadedAt] = useState('')
  const [powerBiExportStartDate, setPowerBiExportStartDate] = useState(() => toDateInputValue(new Date()))
  const [powerBiExportStartTime, setPowerBiExportStartTime] = useState('00:00')
  const [powerBiExportEndDate, setPowerBiExportEndDate] = useState(() => toDateInputValue(new Date()))
  const [powerBiExportEndTime, setPowerBiExportEndTime] = useState('23:59')
  const [powerBiExportLoaded, setPowerBiExportLoaded] = useState<PowerBiExportLoadedState | null>(null)
  const [powerBiExportLoading, setPowerBiExportLoading] = useState(false)
  const [powerBiPeriodValidationError, setPowerBiPeriodValidationError] = useState<string | null>(null)
  const [powerBiExportLoadError, setPowerBiExportLoadError] = useState<string | null>(null)
  const [powerBiExportBundleError, setPowerBiExportBundleError] = useState<string | null>(null)
  const [selectedCircuitJourneyUid, setSelectedCircuitJourneyUid] = useState<string | null>(null)
  const [useUsefulWindow, setUseUsefulWindow] = useState(true)
  const [summaryFilter, setSummaryFilter] = useState<
    'all' | 'included' | 'review_required' | 'excluded' | 'with_alert' | 'without_alert' | 'lpr_malfunction' | 'invalid_route' | 'invalid_start' | 'outside_window'
  >('all')
  const [nearbyDrawerJourneyUid, setNearbyDrawerJourneyUid] = useState<string | null>(null)
  const [nearbyBackwardHours, setNearbyBackwardHours] = useState(3)
  const [nearbyForwardHours, setNearbyForwardHours] = useState(1)
  const [nearbyIncludeExpectedSectors, setNearbyIncludeExpectedSectors] = useState(true)
  const [nearbyIncludeSimilarPlates, setNearbyIncludeSimilarPlates] = useState(true)
  const [nearbyIncludeLpr, setNearbyIncludeLpr] = useState(true)
  const [nearbyAlertsRaw, setNearbyAlertsRaw] = useState<RealAlertDto[]>([])
  const [nearbyAlertsLoading, setNearbyAlertsLoading] = useState(false)
  const [nearbyAlertsError, setNearbyAlertsError] = useState<string | null>(null)
  const [manualNearbyAssociations, setManualNearbyAssociations] = useState<Record<string, string[]>>({})
  const [lprCameraAudit, setLprCameraAudit] = useState<{ deviceCode: string; sectorCode: string } | null>(null)
  const initialApiLoadStarted = useRef(false)

  const wsOpt = useRealTruckflowWorkspaceOptional()
  const unifiedPeriod = Boolean(wsOpt)

  const deferredEventsUnfiltered = useDeferredValue(eventsUnfiltered)
  const deferredRawAlerts = useDeferredValue(rawAlerts)

  const committeePipeline = useMemo(() => {
    if (unifiedPeriod && wsOpt?.localAnalysisPhase === 'staging') {
      return buildCommitteeOperationalPipeline([], [])
    }
    if (unifiedPeriod && wsOpt?.localAnalysisPhase === 'processed' && wsOpt.committee) {
      return wsOpt.committee
    }
    return buildCommitteeOperationalPipeline(deferredEventsUnfiltered, deferredRawAlerts)
  }, [
    unifiedPeriod,
    wsOpt?.localAnalysisPhase,
    wsOpt?.committee,
    deferredEventsUnfiltered,
    deferredRawAlerts,
  ])
  const rearCameraFilterTrace = committeePipeline.rearCameraTrace
  const events = committeePipeline.segmentedOperationalEvents
  const rawAlertsOperational = committeePipeline.alertsAlignedToSegments

  useEffect(() => {
    setPowerBiExportLoaded(null)
    setPowerBiPeriodValidationError(null)
    setPowerBiExportLoadError(null)
    setPowerBiExportBundleError(null)
  }, [powerBiExportStartDate, powerBiExportStartTime, powerBiExportEndDate, powerBiExportEndTime])

  const selectedTimeRange = useMemo(() => {
    let start: Date
    let end: Date
    if (timeFilterMode === 'month') {
      const [year, month] = (timeFilterMonth || toDateInputValue(new Date()).slice(0, 7)).split('-').map(Number)
      start = new Date(year, month - 1, 1)
      end = new Date(year, month, 0)
    } else if (timeFilterMode === 'week') {
      const range = weekInputToDateRange(timeFilterWeek)
      start = range?.start ?? new Date()
      end = range?.end ?? new Date()
    } else {
      const [year, month, day] = (timeFilterDay || toDateInputValue(new Date())).split('-').map(Number)
      start = new Date(year, month - 1, day)
      end = new Date(year, month - 1, day)
    }

    const [startHour, startMinute] = (timeFilterAllDay ? '00:00' : timeFilterStartTime || '00:00').split(':').map(Number)
    const [endHour, endMinute] = (timeFilterAllDay ? '23:59' : timeFilterEndTime || '23:59').split(':').map(Number)
    start.setHours(startHour || 0, startMinute || 0, 0, 0)
    end.setHours(endHour || 0, endMinute || 0, 59, 999)
    if (start > end) return null
    return { start, end }
  }, [timeFilterAllDay, timeFilterDay, timeFilterEndTime, timeFilterMode, timeFilterMonth, timeFilterStartTime, timeFilterWeek])

  const load = useCallback(async () => {
    if (unifiedPeriod) return
    setLoading(true)
    setError(null)
    try {
      const [list, alertList] =
        dataSource === 'api'
          ? await Promise.all([
              loadRealJourneyEventsFromApi(apiStartDate.trim(), apiEndDate.trim()),
              fetchAlerts({ startDate: apiStartDate.trim(), endDate: apiEndDate.trim() }),
            ])
          : [await loadRealJourneyEventsFromFile(filePath.trim() || undefined), [] as RealAlertDto[]]
      const ricardoneOnly = filterRicardoneSiteEventsOnly(list)
      await yieldToMain()
      startTransition(() => {
        setEventsUnfiltered(ricardoneOnly)
        setRawAlerts(alertList)
        setAlertsRawStandalone(alertList)
      })
      setAlertsLastQueriedAt(new Date().toISOString())
      setLastLoadedAt(new Date().toISOString())
    } catch (e) {
      startTransition(() => setEventsUnfiltered([]))
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [dataSource, apiStartDate, apiEndDate, filePath, unifiedPeriod])

  const applyTimeFilter = useCallback(async () => {
    if (unifiedPeriod) return
    if (!selectedTimeRange) {
      setError('Seleccioná un rango temporal válido.')
      return
    }
    setDataSource('api')
    setLoading(true)
    setAlertsLoading(true)
    setError(null)
    setAlertsError(null)
    const params: RealTruckflowQueryParams = {
      startDate: toIsoLocalDateTime(selectedTimeRange.start),
      endDate: toIsoLocalDateTime(selectedTimeRange.end),
    }
    try {
      const [eventList, alertList] = await Promise.all([
        fetchJourneyEvents(params),
        fetchAlerts(params),
      ])
      const ricardoneOnly = filterRicardoneSiteEventsOnly(eventList)
      await yieldToMain()
      setApiQuery({ ...params, plate: '', device: '', sector: '', site: '', journeyUuid: '' })
      setAlertsQuery({ ...params, plate: '', device: '', sector: '', site: '', journeyUuid: '' })
      setApiStartDate(toDateInputValue(selectedTimeRange.start))
      setApiEndDate(toDateInputValue(selectedTimeRange.end))
      startTransition(() => {
        setEventsUnfiltered(ricardoneOnly)
        setRawAlerts(alertList)
        setAlertsRawStandalone(alertList)
      })
      setAlertsLastQueryUrl(`${REAL_TRUCKFLOW_BASE_URL}/alert/list`)
      setAlertsLastQueriedAt(new Date().toISOString())
      setCleanDataset(null)
      setDatasetProcessedAt('')
      setLastQueryUrl(`${REAL_TRUCKFLOW_BASE_URL}/journey-event/list + /alert/list`)
      setLastLoadedAt(new Date().toISOString())
      setAppliedTimeRangeLabel(`${params.startDate} → ${params.endDate}`)
      setSelectedDay('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setAlertsError(msg)
    } finally {
      setLoading(false)
      setAlertsLoading(false)
    }
  }, [selectedTimeRange, unifiedPeriod])

  const loadEtlEvents = useCallback(async () => {
    setEtlLoadingEvents(true)
    setEtlError(null)
    try {
      const list = await fetchJourneyEvents(apiQuery)
      const ricardoneOnly = filterRicardoneSiteEventsOnly(list)
      startTransition(() => {
        setEventsUnfiltered(ricardoneOnly)
        setCleanDataset(null)
      })
      setLastQueryUrl(`${REAL_TRUCKFLOW_BASE_URL}/journey-event/list`)
      setLastLoadedAt(new Date().toISOString())
    } catch (e) {
      setEtlError(e instanceof Error ? e.message : String(e))
    } finally {
      setEtlLoadingEvents(false)
    }
  }, [apiQuery])

  const loadEtlAlerts = useCallback(async () => {
    setEtlLoadingAlerts(true)
    setEtlError(null)
    try {
      const alertsChannelQuery = buildAlertsChannelQueryNoTimeFilter()
      const list = await fetchAlerts(alertsChannelQuery)
      startTransition(() => {
        setRawAlerts(list)
        setCleanDataset(null)
      })
      setLastQueryUrl(`${REAL_TRUCKFLOW_BASE_URL}/alert/list (canal alertas independiente)`)
      setLastLoadedAt(new Date().toISOString())
    } catch (e) {
      setEtlError(e instanceof Error ? e.message : String(e))
    } finally {
      setEtlLoadingAlerts(false)
    }
  }, [])

  const loadEtlAll = useCallback(async () => {
    setEtlLoadingEvents(true)
    setEtlLoadingAlerts(true)
    setEtlError(null)
    try {
      const alertsChannelQuery = buildAlertsChannelQueryNoTimeFilter()
      const [eventList, alertList] = await Promise.all([
        fetchJourneyEvents(apiQuery),
        fetchAlerts(alertsChannelQuery),
      ])
      const ricardoneOnly = filterRicardoneSiteEventsOnly(eventList)
      await yieldToMain()
      const pipe = buildCommitteeOperationalPipeline(ricardoneOnly, alertList)
      await yieldToMain()
      const processed = buildCleanRealDataset(pipe.segmentedOperationalEvents, pipe.alertsAlignedToSegments)
      startTransition(() => {
        setEventsUnfiltered(ricardoneOnly)
        setRawAlerts(alertList)
        setCleanDataset(processed)
      })
      setDatasetProcessedAt(new Date().toISOString())
      setLastQueryUrl(`${REAL_TRUCKFLOW_BASE_URL}/journey-event/list (X) + /alert/list (Y independiente)`)
      setLastLoadedAt(new Date().toISOString())
    } catch (e) {
      setEtlError(e instanceof Error ? e.message : String(e))
    } finally {
      setEtlLoadingEvents(false)
      setEtlLoadingAlerts(false)
    }
  }, [apiQuery])

  const loadSummaryAll = useCallback(async () => {
    await loadEtlAll()
  }, [loadEtlAll])

  const loadAlertsStandalone = useCallback(async () => {
    setAlertsLoading(true)
    setAlertsError(null)
    try {
      const list = await fetchAlerts(alertsQuery)
      setAlertsRawStandalone(list)
      setAlertsLastQueryUrl(`${REAL_TRUCKFLOW_BASE_URL}/alert/list`)
      setAlertsLastQueriedAt(new Date().toISOString())
      setLastLoadedAt(new Date().toISOString())
    } catch (e) {
      setAlertsError(e instanceof Error ? e.message : String(e))
    } finally {
      setAlertsLoading(false)
    }
  }, [alertsQuery])

  const clearAlertsFilters = useCallback(() => {
    setAlertsQuery({
      startDate: recentRange.startDate || RECOMMENDED_JOURNEY_EXPORT_START_DATE,
      endDate: recentRange.endDate || RECOMMENDED_JOURNEY_EXPORT_END_DATE,
      plate: '',
      device: '',
      sector: '',
      site: '',
      journeyUuid: '',
    })
    setAlertsQuickFilter('all')
  }, [recentRange.endDate, recentRange.startDate])

  const processCleanDataset = useCallback(() => {
    const pipe = buildCommitteeOperationalPipeline(eventsUnfiltered, rawAlerts)
    const result = buildCleanRealDataset(pipe.segmentedOperationalEvents, pipe.alertsAlignedToSegments)
    setCleanDataset(result)
    setDatasetProcessedAt(new Date().toISOString())
  }, [eventsUnfiltered, rawAlerts])

  const excludedRearCountByJourney = useMemo(() => {
    const m = new Map<string, number>()
    for (const event of rearCameraFilterTrace.excludedRearEvents) {
      const uid = (event.journeyUid ?? '').trim()
      if (!uid) continue
      m.set(uid, (m.get(uid) ?? 0) + 1)
    }
    return m
  }, [rearCameraFilterTrace.excludedRearEvents])

  const standaloneRearAlertFilterTrace = useMemo(
    () => buildRearCameraFilterTrace([], alertsRawStandalone),
    [alertsRawStandalone]
  )
  const alertsRawStandaloneOperational = standaloneRearAlertFilterTrace.operationalAlerts

  const excludedRearCountForOperationalJourney = useMemo(() => {
    const m = new Map<string, number>()
    for (const meta of committeePipeline.journeyMetaByUid.values()) {
      m.set(meta.syntheticJourneyUid, excludedRearCountByJourney.get(meta.sourceJourneyUid) ?? 0)
    }
    return m
  }, [committeePipeline.journeyMetaByUid, excludedRearCountByJourney])

  const exportCleanDatasetJson = useCallback(() => {
    if (!cleanDataset) return
    const mapped = mapCleanJourneysToHistoricalTrips(cleanDataset.reconstructedJourneysClean)
    const fileName = `journey-events-clean_${apiQuery.startDate || 'start'}_${apiQuery.endDate || 'end'}.json`
    const payload = {
      metadata: {
        generatedAt: new Date().toISOString(),
        startDate: apiQuery.startDate ?? '',
        endDate: apiQuery.endDate ?? '',
        source: 'truckflow-api',
        baseUrl: REAL_TRUCKFLOW_BASE_URL,
        rawEventCount: cleanDataset.summary.rawEventCount,
        rawAlertCount: cleanDataset.summary.rawAlertCount,
        sourceRawEventCount: eventsUnfiltered.length,
        sourceRawAlertCount: rawAlerts.length,
        rearCameraFilter: rearCameraFilterTrace.metadata,
        cleanEventCount: cleanDataset.summary.cleanEventCount,
        cleanJourneyCount: cleanDataset.summary.cleanJourneyCount,
        discardedEventCount: cleanDataset.summary.discardedEventCount,
        discardedJourneyCount: cleanDataset.summary.discardedJourneyCount,
        cleaningRules: {
          excludeInvalidPlates: true,
          excludeAlertedJourneys: true,
          excludeAlertedEvents: false,
          excludeOnlyIngreso: true,
          excludeOnlyEgreso: true,
          excludeSoloRutaProbable: true,
          keepPreliminaryValid: true,
        },
      },
      cleanEvents: cleanDataset.cleanEvents,
      cleanJourneys: mapped,
      discarded: {
        invalidPlate: cleanDataset.discardedEvents.filter((d) => d.reason === 'INVALID_PLATE'),
        alerted: cleanDataset.discardedJourneys.filter((d) => d.reason === 'ALERTED_JOURNEY'),
        onlyIngreso: cleanDataset.discardedJourneys.filter((d) => d.reason === 'ONLY_INGRESO'),
        onlyEgreso: cleanDataset.discardedJourneys.filter((d) => d.reason === 'ONLY_EGRESO'),
        rutaProbable: cleanDataset.discardedJourneys.filter((d) => d.reason === 'RUTA_PROBABLE'),
        incompleteExcluded: cleanDataset.discardedJourneys.filter((d) => d.reason === 'INCOMPLETE_EXCLUDED'),
      },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [cleanDataset, apiQuery.endDate, apiQuery.startDate, eventsUnfiltered.length, rawAlerts.length, rearCameraFilterTrace.metadata])

  const exportCleanSummaryCsv = useCallback(() => {
    if (!cleanDataset) return
    const header = [
      'journeyUid',
      'patente',
      'inicio',
      'fin',
      'duracion',
      'circuito_preliminar',
      'incluido',
      'motivo_exclusion',
      'secuencia_logica',
      'secuencia_raw',
      'alertas_asociadas',
    ]
    const discardedByUid = new Map(cleanDataset.discardedJourneys.map((d) => [d.journey.journeyUid, d.reason]))
    const rows = cleanDataset.reconstructedJourneysRaw.map((journey) => {
      const included = cleanDataset.reconstructedJourneysClean.some((j) => j.journeyUid === journey.journeyUid)
      const relatedAlerts = cleanDataset.eventsWithAlertInfo.filter((e) => e.journeyUid === journey.journeyUid && e.hasAlert).length
      return [
        journey.journeyUid,
        journey.plate,
        journey.startedAt,
        journey.endedAt,
        String(journey.durationMinutes),
        journey.preliminaryCircuitCode,
        included ? 'si' : 'no',
        discardedByUid.get(journey.journeyUid) ?? '',
        journey.logicalCodeSequence.join(' > '),
        journey.rawSectorSequence.join(' > '),
        String(relatedAlerts),
      ]
    })
    const csv =
      '\uFEFF' +
      [header, ...rows]
        .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `journey-events-clean-summary_${apiQuery.startDate || 'start'}_${apiQuery.endDate || 'end'}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [cleanDataset, apiQuery.endDate, apiQuery.startDate])

  useEffect(() => {
    if (unifiedPeriod) return
    if (initialApiLoadStarted.current) return
    initialApiLoadStarted.current = true
    const cancelRef = { current: false }
    const run = () => {
      if (cancelRef.current) return
      void load()
    }
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(run, { timeout: 2500 })
      return () => {
        cancelRef.current = true
        cancelIdleCallback(id)
      }
    }
    const t = window.setTimeout(run, 0)
    return () => {
      cancelRef.current = true
      window.clearTimeout(t)
    }
  }, [load, unifiedPeriod])

  useEffect(() => {
    if (!unifiedPeriod || !wsOpt) return

    if (wsOpt.localAnalysisPhase === 'staging') {
      startTransition(() => {
        setEventsUnfiltered([])
        setRawAlerts([])
        setCleanDataset(null)
      })
      setAlertsRawStandalone([])
      setApiQuery((q) => ({ ...q, startDate: '', endDate: '' }))
      setAlertsQuery((q) => ({ ...q, startDate: '', endDate: '' }))
      setAppliedTimeRangeLabel('')
      setError(null)
      return
    }

    if (wsOpt.localAnalysisPhase === 'processed' && wsOpt.status === 'loaded' && wsOpt.loadedRange) {
      startTransition(() => {
        setEventsUnfiltered(wsOpt.rawEventsRicardone)
        setRawAlerts(wsOpt.rawAlerts)
        setCleanDataset(wsOpt.cleanDataset)
      })
      setAlertsRawStandalone(wsOpt.rawAlerts)
      const q: RealTruckflowQueryParams = {
        startDate: wsOpt.loadedRange.startIso,
        endDate: wsOpt.loadedRange.endIso,
        plate: '',
        device: '',
        sector: '',
        site: '',
        journeyUuid: '',
      }
      setApiQuery(q)
      setAlertsQuery(q)
      setAppliedTimeRangeLabel(`${wsOpt.loadedRange.startIso} → ${wsOpt.loadedRange.endIso}`)
      setError(null)
      return
    }

    if (wsOpt.status === 'idle' || wsOpt.status === 'error') {
      startTransition(() => {
        setEventsUnfiltered([])
        setRawAlerts([])
        setCleanDataset(null)
      })
      setAlertsRawStandalone([])
      setApiQuery((q) => ({ ...q, startDate: '', endDate: '' }))
      setAlertsQuery((q) => ({ ...q, startDate: '', endDate: '' }))
      setAppliedTimeRangeLabel('')
      if (wsOpt.status === 'idle') setError(null)
      return
    }
    if (wsOpt.status !== 'loaded' || !wsOpt.loadedRange) return
    startTransition(() => {
      setEventsUnfiltered(wsOpt.rawEventsRicardone)
      setRawAlerts(wsOpt.rawAlerts)
      setCleanDataset(wsOpt.cleanDataset)
    })
    setAlertsRawStandalone(wsOpt.rawAlerts)
    const q: RealTruckflowQueryParams = {
      startDate: wsOpt.loadedRange.startIso,
      endDate: wsOpt.loadedRange.endIso,
      plate: '',
      device: '',
      sector: '',
      site: '',
      journeyUuid: '',
    }
    setApiQuery(q)
    setAlertsQuery(q)
    setAppliedTimeRangeLabel(`${wsOpt.loadedRange.startIso} → ${wsOpt.loadedRange.endIso}`)
    setError(null)
  }, [unifiedPeriod, wsOpt, wsOpt?.loadedAt, wsOpt?.status, wsOpt?.localAnalysisPhase])

  useEffect(() => {
    if (journeyQuickFilter !== 'inc_prelim_grouped') return
    setMainTab('transform_etl')
    return
  }, [journeyQuickFilter])

  useEffect(() => {
    const allowed = new Set<string>(ETL_DEV_MODE ? ETL_MAIN_TAB_IDS : ETL_PRODUCT_TAB_IDS)
    if (!allowed.has(mainTab)) setMainTab(ETL_PRODUCT_TAB_IDS[0])
  }, [mainTab])

  const journeysBatch = useMemo(() => reconstructRealJourneys(events), [events])
  const journeys = useMemo(
    () =>
      enrichCaladaSanLorenzoConfidence(journeysBatch, eventsUnfiltered, CALADA_INTERPLANT_MS).map((j) => ({
        ...j,
        excludedRearCameraEventsCount:
          excludedRearCountForOperationalJourney.get(j.journeyUid) ??
          excludedRearCountByJourney.get(j.journeyUid) ??
          j.excludedRearCameraEventsCount ??
          0,
      })),
    [excludedRearCountByJourney, excludedRearCountForOperationalJourney, journeysBatch, eventsUnfiltered]
  )

  const journeysOperational = useMemo(
    () => journeys.filter((j) => j.feedsOperationalAnalytics),
    [journeys]
  )

  const depurationSnapshot = useMemo(() => buildOperationalDepurationSnapshot(events, journeys), [events, journeys])
  const operationalEvents = useMemo(() => filterValidPlateRealEvents(events), [events])

  const plateQualitySummary = useMemo(() => buildPlateQualitySummary(events), [events])

  const plateNorm = useMemo(() => normalizePlateQuery(plateQuery), [plateQuery])
  const journeyQueryNorm = useMemo(() => journeyQuery.trim().toUpperCase(), [journeyQuery])

  const plateQueryFormatWarning = Boolean(plateNorm && !plateSearchQueryIsValidArgentinaFormat(plateQuery))

  const plateEventsAll = useMemo(() => {
    if (!plateNorm && !journeyQueryNorm) return []
    const plateFiltered = plateNorm ? filterEventsByPlate(eventsUnfiltered, plateQuery) : eventsUnfiltered
    if (!journeyQueryNorm) return plateFiltered
    return plateFiltered.filter((e) => (e.journeyUid ?? '').trim().toUpperCase().includes(journeyQueryNorm))
  }, [eventsUnfiltered, journeyQueryNorm, plateQuery, plateNorm])

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

  const circuitFilteredJourneys = useMemo(() => {
    const start = circuitRangeStartDate.trim()
    const end = circuitRangeEndDate.trim()
    return journeysScopedOperational.filter((j) => {
      const day = (j.day || occurredAtLocalDayKey(j.startedAt)).trim()
      if (!day) return false
      if (start && day < start) return false
      if (end && day > end) return false
      return true
    })
  }, [circuitRangeEndDate, circuitRangeStartDate, journeysScopedOperational])

  const prelimCircuitCardMetrics = useMemo(() => {
    const list = circuitFilteredJourneys
    const n = (code: string) => list.filter((j) => j.preliminaryCircuitCode === code).length
    return {
      totalOperational: list.length,
      volcable: n('CIRCUITO_VOLCABLE_1_2'),
      sinVolcable: n('DESPACHO_SIN_PUNTO_INSTRUMENTADO'),
      caladaSl: n('CIRCUITO_SAN_LORENZO'),
      liquido: n('CIRCUITO_LIQUIDO'),
      loopBalanza: n('TRANSILE_VOLCABLE_BALANZA'),
      celda16: n('CIRCUITO_CELDA16_DESCARGA') + n('CIRCUITO_CELDA16_CARGA'),
      soloVolcable: n('CIRCUITO_VOLCABLE_1_2'),
      incompletos: n('REGISTRO_INCOMPLETO'),
      minIngEgr: 0,
      minPreEg: 0,
      partialIngBal: 0,
      partialPreBal: 0,
    }
  }, [circuitFilteredJourneys])

  const prelimCircuitDailyRows = useMemo(
    () => buildPreliminaryCircuitDailySummary(circuitFilteredJourneys),
    [circuitFilteredJourneys]
  )
  const prelimCircuitDailyFiltered = useMemo(
    () => (selectedDay ? prelimCircuitDailyRows.filter((r) => r.day === selectedDay) : prelimCircuitDailyRows),
    [prelimCircuitDailyRows, selectedDay]
  )

  const journeysForTablePipeline = journeys

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
    () => journeysForIncompleteAnalysis.filter((j) => j.preliminaryCircuitCode === 'REGISTRO_INCOMPLETO').length,
    [journeysForIncompleteAnalysis]
  )

  const incompleteRankings = useMemo(() => {
    const inc = journeysForIncompleteAnalysis.filter((j) => j.preliminaryCircuitCode === 'REGISTRO_INCOMPLETO')
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
    const tracked = ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO', 'BALANZA_EGRESO', 'VOLCABLE', 'CELDA16_CARGA', 'CELDA16_DESCARGA', 'LIQUIDO', 'EGRESO', 'SL_INGRESO']
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
    const operationalInstants = plateEventsAll.map((e) => getEventOperationalInstantIso(e) || e.occurredAt)
    const times = operationalInstants
      .map((instant) => new Date(instant).getTime())
      .filter((t) => Number.isFinite(t))
    const days = new Set(operationalInstants.map((instant) => occurredAtLocalDayKey(instant)).filter(Boolean))
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
    a.download = `auditoria_patente_${plateNorm || journeyQueryNorm || 'export'}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [journeyQueryNorm, plateTimelineRows, plateNorm])

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
      if (j.preliminaryCircuitCode === 'REGISTRO_INCOMPLETO') {
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
      { id: 'sl', label: 'Ricardone → San Lorenzo', code: 'CIRCUITO_SAN_LORENZO' },
      { id: 'celda-desc', label: 'Descarga Celda 16', code: 'CIRCUITO_CELDA16_DESCARGA' },
      { id: 'celda-carga', label: 'Carga Celda 16', code: 'CIRCUITO_CELDA16_CARGA' },
      { id: 'volc', label: 'Volcable 1/2', code: 'CIRCUITO_VOLCABLE_1_2' },
      { id: 'liq', label: 'Circuito líquido', code: 'CIRCUITO_LIQUIDO' },
      { id: 'despacho', label: 'Despacho / descarga sin punto instrumentado', code: 'DESPACHO_SIN_PUNTO_INSTRUMENTADO' },
      { id: 'trans', label: 'Transile Volcable → Balanza', code: 'TRANSILE_VOLCABLE_BALANZA' },
      { id: 'inc', label: 'Registro incompleto', code: 'REGISTRO_INCOMPLETO' },
    ]
    return defs.map((d) => ({
      id: d.code,
      label: d.label,
      count: circuitFilteredJourneys.filter((j) => j.preliminaryCircuitCode === d.code).length,
      colorClass: d.code === 'REGISTRO_INCOMPLETO' ? 'bg-amber-500' : 'bg-sky-500',
    }))
  }, [circuitFilteredJourneys])

  const circuitSummaryRows = useMemo(() => {
    const list = circuitFilteredJourneys
    const total = Math.max(1, list.length)
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
      const variantCounts = new Map<string, number>()
      for (const g of grp) {
        const k = g.preliminaryCircuitConfidence ?? '—'
        confCounts.set(k, (confCounts.get(k) ?? 0) + 1)
        const v = g.preliminaryCircuitVariant ?? '—'
        variantCounts.set(v, (variantCounts.get(v) ?? 0) + 1)
      }
      const confidence = [...confCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
      const variant = [...variantCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
      return {
        code,
        variant,
        count: grp.length,
        uniquePlates: plates.size,
        meanDur: Math.round(mean * 10) / 10,
        p90,
        confidence,
        pctOfUseful: grp.length / total,
        alertsAssociated: 0,
      }
    })
    rows.sort((a, b) => b.count - a.count)
    return rows
  }, [circuitFilteredJourneys])

  const drawerCircuitJourneys = useMemo(() => {
    if (!drawerCircuitCode) return []
    return circuitFilteredJourneys
      .filter((j) => j.preliminaryCircuitCode === drawerCircuitCode)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
      .slice(0, 40)
  }, [circuitFilteredJourneys, drawerCircuitCode])

  const depurationExecutiveRows = useMemo(() => {
    const g = depurationSnapshot.general
    const raw = Math.max(1, g.rawJourneyCount)
    const invalid = g.invalidPlateOnlyJourneyCount
    const soloIng = g.discardedSoloIngresoCount
    const soloEgr = g.discardedSoloEgresoCount
    const incompleteReal = journeys.filter(
      (j) => j.feedsOperationalAnalytics && j.preliminaryCircuitCode === 'REGISTRO_INCOMPLETO'
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

  const normalizedAlertsStandalone = useMemo(
    () => alertsRawStandaloneOperational.map((a) => normalizeRealAlertForView(a)),
    [alertsRawStandaloneOperational]
  )
  const normalizedExcludedRearAlertsStandalone = useMemo(
    () =>
      [
        ...standaloneRearAlertFilterTrace.excludedRearAlerts,
        ...standaloneRearAlertFilterTrace.excludedIngressRouteAlerts,
      ].map((a) => normalizeRealAlertForView(a)),
    [standaloneRearAlertFilterTrace.excludedIngressRouteAlerts, standaloneRearAlertFilterTrace.excludedRearAlerts]
  )

  const filteredAlertsStandalone = useMemo(
    () =>
      applyAlertsQuickFilter(
        showExcludedRearAlerts ? normalizedExcludedRearAlertsStandalone : normalizedAlertsStandalone,
        alertsQuickFilter
      ),
    [alertsQuickFilter, normalizedAlertsStandalone, normalizedExcludedRearAlertsStandalone, showExcludedRearAlerts]
  )

  const alertsSummary = useMemo(() => {
    const list = normalizedAlertsStandalone
    const by = (key: (a: NormalizedRealAlertView) => string) => {
      const map = new Map<string, NormalizedRealAlertView[]>()
      for (const alert of list) {
        const k = key(alert) || 'sin dato'
        map.set(k, [...(map.get(k) ?? []), alert])
      }
      return [...map.entries()].map(([group, alerts]) => {
        const times = alerts.map((x) => new Date(x.occurredAt).getTime()).filter((x) => Number.isFinite(x))
        return {
          group,
          count: alerts.length,
          pct: list.length > 0 ? alerts.length / list.length : 0,
          firstAt: times.length ? new Date(Math.min(...times)).toISOString() : '',
          lastAt: times.length ? new Date(Math.max(...times)).toISOString() : '',
          alerts,
        }
      })
    }
    const byType = by((a) => a.alertType || a.alertCode || a.reason || 'sin tipo')
      .sort((a, b) => b.count - a.count)
      .slice(0, 25)
    const bySector = by((a) => a.sectorCode || 'sin sector')
      .sort((a, b) => b.count - a.count)
      .slice(0, 25)
    const byDevice = by((a) => a.deviceCode || 'sin device')
      .sort((a, b) => b.count - a.count)
      .slice(0, 25)
    const byPlate = by((a) => a.normalizedPlate || a.rawPlate || 'sin patente')
      .sort((a, b) => b.count - a.count)
      .slice(0, 25)
    const byJourney = by((a) => a.journeyUid || 'sin journey')
      .sort((a, b) => b.count - a.count)
      .slice(0, 25)
    const mostFrequentLevel =
      by((a) => String(a.alertLevel))
        .sort((a, b) => b.count - a.count)[0]?.group ?? 'sin dato'
    const mostFrequentType = byType[0]?.group ?? 'sin dato'
    return {
      total: list.length,
      validPlate: list.filter((a) => a.isValidPlate).length,
      invalidPlate: list.filter((a) => a.normalizedPlate && !a.isValidPlate).length,
      withJourney: list.filter((a) => Boolean(a.journeyUid)).length,
      withoutJourney: list.filter((a) => !a.journeyUid).length,
      invalidRoute: list.filter((a) => a.inferenceCategory === 'invalid_route').length,
      sectorDevice: list.filter((a) => a.inferenceCategory === 'sector_device').length,
      mostFrequentLevel,
      mostFrequentType,
      byType,
      bySector,
      byDevice,
      byPlate,
      byJourney,
    }
  }, [normalizedAlertsStandalone])

  const usefulWindow = useMemo(() => {
    const sorted = [...events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
    const ingresos = sorted.filter((e) => {
      const logical = normalizeRealEventPoint(e).logicalCode
      return logical === 'INGRESO' || (e.sectorCode ?? '').trim().toUpperCase() === 'RICARDONE_INGRESO_CAMIONES'
    })
    const firstIngresoAt = ingresos[0]?.occurredAt ?? ''
    const lastIngresoAt = ingresos.length ? ingresos[ingresos.length - 1].occurredAt : ''
    const startMs = firstIngresoAt ? new Date(firstIngresoAt).getTime() + 6 * 3600 * 1000 : Number.NaN
    const endMs = lastIngresoAt ? new Date(lastIngresoAt).getTime() - 6 * 3600 * 1000 : Number.NaN
    const windowValid = Number.isFinite(startMs) && Number.isFinite(endMs) && startMs < endMs
    const usefulWindowStart = windowValid ? new Date(startMs).toISOString() : ''
    const usefulWindowEnd = windowValid ? new Date(endMs).toISOString() : ''
    let insideCount = 0
    let outsideCount = 0
    for (const e of events) {
      const t = new Date(e.occurredAt).getTime()
      const inside = !useUsefulWindow || !windowValid || (Number.isFinite(t) && t >= startMs && t <= endMs)
      if (inside) insideCount++
      else outsideCount++
    }
    return { firstIngresoAt, lastIngresoAt, usefulWindowStart, usefulWindowEnd, windowValid, insideCount, outsideCount }
  }, [events, useUsefulWindow])

  const summaryDataset = useMemo(() => {
    const data = buildCleanRealDataset(
      events.filter((e) => {
        if (!useUsefulWindow || !usefulWindow.windowValid) return true
        const t = new Date(e.occurredAt).getTime()
        const s = new Date(usefulWindow.usefulWindowStart).getTime()
        const f = new Date(usefulWindow.usefulWindowEnd).getTime()
        return Number.isFinite(t) && t >= s && t <= f
      }),
      rawAlertsOperational,
      { excludeAlertedJourneys: false, excludeAlertedEvents: false }
    )
    return data
  }, [events, rawAlertsOperational, useUsefulWindow, usefulWindow.usefulWindowEnd, usefulWindow.usefulWindowStart, usefulWindow.windowValid])

  const summaryJourneyRowsAll = useMemo(() => {
    const byUidAlerts = new Map<string, Set<string>>()
    for (const event of summaryDataset.eventsWithAlertInfo) {
      if (!byUidAlerts.has(event.journeyUid)) byUidAlerts.set(event.journeyUid, new Set())
      for (const a of event.relatedAlerts) {
        const code = String((a.raw as Record<string, unknown>).alertCode ?? a.alertType ?? '').trim()
        if (code) byUidAlerts.get(event.journeyUid)!.add(code)
      }
    }
    const rows = summaryDataset.reconstructedJourneysRaw.map((j) => {
      const alertCodes = [...(byUidAlerts.get(j.journeyUid) ?? new Set<string>())]
      const hasLprMalfunction = alertCodes.includes('LPR_MALFUNCTION')
      const hasInvalidRoute = alertCodes.includes('INVALID_ROUTE')
      const hasInvalidStart = alertCodes.includes('INVALID_START_JOURNEY')
      const isRouteDiscard =
        j.preliminaryCircuitCode === 'DESCARTADO_SOLO_INGRESO_RUTA_PROBABLE' ||
        j.preliminaryCircuitCode === 'DESCARTADO_SOLO_EGRESO_RUTA_PROBABLE'
      let etlStatus: 'included' | 'review_required' | 'excluded' = 'included'
      let reason = 'Recorrido preliminar válido'
      if (hasLprMalfunction || isRouteDiscard) {
        etlStatus = 'excluded'
        reason = hasLprMalfunction ? 'LPR_MALFUNCTION' : 'Ruta probable solo ingreso/egreso'
      } else if (hasInvalidRoute || hasInvalidStart || j.preliminaryCircuitCode === 'REGISTRO_INCOMPLETO') {
        etlStatus = 'review_required'
        reason = hasInvalidRoute ? 'INVALID_ROUTE' : hasInvalidStart ? 'INVALID_START_JOURNEY' : 'Secuencia operativa dudosa'
      }
      const committeeMeta = committeePipeline.journeyMetaByUid.get(j.journeyUid)
      const committeeOperationalCircuit = committeeMeta?.committeeOperationalCircuit ?? ''
      const committeeFlags = committeeMeta ? [...committeeMeta.committeeFlags] : []
      const committeeTemporalBucket = committeeMeta?.temporalBucket ?? ''
      if (committeeMeta && etlStatus !== 'excluded') {
        const ch = committeeEtlHintFromMeta(committeeMeta)
        if (ch.etl === 'review_required') {
          etlStatus = 'review_required'
          reason = [reason, ch.reason].filter(Boolean).join(' · ')
        }
      }
      const inUsefulWindow =
        !useUsefulWindow ||
        !usefulWindow.windowValid ||
        (() => {
          const s = new Date(usefulWindow.usefulWindowStart).getTime()
          const e = new Date(usefulWindow.usefulWindowEnd).getTime()
          const t = new Date(j.startedAt).getTime()
          return Number.isFinite(t) && t >= s && t <= e
        })()
      return {
        etlStatus,
        reason,
        journeyUid: j.journeyUid,
        plate: j.plate,
        startedAt: j.startedAt,
        endedAt: j.endedAt,
        durationMinutes: j.durationMinutes,
        preliminaryCircuitCode: j.preliminaryCircuitCode,
        alertCodes,
        logicalSequence: j.logicalCodeSequence,
        rawSequence: j.rawSectorSequence,
        inUsefulWindow,
        hasNearbyRelevantAlerts: false,
        nearbyAlertCodes: [] as string[],
        possibleMissingPointsExplained: [] as string[],
        reconstructionSuggestion: '',
        committeeOperationalCircuit,
        committeeFlags,
        committeeTemporalBucket,
      }
    })
    return rows
  }, [
    committeePipeline.journeyMetaByUid,
    summaryDataset,
    useUsefulWindow,
    usefulWindow.windowValid,
    usefulWindow.usefulWindowEnd,
    usefulWindow.usefulWindowStart,
  ])

  const rawAlertsForDiagnostics = useMemo(
    () => (rawAlertsOperational.length ? rawAlertsOperational : alertsRawStandaloneOperational),
    [rawAlertsOperational, alertsRawStandaloneOperational]
  )
  const normalizedAlertsForDiagnostics = useMemo(() => rawAlertsForDiagnostics.map((a) => normalizeRealAlertForView(a)), [rawAlertsForDiagnostics])
  const nearbyByJourneyUid = useMemo(() => {
    const out = new Map<
      string,
      ReturnType<typeof investigateNearbyAlerts>
    >()
    for (const j of journeys) {
      out.set(
        j.journeyUid,
        investigateNearbyAlerts(j, normalizedAlertsForDiagnostics, {
          backwardHours: nearbyBackwardHours,
          forwardHours: nearbyForwardHours,
          includeExpectedMissingSectors: nearbyIncludeExpectedSectors,
          includeSimilarPlates: nearbyIncludeSimilarPlates,
          includeLprMalfunction: nearbyIncludeLpr,
        })
      )
    }
    return out
  }, [
    journeys,
    normalizedAlertsForDiagnostics,
    nearbyBackwardHours,
    nearbyForwardHours,
    nearbyIncludeExpectedSectors,
    nearbyIncludeSimilarPlates,
    nearbyIncludeLpr,
  ])
  const nearbyDrawerJourney = useMemo(
    () => journeys.find((j) => j.journeyUid === nearbyDrawerJourneyUid) ?? null,
    [journeys, nearbyDrawerJourneyUid]
  )
  useEffect(() => {
    if (!nearbyDrawerJourney) {
      setNearbyAlertsRaw([])
      setNearbyAlertsError(null)
      return
    }
    const start = new Date(new Date(nearbyDrawerJourney.startedAt).getTime() - nearbyBackwardHours * 3600000)
    const end = new Date(new Date(nearbyDrawerJourney.endedAt).getTime() + nearbyForwardHours * 3600000)
    const startDate = toIsoLocalDateTime(start)
    const endDate = toIsoLocalDateTime(end)
    let cancelled = false
    setNearbyAlertsLoading(true)
    setNearbyAlertsError(null)
    fetchAlerts({ startDate, endDate })
      .then((rows) => {
        if (cancelled) return
        setNearbyAlertsRaw(rows)
      })
      .catch((e) => {
        if (cancelled) return
        setNearbyAlertsError(e instanceof Error ? e.message : String(e))
        setNearbyAlertsRaw([])
      })
      .finally(() => {
        if (!cancelled) setNearbyAlertsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nearbyBackwardHours, nearbyDrawerJourney, nearbyForwardHours])
  const normalizedNearbyAlerts = useMemo(() => nearbyAlertsRaw.map((a) => normalizeRealAlertForView(a)), [nearbyAlertsRaw])
  const nearbyDrawerResult = useMemo(
    () =>
      nearbyDrawerJourney
        ? investigateNearbyAlerts(nearbyDrawerJourney, normalizedNearbyAlerts, {
            backwardHours: nearbyBackwardHours,
            forwardHours: nearbyForwardHours,
            includeExpectedMissingSectors: nearbyIncludeExpectedSectors,
            includeSimilarPlates: nearbyIncludeSimilarPlates,
            includeLprMalfunction: nearbyIncludeLpr,
          })
        : null,
    [
      nearbyBackwardHours,
      nearbyDrawerJourney,
      nearbyForwardHours,
      nearbyIncludeExpectedSectors,
      nearbyIncludeLpr,
      nearbyIncludeSimilarPlates,
      normalizedNearbyAlerts,
    ]
  )
  const associateNearbyAlert = useCallback((journeyUid: string, alertCode: string) => {
    if (!journeyUid || !alertCode) return
    setManualNearbyAssociations((prev) => {
      const existing = new Set(prev[journeyUid] ?? [])
      existing.add(alertCode)
      return { ...prev, [journeyUid]: [...existing] }
    })
  }, [])
  const applyAlertsHourPreset = useCallback((hours: 1 | 2 | 3, aroundJourney = false) => {
    const now = new Date()
    if (!aroundJourney || !nearbyDrawerJourney) {
      setAlertsQuery((prev) => ({
        ...prev,
        startDate: toIsoLocalDateTime(new Date(now.getTime() - hours * 3600000)),
        endDate: toIsoLocalDateTime(now),
      }))
      return
    }
    const center = new Date(nearbyDrawerJourney.startedAt)
    if (!Number.isFinite(center.getTime())) return
    setAlertsQuery((prev) => ({
      ...prev,
      startDate: toIsoLocalDateTime(new Date(center.getTime() - hours * 3600000)),
      endDate: toIsoLocalDateTime(new Date(center.getTime() + hours * 3600000)),
    }))
  }, [nearbyDrawerJourney])
  const summaryJourneyRowsWithNearby = useMemo(
    () =>
      summaryJourneyRowsAll.map((row) => {
        const n = nearbyByJourneyUid.get(row.journeyUid)
        const manual = manualNearbyAssociations[row.journeyUid] ?? []
        if (manual.length > 0) {
          return {
            ...row,
            etlStatus: 'review_required' as const,
            reason: 'RECLASIFICADO_MANUAL_POR_ALERTA_CERCANA',
            hasNearbyRelevantAlerts: true,
            nearbyAlertCodes: [...new Set([...(n?.nearbyAlertCodes ?? []), ...manual])],
            possibleMissingPointsExplained: [...new Set([...(n?.possibleMissingPointsExplained ?? []), 'ASOCIACION_MANUAL'])],
            reconstructionSuggestion: 'Reclasificado automáticamente por asociación manual de alerta cercana.',
          }
        }
        return n
          ? {
              ...row,
              hasNearbyRelevantAlerts: n.hasNearbyRelevantAlerts,
              nearbyAlertCodes: n.nearbyAlertCodes,
              possibleMissingPointsExplained: n.possibleMissingPointsExplained,
              reconstructionSuggestion: n.reconstructionSuggestion,
            }
          : row
      }),
    [manualNearbyAssociations, nearbyByJourneyUid, summaryJourneyRowsAll]
  )
  const summaryJourneys = useMemo(() => {
    return summaryJourneyRowsWithNearby.filter((row) => {
      if (summaryFilter === 'all') return true
      if (summaryFilter === 'included') return row.etlStatus === 'included'
      if (summaryFilter === 'review_required') return row.etlStatus === 'review_required'
      if (summaryFilter === 'excluded') return row.etlStatus === 'excluded'
      if (summaryFilter === 'with_alert') return row.alertCodes.length > 0
      if (summaryFilter === 'without_alert') return row.alertCodes.length === 0
      if (summaryFilter === 'lpr_malfunction') return row.alertCodes.includes('LPR_MALFUNCTION')
      if (summaryFilter === 'invalid_route') return row.alertCodes.includes('INVALID_ROUTE')
      if (summaryFilter === 'invalid_start') return row.alertCodes.includes('INVALID_START_JOURNEY')
      if (summaryFilter === 'outside_window') return !row.inUsefulWindow
      return true
    })
  }, [summaryFilter, summaryJourneyRowsWithNearby])
  const summaryByJourneyUid = useMemo(() => new Map(summaryJourneyRowsWithNearby.map((r) => [r.journeyUid, r])), [summaryJourneyRowsWithNearby])

  const committeeIncludedBarItems = useMemo(() => {
    const entries = Object.entries(committeePipeline.executiveSummary.includedCircuitCounts).sort((a, b) => b[1] - a[1])
    const palette = ['bg-emerald-500', 'bg-sky-500', 'bg-indigo-500', 'bg-violet-500', 'bg-amber-500']
    return entries.map(([label, count], i) => ({
      id: label,
      label,
      count,
      colorClass: palette[i % palette.length],
    }))
  }, [committeePipeline.executiveSummary.includedCircuitCounts])

  const committeeReviewBarItems = useMemo(() => {
    const entries = Object.entries(committeePipeline.executiveSummary.reviewReasonCounts).sort((a, b) => b[1] - a[1])
    return entries.map(([label, count]) => ({
      id: label,
      label,
      count,
      colorClass: 'bg-amber-500',
    }))
  }, [committeePipeline.executiveSummary.reviewReasonCounts])

  const committeeLprBarItems = useMemo(() => {
    return buildCommitteeLprAlertsByCamera(committeePipeline.rearCameraTrace.operationalAlerts).map((row) => ({
      id: row.deviceCode,
      label: row.deviceCode,
      count: row.count,
      colorClass: 'bg-violet-500',
    }))
  }, [committeePipeline.rearCameraTrace.operationalAlerts])

  const exportCommitteeDataset = useCallback(() => {
    const pipe = committeePipeline
    const metaList = [...pipe.journeyMetaByUid.values()]
    const summaryByUid = new Map(summaryJourneyRowsWithNearby.map((r) => [r.journeyUid, r]))
    const executive = pipe.executiveSummary

    const payload = {
      metadata: {
        generatedAt: new Date().toISOString(),
        pipeline: 'committee-operational-v1',
        apiQuery,
        appliedTimeRangeLabel,
        timeFilterMode,
        useUsefulWindow,
        usefulWindow: {
          windowValid: usefulWindow.windowValid,
          usefulWindowStart: usefulWindow.usefulWindowStart,
          usefulWindowEnd: usefulWindow.usefulWindowEnd,
        },
      },
      filtersApplied: {
        siteScope: 'Solo sectores RICARDONE_* (misma regla que la vista)',
        rearCameraExclusion: pipe.rearCameraTrace.metadata,
        temporalSegmentationHours: { normalMax: 12, longReviewMax: 24, gapSplit: 6 },
      },
      camerasExcludedProvisional: [...pipe.rearCameraTrace.metadata.excludedDeviceCodes],
      executiveSummary: executive,
      traceability: {
        rawEvents: eventsUnfiltered,
        rawAlerts,
        excludedRearEvents: pipe.rearCameraTrace.excludedRearEvents,
        excludedRearAlerts: pipe.rearCameraTrace.excludedRearAlerts,
        operationalEventsSegmented: pipe.segmentedOperationalEvents,
        operationalAlertsAlignedToSegments: pipe.alertsAlignedToSegments,
      },
      committeeJourneyMeta: metaList.map((m) => ({
        ...m,
        committeeEtlHint: committeeEtlHintFromMeta(m),
      })),
      includedOperationalCircuits: metaList
        .filter((m) => committeeEtlHintFromMeta(m).etl === 'included')
        .map((m) => m.syntheticJourneyUid),
      reviewRequiredRecords: metaList
        .filter((m) => committeeEtlHintFromMeta(m).etl === 'review_required')
        .map((m) => ({ ...m, ...committeeEtlHintFromMeta(m) })),
      discardedRearOnlyJourneyUids: pipe.rearCameraTrace.excludedRearOnlyJourneyUids,
      summaryJourneysMergedEtl: summaryJourneyRowsWithNearby,
      summaryExecutive: {
        rawEventCount: eventsUnfiltered.length,
        operationalEventCount: events.length,
        operationalAlertCount: rawAlertsOperational.length,
        journeysIncluded: summaryJourneyRowsWithNearby.filter((r) => r.etlStatus === 'included').length,
        journeysReview: summaryJourneyRowsWithNearby.filter((r) => r.etlStatus === 'review_required').length,
        journeysExcluded: summaryJourneyRowsWithNearby.filter((r) => r.etlStatus === 'excluded').length,
        topCircuitByVolume: `${executive.topCircuitCode} (${executive.topCircuitCount})`,
      },
    }

    const stamp = `${apiQuery.startDate || 'start'}_${apiQuery.endDate || 'end'}`
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `committee-dataset_${stamp}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    const csvHeader = [
      'journeyUid',
      'sourceJourneyUid',
      'committeeCircuit',
      'temporalBucket',
      'committeeFlags',
      'durationHours',
      'committeeEtl',
      'committeeReason',
      'mergedEtlStatus',
      'mergedReason',
      'preliminaryCircuit',
      'plate',
      'startedAt',
      'endedAt',
    ]
    const csvRows = metaList.map((m) => {
      const summ = summaryByUid.get(m.syntheticJourneyUid)
      const hint = committeeEtlHintFromMeta(m)
      return [
        m.syntheticJourneyUid,
        m.sourceJourneyUid,
        m.committeeOperationalCircuit,
        m.temporalBucket,
        m.committeeFlags.join('|'),
        (m.durationMs / 3600000).toFixed(3),
        hint.etl,
        hint.reason,
        summ?.etlStatus ?? '',
        summ?.reason ?? '',
        summ?.preliminaryCircuitCode ?? '',
        summ?.plate ?? '',
        summ?.startedAt ?? m.startedAt,
        summ?.endedAt ?? m.endedAt,
      ]
    })
    downloadCsv(`committee-dataset_${stamp}.csv`, csvHeader, csvRows)
  }, [
    apiQuery,
    appliedTimeRangeLabel,
    committeePipeline,
    events,
    eventsUnfiltered,
    rawAlerts,
    rawAlertsOperational,
    summaryJourneyRowsWithNearby,
    timeFilterMode,
    useUsefulWindow,
    usefulWindow.usefulWindowEnd,
    usefulWindow.usefulWindowStart,
    usefulWindow.windowValid,
  ])

  const committeeEtlTotals = useMemo(
    () => ({
      included: summaryJourneyRowsWithNearby.filter((r) => r.etlStatus === 'included').length,
      review: summaryJourneyRowsWithNearby.filter((r) => r.etlStatus === 'review_required').length,
      excluded: summaryJourneyRowsWithNearby.filter((r) => r.etlStatus === 'excluded').length,
    }),
    [summaryJourneyRowsWithNearby]
  )

  const circuitSourceRows = useMemo(() => {
    if (!drawerCircuitCode) return []
    const list = circuitFilteredJourneys.filter((j) => j.preliminaryCircuitCode === drawerCircuitCode)
    return list.map((j) => {
      const sum = summaryByJourneyUid.get(j.journeyUid)
      const alerts = normalizedAlertsForDiagnostics.filter((a) => {
        if (a.journeyUid && a.journeyUid === j.journeyUid) return true
        if (a.normalizedPlate && a.normalizedPlate === j.normalizedPlate) return true
        return false
      })
      const alertCodes = [...new Set(alerts.map((a) => a.alertCode).filter(Boolean))]
      const evidencePoints = [...new Set(j.logicalCodeSequence.filter((c) => c !== 'UNKNOWN'))]
      const missingExpectedPoints = j.missingExpectedPoints ?? []
      const classificationRuleId = `${j.preliminaryCircuitGroup ?? j.preliminaryCircuitCode}_${j.preliminaryCircuitVariant ?? 'BASE'}`
      const nearby = nearbyByJourneyUid.get(j.journeyUid)
      return {
        etlStatus: (sum?.etlStatus ?? 'included') as 'included' | 'review_required' | 'excluded',
        journeyUid: j.journeyUid,
        plate: j.plate,
        startedAt: j.startedAt,
        endedAt: j.endedAt,
        durationMinutes: j.durationMinutes,
        eventCount: j.eventCount,
        preliminaryCircuitCode: j.preliminaryCircuitCode,
        preliminaryCircuitVariant: j.preliminaryCircuitVariant ?? '—',
        preliminaryCircuitConfidence: j.preliminaryCircuitConfidence,
        classificationRuleId,
        classificationReason: j.classificationReason ?? j.preliminaryCircuitReason,
        missingExpectedPoints,
        evidencePoints,
        alertCodes,
        reviewReason: sum?.etlStatus === 'review_required' ? sum.reason : '',
        exclusionReason: sum?.etlStatus === 'excluded' ? sum.reason : '',
        logicalSequence: j.logicalCodeSequence,
        rawSequence: j.rawSectorSequence,
        deviceSequence: j.deviceCodeSequence,
        alerts,
        inUsefulWindow: sum?.inUsefulWindow ?? true,
        events: j.events,
        hasNearbyRelevantAlerts: nearby?.hasNearbyRelevantAlerts ?? false,
        nearbyAlertCodes: nearby?.nearbyAlertCodes ?? [],
        possibleMissingPointsExplained: nearby?.possibleMissingPointsExplained ?? [],
        reconstructionSuggestion: nearby?.reconstructionSuggestion ?? '',
      }
    })
  }, [circuitFilteredJourneys, drawerCircuitCode, nearbyByJourneyUid, normalizedAlertsForDiagnostics, summaryByJourneyUid])

  const circuitSourceSummary = useMemo(() => {
    const rows = circuitSourceRows
    const eventsCount = rows.reduce((s, r) => s + r.eventCount, 0)
    const plates = new Set(rows.map((r) => r.plate).filter(Boolean)).size
    const alertsCount = rows.reduce((s, r) => s + r.alertCodes.length, 0)
    const inside = rows.filter((r) => r.inUsefulWindow).length
    const outside = rows.length - inside
    const included = rows.filter((r) => r.etlStatus === 'included').length
    const review = rows.filter((r) => r.etlStatus === 'review_required').length
    const excluded = rows.filter((r) => r.etlStatus === 'excluded').length
    return { eventsCount, plates, alertsCount, inside, outside, included, review, excluded }
  }, [circuitSourceRows])

  const exportCircuitosCsv = useCallback(() => {
    const header = [
      'journeyUid',
      'patente',
      'firstEventAt',
      'lastEventAt',
      'durationMinutes',
      'circuitCode',
      'circuitName',
      'confidence',
      'missingExpectedPoints',
      'excludedRearCameraEventsCount',
      'classificationReason',
      'rawDeviceSequence',
      'logicalPointSequence',
      'rawSectorSequence',
    ]
    const rows = circuitFilteredJourneys.map((j) => [
      j.journeyUid,
      j.plate,
      j.startedAt,
      j.endedAt,
      String(j.durationMinutes),
      j.preliminaryCircuitCode,
      j.preliminaryCircuitName,
      j.preliminaryCircuitConfidence,
      (j.missingExpectedPoints ?? []).join('|'),
      String(j.excludedRearCameraEventsCount ?? 0),
      j.classificationReason ?? j.preliminaryCircuitReason,
      j.rawDeviceSequence.join(' > '),
      j.logicalCodeSequence.join(' > '),
      j.rawSectorSequence.join(' > '),
    ])
    const start = circuitRangeStartDate || selectedDay || 'inicio'
    const end = circuitRangeEndDate || selectedDay || 'fin'
    downloadCsv(`circuitos-preliminares_ricardone_${start}_${end}.csv`, header, rows)
  }, [circuitFilteredJourneys, circuitRangeEndDate, circuitRangeStartDate, selectedDay])

  const loadJourneyEventsForAlert = useCallback(async (journeyUid: string) => {
    if (!journeyUid.trim()) return
    setSelectedAlertJourneyLoading(true)
    setSelectedAlertJourneyError(null)
    try {
      const eventsForJourney = await fetchJourneyEvents({
        journeyUuid: journeyUid,
        startDate: alertsQuery.startDate,
        endDate: alertsQuery.endDate,
      })
      setSelectedAlertJourneyEvents(eventsForJourney)
    } catch (e) {
      setSelectedAlertJourneyError(e instanceof Error ? e.message : String(e))
      setSelectedAlertJourneyEvents([])
    } finally {
      setSelectedAlertJourneyLoading(false)
    }
  }, [alertsQuery.endDate, alertsQuery.startDate])

  const exportAlertsCsv = useCallback(() => {
    const rows = showExcludedRearAlerts ? normalizedExcludedRearAlertsStandalone : normalizedAlertsStandalone
    if (!rows.length) return
    const header = [
      'alertId',
      'occurredAt',
      'normalizedPlate',
      'isValidPlate',
      'journeyUid',
      'sectorCode',
      'deviceCode',
      'site',
      'alertCode',
      'alertType',
      'reason',
      'description',
      'alertLevel',
    ]
    const lines = rows.map((r) => [
      r.alertId,
      r.occurredAt,
      r.normalizedPlate,
      String(r.isValidPlate),
      r.journeyUid,
      r.sectorCode,
      r.deviceCode,
      r.site,
      r.alertCode,
      r.alertType,
      r.reason,
      r.description,
      String(r.alertLevel),
    ])
    const csv =
      '\uFEFF' +
      [header, ...lines]
        .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `alertas-truckflow_${alertsQuery.startDate || 'start'}_${alertsQuery.endDate || 'end'}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [alertsQuery.endDate, alertsQuery.startDate, normalizedAlertsStandalone, normalizedExcludedRearAlertsStandalone, showExcludedRearAlerts])

  const exportAlertsJson = useCallback(() => {
    const payload = {
      metadata: {
        generatedAt: new Date().toISOString(),
        source: 'truckflow-api',
        baseUrl: REAL_TRUCKFLOW_BASE_URL,
        query: alertsQuery,
        totalAlerts: normalizedAlertsStandalone.length,
        rawAlertsCount: alertsRawStandalone.length,
        rearCameraFilter: standaloneRearAlertFilterTrace.metadata,
      },
      rawAlerts: alertsRawStandalone,
      operationalAlerts: alertsRawStandaloneOperational,
      excludedRearAlerts: standaloneRearAlertFilterTrace.excludedRearAlerts,
      excludedIngressRouteAlerts: standaloneRearAlertFilterTrace.excludedIngressRouteAlerts,
      normalizedAlerts: normalizedAlertsStandalone,
      summaries: {
        total: alertsSummary.total,
        validPlate: alertsSummary.validPlate,
        invalidPlate: alertsSummary.invalidPlate,
        withJourney: alertsSummary.withJourney,
        withoutJourney: alertsSummary.withoutJourney,
        invalidRoute: alertsSummary.invalidRoute,
        sectorDevice: alertsSummary.sectorDevice,
        mostFrequentLevel: alertsSummary.mostFrequentLevel,
        mostFrequentType: alertsSummary.mostFrequentType,
      },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `alertas-truckflow_${alertsQuery.startDate || 'start'}_${alertsQuery.endDate || 'end'}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [alertsQuery, alertsRawStandalone, alertsRawStandaloneOperational, normalizedAlertsStandalone, alertsSummary, standaloneRearAlertFilterTrace.excludedIngressRouteAlerts, standaloneRearAlertFilterTrace.excludedRearAlerts, standaloneRearAlertFilterTrace.metadata])

  const exportRawEventsJson = useCallback(() => {
    const payload = {
      metadata: { generatedAt: new Date().toISOString(), source: 'truckflow-api', query: apiQuery, count: eventsUnfiltered.length },
      events: eventsUnfiltered,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `events-raw_${apiQuery.startDate || 'start'}_${apiQuery.endDate || 'end'}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [apiQuery, eventsUnfiltered])

  const exportRawEventsCsv = useCallback(() => {
    const header = ['id', 'occurredAt', 'createdAt', 'journeyUid', 'sequenceNumber', 'truckPlate', 'sectorCode', 'deviceCode', 'eventType', 'alertLevel']
    const rows = eventsUnfiltered.map((e) => [e.id, e.occurredAt, e.createdAt ?? e.recordedAt, e.journeyUid, e.sequenceNumber, e.truckPlate, e.sectorCode, e.deviceCode, e.eventType, e.alertLevel])
    const csv = '\uFEFF' + [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `events-raw_${apiQuery.startDate || 'start'}_${apiQuery.endDate || 'end'}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [apiQuery.endDate, apiQuery.startDate, eventsUnfiltered])

  const loadPowerBiExportPeriod = useCallback(async () => {
    setPowerBiPeriodValidationError(null)
    setPowerBiExportLoadError(null)
    setPowerBiExportBundleError(null)
    const start = parsePowerBiLocalStart(powerBiExportStartDate, powerBiExportStartTime)
    const end = parsePowerBiLocalEnd(powerBiExportEndDate, powerBiExportEndTime)
    if (start > end) {
      setPowerBiPeriodValidationError('La fecha y hora final debe ser posterior o igual al inicio.')
      return
    }
    const params: RealTruckflowQueryParams = {
      startDate: toIsoLocalDateTime(start),
      endDate: toIsoLocalDateTime(end),
    }
    setPowerBiExportLoading(true)
    try {
      const [eventList, alertList] = await Promise.all([fetchJourneyEvents(params), fetchAlerts(params)])
      await yieldToMain()
      const ricardoneOnly = filterRicardoneSiteEventsOnly(eventList)
      await yieldToMain()
      const committee = buildCommitteeOperationalPipeline(ricardoneOnly, alertList)
      await yieldToMain()
      const cds = buildCleanRealDataset(committee.segmentedOperationalEvents, committee.alertsAlignedToSegments)
      await yieldToMain()
      const committeeMinimalArtifacts = buildCommitteePowerBiMinimalFromSegmented(
        committee.segmentedOperationalEvents,
        committee.alertsAlignedToSegments
      )
      await yieldToMain()
      setPowerBiExportLoaded({
        queryStart: params.startDate ?? '',
        queryEnd: params.endDate ?? '',
        loadedAtIso: new Date().toISOString(),
        eventsReceived: ricardoneOnly.length,
        alertsReceived: alertList.length,
        operationalEvents: committee.executiveSummary.operationalEventCount,
        operationalAlerts: committee.executiveSummary.operationalAlertCount,
        circuitsGenerated: cds.reconstructedJourneysRaw.length,
        zeroEventsNotice: ricardoneOnly.length === 0,
        zeroAlertsNotice: alertList.length === 0,
        eventsRicardone: ricardoneOnly,
        alertsRaw: alertList,
        committee,
        committeeMinimalArtifacts,
      })
    } catch (e) {
      setPowerBiExportLoadError(e instanceof Error ? e.message : String(e))
      setPowerBiExportLoaded(null)
    } finally {
      setPowerBiExportLoading(false)
    }
  }, [powerBiExportStartDate, powerBiExportStartTime, powerBiExportEndDate, powerBiExportEndTime])

  const exportPowerBiCommitteeSingleCsv = useCallback(
    (key: PowerBiCommitteeCsvKey) => {
      if (!powerBiExportLoaded) return
      setPowerBiExportBundleError(null)
      try {
        const want = POWER_BI_COMMITTEE_FILENAMES[key]
        const file = powerBiExportLoaded.committeeMinimalArtifacts.find((a) => a.filename === want)
        if (!file) {
          setPowerBiExportBundleError(`No se generó el archivo ${want}. Volvé a cargar el período.`)
          return
        }
        triggerSinglePowerBiCsvDownload(file)
      } catch (e) {
        setPowerBiExportBundleError(e instanceof Error ? e.message : String(e))
      }
    },
    [powerBiExportLoaded]
  )

  const exportPowerBiDebugZip = useCallback(() => {
    if (!powerBiExportLoaded) return
    setPowerBiExportBundleError(null)
    try {
      const exportedAtIso = new Date().toISOString()
      const artifacts = buildCommitteePowerBiEtlExport({
        apiBaseUrl: resolveRealTruckflowApiOrigin(),
        selectedStartDatetime: powerBiExportLoaded.queryStart,
        selectedEndDatetime: powerBiExportLoaded.queryEnd,
        queryStart: powerBiExportLoaded.queryStart,
        queryEnd: powerBiExportLoaded.queryEnd,
        exportedAtIso,
        lastLoadedAt: powerBiExportLoaded.loadedAtIso,
        eventsRawRicardone: powerBiExportLoaded.eventsRicardone,
        alertsRaw: powerBiExportLoaded.alertsRaw,
        committee: powerBiExportLoaded.committee,
      })
      downloadPowerBiNamedCsvZipSync(artifacts, { variant: 'debug' })
    } catch (e) {
      setPowerBiExportBundleError(e instanceof Error ? e.message : String(e))
    }
  }, [powerBiExportLoaded])

  const powerBiExportLoadedSummary = useMemo(
    () =>
      powerBiExportLoaded
        ? {
            queryStart: powerBiExportLoaded.queryStart,
            queryEnd: powerBiExportLoaded.queryEnd,
            loadedAtIso: powerBiExportLoaded.loadedAtIso,
            eventsReceived: powerBiExportLoaded.eventsReceived,
            alertsReceived: powerBiExportLoaded.alertsReceived,
            operationalEvents: powerBiExportLoaded.operationalEvents,
            operationalAlerts: powerBiExportLoaded.operationalAlerts,
            circuitsGenerated: powerBiExportLoaded.circuitsGenerated,
            zeroEventsNotice: powerBiExportLoaded.zeroEventsNotice,
            zeroAlertsNotice: powerBiExportLoaded.zeroAlertsNotice,
          }
        : null,
    [powerBiExportLoaded]
  )

  const exportKpiJson = useCallback(() => {
    const included = summaryJourneys.filter((x) => x.etlStatus === 'included')
    const review = summaryJourneys.filter((x) => x.etlStatus === 'review_required')
    const excluded = summaryJourneys.filter((x) => x.etlStatus === 'excluded')
    const payload = {
      metadata: {
        generatedAt: new Date().toISOString(),
        source: 'truckflow-api',
        startDate: apiQuery.startDate ?? '',
        endDate: apiQuery.endDate ?? '',
        useUsefulWindow,
        firstIngresoAt: usefulWindow.firstIngresoAt,
        lastIngresoAt: usefulWindow.lastIngresoAt,
        usefulWindowStart: usefulWindow.usefulWindowStart,
        usefulWindowEnd: usefulWindow.usefulWindowEnd,
        rawEventCount: eventsUnfiltered.length,
        rawAlertCount: rawAlerts.length,
        operationalEventCount: events.length,
        operationalAlertCount: rawAlertsOperational.length,
        rearCameraFilter: rearCameraFilterTrace.metadata,
        eventsInsideUsefulWindow: usefulWindow.insideCount,
        eventsOutsideUsefulWindow: usefulWindow.outsideCount,
        includedJourneyCount: included.length,
        reviewJourneyCount: review.length,
        excludedJourneyCount: excluded.length,
        cleaningRules: {
          excludeInvalidPlate: true,
          excludeLprMalfunction: true,
          excludeOnlyIngresoRutaProbable: true,
          excludeOnlyEgresoRutaProbable: true,
          invalidRouteAsReview: true,
          invalidStartJourneyAsReview: true,
        },
      },
      events: {
        raw: eventsUnfiltered,
        operational: events,
        excludedRear: rearCameraFilterTrace.excludedRearEvents,
        insideUsefulWindow: summaryDataset.rawEvents,
        outsideUsefulWindow: eventsUnfiltered.filter((e) => !summaryDataset.rawEvents.some((x) => x.id === e.id && x.journeyUid === e.journeyUid)),
      },
      alerts: {
        raw: rawAlerts,
        operational: rawAlertsOperational,
        excludedRear: rearCameraFilterTrace.excludedRearAlerts,
        excludedIngressRoute: rearCameraFilterTrace.excludedIngressRouteAlerts,
        normalized: normalizedAlertsStandalone,
      },
      journeys: {
        included,
        review,
        excluded,
      },
      kpiInput: {
        cleanJourneys: included,
        reviewJourneys: review,
        cleanEvents: summaryDataset.cleanEvents,
      },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `truckflow-clean-kpi_${apiQuery.startDate || 'start'}_${apiQuery.endDate || 'end'}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [apiQuery.endDate, apiQuery.startDate, events, eventsUnfiltered, normalizedAlertsStandalone, rawAlerts, rawAlertsOperational, rearCameraFilterTrace.excludedIngressRouteAlerts, rearCameraFilterTrace.excludedRearAlerts, rearCameraFilterTrace.excludedRearEvents, rearCameraFilterTrace.metadata, summaryDataset, summaryJourneys, useUsefulWindow, usefulWindow.firstIngresoAt, usefulWindow.insideCount, usefulWindow.lastIngresoAt, usefulWindow.outsideCount, usefulWindow.usefulWindowEnd, usefulWindow.usefulWindowStart])

  const exportSummaryKpiCsv = useCallback(() => {
    const header = ['etlStatus', 'motivo', 'journeyUid', 'patente', 'inicio', 'fin', 'duracion', 'circuito', 'alertCodes', 'secuenciaLogica', 'secuenciaRaw', 'enVentana']
    const rows = summaryJourneys.map((r) => [r.etlStatus, r.reason, r.journeyUid, r.plate, r.startedAt, r.endedAt, r.durationMinutes, r.preliminaryCircuitCode, r.alertCodes.join('|'), r.logicalSequence.join(' > '), r.rawSequence.join(' > '), r.inUsefulWindow ? 'si' : 'no'])
    const csv = '\uFEFF' + [header, ...rows].map((x) => x.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `truckflow-clean-kpi-summary_${apiQuery.startDate || 'start'}_${apiQuery.endDate || 'end'}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [apiQuery.endDate, apiQuery.startDate, summaryJourneys])

  const exportClassificationAuditCsv = useCallback(() => {
    const header = [
      'journeyUid','patente','etlStatus','preliminaryCircuitGroup','preliminaryCircuitVariant','classificationRuleId','classificationReason',
      'missingExpectedPoints','evidencePoints','alertCodes','reviewReason','exclusionReason','logicalCodeSequence','sectorCodeSequence',
      'deviceCodeSequence','excludedRearCameraEventsCount','startAt','endAt','durationMin','insideUsefulWindow','hasNearbyRelevantAlerts','nearbyAlertCodes','possibleMissingPointsExplained','reconstructionSuggestion',
    ]
    const rows = summaryJourneyRowsWithNearby.map((r) => {
      const j = journeys.find((x) => x.journeyUid === r.journeyUid)
      const group = j?.preliminaryCircuitGroup ?? j?.preliminaryCircuitCode ?? ''
      const variant = j?.preliminaryCircuitVariant ?? ''
      const evidence = [...new Set(j?.logicalCodeSequence.filter((c) => c !== 'UNKNOWN') ?? [])]
      return [
        r.journeyUid, r.plate, r.etlStatus, group, variant, `${group}_${variant || 'BASE'}`, j?.classificationReason ?? j?.preliminaryCircuitReason ?? '',
        (j?.missingExpectedPoints ?? []).join('|'), evidence.join('|'), r.alertCodes.join('|'),
        r.etlStatus === 'review_required' ? r.reason : '',
        r.etlStatus === 'excluded' ? r.reason : '',
        r.logicalSequence.join(' > '),
        j?.rawSectorSequence.join(' > ') ?? '',
        j?.deviceCodeSequence.join(' > ') ?? '',
        String(j?.excludedRearCameraEventsCount ?? 0),
        r.startedAt, r.endedAt, String(r.durationMinutes), r.inUsefulWindow ? 'true' : 'false',
        String(r.hasNearbyRelevantAlerts), r.nearbyAlertCodes.join('|'), r.possibleMissingPointsExplained.join('|'), r.reconstructionSuggestion,
      ]
    })
    const csv = '\uFEFF' + [header, ...rows].map((x) => x.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `classification-audit_${apiQuery.startDate || 'start'}_${apiQuery.endDate || 'end'}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [apiQuery.endDate, apiQuery.startDate, journeys, summaryJourneyRowsWithNearby])

  const lprQualitySummary = useMemo(() => {
    const alertsNorm = rawAlertsForDiagnostics.map((a) => normalizeRealAlertForView(a))
    const eventsTotal = events.length
    const alertsTotal = alertsNorm.length
    const lprAlerts = alertsNorm.filter((a) => (a.alertCode || a.alertType).toUpperCase() === 'LPR_MALFUNCTION')
    const invalidRoute = alertsNorm.filter((a) => (a.alertCode || a.alertType).toUpperCase() === 'INVALID_ROUTE').length
    const invalidStart = alertsNorm.filter((a) => (a.alertCode || a.alertType).toUpperCase() === 'INVALID_START_JOURNEY').length
    const lprIndexPer100Events = eventsTotal > 0 ? (lprAlerts.length / eventsTotal) * 100 : null
    return {
      eventsTotal,
      alertsTotal,
      lprCount: lprAlerts.length,
      lprIndexPer100Events,
      lprPctAlerts: alertsTotal > 0 ? (lprAlerts.length / alertsTotal) * 100 : 0,
      invalidRoute,
      invalidStart,
      hasOver100Index: Boolean(lprIndexPer100Events !== null && lprIndexPer100Events > 100),
    }
  }, [events, rawAlertsForDiagnostics])

  const lprByCameraRows = useMemo(() => {
    const alertsNorm = rawAlertsForDiagnostics.map((a) => normalizeRealAlertForView(a))
    const byCameraEvents = new Map<string, number>()
    for (const e of events) {
      const d = (e.deviceCode || '').trim() || 'SIN_DEVICE'
      const s = (e.sectorCode || '').trim() || 'SIN_SECTOR'
      const key = `${d}__${s}`
      byCameraEvents.set(key, (byCameraEvents.get(key) ?? 0) + 1)
    }
    const lprByCamera = new Map<string, typeof alertsNorm>()
    const alertsByCameraAll = new Map<string, number>()
    for (const a of alertsNorm) {
      const d = (a.deviceCode || '').trim() || 'SIN_DEVICE'
      const s = (a.sectorCode || '').trim() || 'SIN_SECTOR'
      const key = `${d}__${s}`
      alertsByCameraAll.set(key, (alertsByCameraAll.get(key) ?? 0) + 1)
    }
    for (const a of alertsNorm) {
      const code = (a.alertCode || a.alertType).toUpperCase()
      if (code !== 'LPR_MALFUNCTION') continue
      const d = (a.deviceCode || '').trim() || 'SIN_DEVICE'
      const s = (a.sectorCode || '').trim() || 'SIN_SECTOR'
      const key = `${d}__${s}`
      if (!lprByCamera.has(key)) lprByCamera.set(key, [])
      lprByCamera.get(key)!.push(a)
    }
    const keys = new Set([...byCameraEvents.keys(), ...lprByCamera.keys()])
    return [...keys].map((k) => {
      const [deviceCode, sectorCode] = k.split('__')
      const evCount = byCameraEvents.get(k) ?? 0
      const lprList = lprByCamera.get(k) ?? []
      const descFreq = new Map<string, number>()
      for (const a of lprList) {
        const key = a.description || a.reason || a.message || 'sin descripción'
        descFreq.set(key, (descFreq.get(key) ?? 0) + 1)
      }
      const topInvalid = [...descFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
      const sortedDates = lprList
        .map((a) => String((a.raw as Record<string, unknown>).createdAt ?? a.occurredAt))
        .filter(Boolean)
        .sort()
      const lprIndexPer100VisibleEvents = evCount > 0 ? (lprList.length / evCount) * 100 : null
      const cameraAlertsTotal = alertsByCameraAll.get(k) ?? 0
      const lprShareOnCameraAlerts = cameraAlertsTotal > 0 ? (lprList.length / cameraAlertsTotal) * 100 : 0
      const status =
        lprIndexPer100VisibleEvents === null
          ? (lprList.length > 0 ? 'sin base de eventos visibles' : 'sin actividad')
          : lprIndexPer100VisibleEvents <= 10
            ? 'Bajo'
            : lprIndexPer100VisibleEvents <= 30
              ? 'Medio'
              : lprIndexPer100VisibleEvents <= 100
                ? 'Alto'
                : 'Crítico'
      return {
        deviceCode,
        sectorCode,
        eventsAssociated: evCount,
        lprAlerts: lprList.length,
        lprIndexPer100VisibleEvents,
        lprShareOnCameraAlerts,
        status,
        mostFrequentInvalidRead: topInvalid,
        firstAlert: sortedDates[0] ?? '',
        lastAlert: sortedDates[sortedDates.length - 1] ?? '',
        noVisibleEventBaseHint: evCount === 0 && lprList.length > 0,
      }
    }).sort((a, b) => b.lprAlerts - a.lprAlerts)
  }, [events, rawAlertsForDiagnostics])

  const lprFailedReadRows = useMemo(() => {
    const alertsNorm = rawAlertsForDiagnostics.map((a) => normalizeRealAlertForView(a))
    return alertsNorm
      .filter((a) => (a.alertCode || a.alertType).toUpperCase() === 'LPR_MALFUNCTION')
      .map((a) => {
        const raw = a.raw as Record<string, unknown>
        return {
          createdAt: String(raw.createdAt ?? a.occurredAt ?? ''),
          deviceCode: a.deviceCode || '—',
          sectorCode: a.sectorCode || '—',
          description: a.description || a.reason || a.message || 'sin descripción',
          payloadPlate: String(a.payload.plate ?? '—'),
          payloadNormalizedPlate: String(a.payload.normalizedPlate ?? '—'),
          alertCode: a.alertCode || a.alertType || '—',
          severity: String(raw.severity ?? a.alertLevel ?? '—'),
        }
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [rawAlertsForDiagnostics])

  const lprSourceMeta = useMemo(
    () => ({
      sourceMode: dataSource === 'api' ? 'API real' : 'archivo local',
      startDate: apiQuery.startDate ?? '',
      endDate: apiQuery.endDate ?? '',
      rawEventCount: events.length,
      rawAlertCount: rawAlertsForDiagnostics.length,
      usingRawEvents: false,
      lastLoadedAt,
    }),
    [apiQuery.endDate, apiQuery.startDate, dataSource, events.length, lastLoadedAt, rawAlertsForDiagnostics.length]
  )

  const lprCameraAuditData = useMemo(() => {
    if (!lprCameraAudit) return null
    const { deviceCode, sectorCode } = lprCameraAudit
    const eventsForCamera = eventsUnfiltered.filter(
      (e) => (e.deviceCode || 'SIN_DEVICE') === deviceCode && (e.sectorCode || 'SIN_SECTOR') === sectorCode
    )
    const alertsForCamera = lprFailedReadRows.filter(
      (a) => (a.deviceCode || 'SIN_DEVICE') === deviceCode && (a.sectorCode || 'SIN_SECTOR') === sectorCode
    )
    const byHourEvents = new Map<string, number>()
    for (const e of eventsForCamera) {
      const d = new Date(e.occurredAt)
      if (!Number.isFinite(d.getTime())) continue
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`
      byHourEvents.set(key, (byHourEvents.get(key) ?? 0) + 1)
    }
    const byHourLpr = new Map<string, number>()
    for (const a of alertsForCamera) {
      const d = new Date(a.createdAt)
      if (!Number.isFinite(d.getTime())) continue
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`
      byHourLpr.set(key, (byHourLpr.get(key) ?? 0) + 1)
    }
    const hourlyKeys = [...new Set([...byHourEvents.keys(), ...byHourLpr.keys()])].sort()
    const hourlySeries = hourlyKeys.map((h) => ({
      hour: h,
      events: byHourEvents.get(h) ?? 0,
      lprAlerts: byHourLpr.get(h) ?? 0,
    }))
    return {
      deviceCode,
      sectorCode,
      eventsForCamera,
      alertsForCamera,
      eventCount: eventsForCamera.length,
      alertCount: alertsForCamera.length,
      rangeStart: apiQuery.startDate ?? '',
      rangeEnd: apiQuery.endDate ?? '',
      hourlySeries,
    }
  }, [apiQuery.endDate, apiQuery.startDate, eventsUnfiltered, lprCameraAudit, lprFailedReadRows])

  const lprGeneralBars = useMemo(
    () => [
      { label: 'Eventos visibles', value: lprQualitySummary.eventsTotal, color: '#334155' },
      { label: 'Alertas LPR', value: lprQualitySummary.lprCount, color: '#dc2626' },
      { label: 'Invalid route', value: lprQualitySummary.invalidRoute, color: '#d97706' },
      { label: 'Invalid start', value: lprQualitySummary.invalidStart, color: '#9333ea' },
    ],
    [lprQualitySummary]
  )

  const exportLprSummaryCsv = useCallback(() => {
    const header = [
      'deviceCode',
      'sectorCode',
      'eventosFisicosVisibles',
      'alertasLpr',
      'alertasLprCada100EventosVisibles',
      'estado',
      'participacionLprSobreAlertasCamara',
      'lecturaInvalidaMasFrecuente',
      'primerAlerta',
      'ultimaAlerta',
    ]
    const rows = lprByCameraRows.map((r) => [
      r.deviceCode,
      r.sectorCode,
      r.eventsAssociated,
      r.lprAlerts,
      r.lprIndexPer100VisibleEvents === null ? 'sin base de eventos visibles' : r.lprIndexPer100VisibleEvents.toFixed(2),
      r.status,
      r.lprShareOnCameraAlerts.toFixed(2),
      r.mostFrequentInvalidRead,
      r.firstAlert,
      r.lastAlert,
    ])
    downloadCsv(`lpr-summary_${apiQuery.startDate || 'start'}_${apiQuery.endDate || 'end'}.csv`, header, rows)
  }, [apiQuery.endDate, apiQuery.startDate, lprByCameraRows])

  const exportLprGeneralPng = useCallback(() => {
    exportSimpleBarPng(
      `lpr-general_${apiQuery.startDate || 'start'}_${apiQuery.endDate || 'end'}.png`,
      'Calidad general de lectura LPR',
      lprGeneralBars
    )
  }, [apiQuery.endDate, apiQuery.startDate, lprGeneralBars])

  const exportLprCameraChartPng = useCallback(() => {
    const top = lprByCameraRows
      .filter((r) => r.lprIndexPer100VisibleEvents !== null)
      .slice(0, 20)
      .map((r) => ({
        label: r.deviceCode,
        value: r.lprIndexPer100VisibleEvents ?? 0,
        color:
          r.status === 'Bajo'
            ? '#16a34a'
            : r.status === 'Medio'
              ? '#f59e0b'
              : r.status === 'Alto'
                ? '#ea580c'
                : '#dc2626',
      }))
    exportSimpleBarPng(
      `lpr-camaras_${apiQuery.startDate || 'start'}_${apiQuery.endDate || 'end'}.png`,
      'Indicador LPR por cámara',
      top
    )
  }, [apiQuery.endDate, apiQuery.startDate, lprByCameraRows])

  const exportLprCameraCsv = useCallback(() => {
    if (!lprCameraAuditData) return
    const header = ['tipo', 'fecha', 'deviceCode', 'sectorCode', 'journeyUid', 'truckPlate', 'description', 'payloadPlate', 'payloadNormalizedPlate', 'severity']
    const eventRows = lprCameraAuditData.eventsForCamera.map((e) => [
      'evento',
      e.occurredAt,
      e.deviceCode,
      e.sectorCode,
      e.journeyUid,
      e.truckPlate,
      '',
      '',
      '',
      String(e.alertLevel),
    ])
    const alertRows = lprCameraAuditData.alertsForCamera.map((a) => [
      'alerta_lpr',
      a.createdAt,
      a.deviceCode,
      a.sectorCode,
      '',
      '',
      a.description,
      a.payloadPlate,
      a.payloadNormalizedPlate,
      a.severity,
    ])
    downloadCsv(
      `lpr-camera_${lprCameraAuditData.deviceCode}_${lprCameraAuditData.sectorCode}_${apiQuery.startDate || 'start'}_${apiQuery.endDate || 'end'}.csv`,
      header,
      [...eventRows, ...alertRows]
    )
  }, [apiQuery.endDate, apiQuery.startDate, lprCameraAuditData])

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

  const loadingForView = unifiedPeriod ? wsOpt!.status === 'loading' : loading
  const errorForView = unifiedPeriod ? (wsOpt!.status === 'error' ? wsOpt!.error : null) : error

  return (
    <RealJourneyDiagnosticsView
      loading={loadingForView}
      error={errorForView}
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
      timeFilterMode={timeFilterMode}
      setTimeFilterMode={setTimeFilterMode}
      timeFilterMonth={timeFilterMonth}
      setTimeFilterMonth={setTimeFilterMonth}
      timeFilterWeek={timeFilterWeek}
      setTimeFilterWeek={setTimeFilterWeek}
      timeFilterDay={timeFilterDay}
      setTimeFilterDay={setTimeFilterDay}
      timeFilterAllDay={timeFilterAllDay}
      setTimeFilterAllDay={setTimeFilterAllDay}
      timeFilterStartTime={timeFilterStartTime}
      setTimeFilterStartTime={setTimeFilterStartTime}
      timeFilterEndTime={timeFilterEndTime}
      setTimeFilterEndTime={setTimeFilterEndTime}
      appliedTimeRangeLabel={appliedTimeRangeLabel}
      applyTimeFilter={applyTimeFilter}
      prelimCircuitFilter={prelimCircuitFilter}
      setPrelimCircuitFilter={setPrelimCircuitFilter}
      circuitRangeStartDate={circuitRangeStartDate}
      setCircuitRangeStartDate={setCircuitRangeStartDate}
      circuitRangeEndDate={circuitRangeEndDate}
      setCircuitRangeEndDate={setCircuitRangeEndDate}
      journeyQuickFilter={journeyQuickFilter}
      setJourneyQuickFilter={setJourneyQuickFilter}
      depurationScopeFilter={depurationScopeFilter}
      setDepurationScopeFilter={setDepurationScopeFilter}
      onlyThisPlateScope={onlyThisPlateScope}
      setOnlyThisPlateScope={setOnlyThisPlateScope}
      plateQuery={plateQuery}
      setPlateQuery={setPlateQuery}
      plateNorm={plateNorm}
      journeyQuery={journeyQuery}
      setJourneyQuery={setJourneyQuery}
      journeyQueryNorm={journeyQueryNorm}
      interplantWindowHours={interplantWindowHours}
      setInterplantWindowHours={setInterplantWindowHours}
      mainTab={mainTab}
      setMainTab={setMainTab}
      showExcludedRearEvents={showExcludedRearEvents}
      setShowExcludedRearEvents={setShowExcludedRearEvents}
      showExcludedRearAlerts={showExcludedRearAlerts}
      setShowExcludedRearAlerts={setShowExcludedRearAlerts}
      rearCameraFilterTrace={rearCameraFilterTrace}
      standaloneRearAlertFilterTrace={standaloneRearAlertFilterTrace}
      journeys={journeys}
      events={events}
      eventsUnfiltered={eventsUnfiltered}
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
      apiQuery={apiQuery}
      setApiQuery={setApiQuery}
      rawAlerts={rawAlerts}
      etlLoadingEvents={etlLoadingEvents}
      etlLoadingAlerts={etlLoadingAlerts}
      etlError={etlError}
      lastQueryUrl={lastQueryUrl}
      cleanDataset={cleanDataset}
      datasetProcessedAt={datasetProcessedAt}
      loadEtlEvents={loadEtlEvents}
      loadEtlAlerts={loadEtlAlerts}
      loadEtlAll={loadEtlAll}
      processCleanDataset={processCleanDataset}
      exportCleanDatasetJson={exportCleanDatasetJson}
      exportCleanSummaryCsv={exportCleanSummaryCsv}
      alertsQuery={alertsQuery}
      setAlertsQuery={setAlertsQuery}
      alertsLoading={alertsLoading}
      alertsError={alertsError}
      alertsLastQueryUrl={alertsLastQueryUrl}
      alertsLastQueriedAt={alertsLastQueriedAt}
      alertsQuickFilter={alertsQuickFilter}
      setAlertsQuickFilter={setAlertsQuickFilter}
      normalizedAlertsStandalone={normalizedAlertsStandalone}
      filteredAlertsStandalone={filteredAlertsStandalone}
      alertsSummary={alertsSummary}
      selectedAlert={selectedAlert}
      setSelectedAlert={setSelectedAlert}
      selectedAlertJourneyEvents={selectedAlertJourneyEvents}
      selectedAlertJourneyLoading={selectedAlertJourneyLoading}
      selectedAlertJourneyError={selectedAlertJourneyError}
      loadAlertsStandalone={loadAlertsStandalone}
      clearAlertsFilters={clearAlertsFilters}
      exportAlertsCsv={exportAlertsCsv}
      exportAlertsJson={exportAlertsJson}
      loadJourneyEventsForAlert={loadJourneyEventsForAlert}
      setSelectedAlertJourneyEvents={setSelectedAlertJourneyEvents}
      setRawAlerts={setRawAlerts}
      loadSummaryAll={loadSummaryAll}
      useUsefulWindow={useUsefulWindow}
      setUseUsefulWindow={setUseUsefulWindow}
      usefulWindow={usefulWindow}
      summaryJourneys={summaryJourneys}
      summaryFilter={summaryFilter}
      setSummaryFilter={setSummaryFilter}
      exportKpiJson={exportKpiJson}
      exportSummaryKpiCsv={exportSummaryKpiCsv}
      exportRawEventsJson={exportRawEventsJson}
      exportRawEventsCsv={exportRawEventsCsv}
      exportPowerBiCommitteeSingleCsv={exportPowerBiCommitteeSingleCsv}
      exportPowerBiDebugZip={exportPowerBiDebugZip}
      powerBiExportStartDate={powerBiExportStartDate}
      setPowerBiExportStartDate={setPowerBiExportStartDate}
      powerBiExportStartTime={powerBiExportStartTime}
      setPowerBiExportStartTime={setPowerBiExportStartTime}
      powerBiExportEndDate={powerBiExportEndDate}
      setPowerBiExportEndDate={setPowerBiExportEndDate}
      powerBiExportEndTime={powerBiExportEndTime}
      setPowerBiExportEndTime={setPowerBiExportEndTime}
      loadPowerBiExportPeriod={loadPowerBiExportPeriod}
      powerBiExportLoading={powerBiExportLoading}
      powerBiPeriodValidationError={powerBiPeriodValidationError}
      powerBiExportLoadError={powerBiExportLoadError}
      powerBiExportBundleError={powerBiExportBundleError}
      powerBiExportLoadedSummary={powerBiExportLoadedSummary}
      lastLoadedAt={lastLoadedAt}
      circuitSourceRows={circuitSourceRows}
      circuitSourceSummary={circuitSourceSummary}
      selectedCircuitJourneyUid={selectedCircuitJourneyUid}
      setSelectedCircuitJourneyUid={setSelectedCircuitJourneyUid}
      exportClassificationAuditCsv={exportClassificationAuditCsv}
      exportCircuitosCsv={exportCircuitosCsv}
      nearbyDrawerJourneyUid={nearbyDrawerJourneyUid}
      setNearbyDrawerJourneyUid={setNearbyDrawerJourneyUid}
      nearbyBackwardHours={nearbyBackwardHours}
      setNearbyBackwardHours={setNearbyBackwardHours}
      nearbyForwardHours={nearbyForwardHours}
      setNearbyForwardHours={setNearbyForwardHours}
      nearbyIncludeExpectedSectors={nearbyIncludeExpectedSectors}
      setNearbyIncludeExpectedSectors={setNearbyIncludeExpectedSectors}
      nearbyIncludeSimilarPlates={nearbyIncludeSimilarPlates}
      setNearbyIncludeSimilarPlates={setNearbyIncludeSimilarPlates}
      nearbyIncludeLpr={nearbyIncludeLpr}
      setNearbyIncludeLpr={setNearbyIncludeLpr}
      nearbyDrawerResult={nearbyDrawerResult}
      applyAlertsHourPreset={applyAlertsHourPreset}
      nearbyAlertsLoading={nearbyAlertsLoading}
      nearbyAlertsError={nearbyAlertsError}
      associateNearbyAlert={associateNearbyAlert}
      lprQualitySummary={lprQualitySummary}
      lprByCameraRows={lprByCameraRows}
      lprFailedReadRows={lprFailedReadRows}
      lprSourceMeta={lprSourceMeta}
      lprCameraAudit={lprCameraAudit}
      setLprCameraAudit={setLprCameraAudit}
      lprCameraAuditData={lprCameraAuditData}
      lprGeneralBars={lprGeneralBars}
      exportLprSummaryCsv={exportLprSummaryCsv}
      exportLprGeneralPng={exportLprGeneralPng}
      exportLprCameraChartPng={exportLprCameraChartPng}
      exportLprCameraCsv={exportLprCameraCsv}
      committeeExecutiveSummary={committeePipeline.executiveSummary}
      committeeAlertsAlignedCount={rawAlertsOperational.length}
      committeeEtlTotals={committeeEtlTotals}
      committeeIncludedBarItems={committeeIncludedBarItems}
      committeeReviewBarItems={committeeReviewBarItems}
      committeeLprBarItems={committeeLprBarItems}
      exportCommitteeDataset={exportCommitteeDataset}
      hideLegacyPeriodFilters={unifiedPeriod || true}
      renderEtlExportTab={unifiedPeriod ? () => <EtlExportTab /> : undefined}
    />
  )
}
