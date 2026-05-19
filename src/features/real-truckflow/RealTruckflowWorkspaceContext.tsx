import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { filterRicardoneSiteEventsOnly } from '../../services/realJourneyEventsMapper'
import {
  alertDtoListFromRawExtractedRows,
  fetchAlerts,
  fetchJourneyEvents,
  journeyDtoListFromRawExtractedRowsChunked,
  type RealTruckflowQueryParams,
} from '../../services/realTruckflowApi'
import { buildCommitteeOperationalPipeline } from '../../services/realCommitteePipeline'
import { buildCleanRealDataset } from '../../services/realTruckflowCleanDataset'
import type {
  LoadedRangeIso,
  LocalAnalysisPhase,
  LocalDiskLoadSummary,
  LocalFilesPowerBiMeta,
  LoadTimingRow,
  WorkspaceLastLoadCounts,
  WorkspaceLoadStage,
  WorkPeriodStatus,
} from './workspaceTypes'
import {
  LARGE_RAW_ALERTS_THRESHOLD,
  LARGE_RAW_EVENTS_THRESHOLD,
  LOAD_PERIOD_GLOBAL_MS,
  RANGE_WARNING_HOURS,
} from './workspaceConstants'
import {
  parseLocalPeriodEnd,
  parseLocalPeriodStart,
  toDateInputValue,
  toIsoLocalDateTime,
} from './dateTime'
import { yieldToMain } from './yieldToMain'
import { postTruckflowLoadLocalPeriod } from './api/truckflowLocalServerApi'
import {
  filterRealAlertsBySiteScope,
  filterRealEventsBySiteScope,
  type TruckflowSiteScope,
} from './siteScopeFilters'

export type RealTruckflowWorkspaceContextValue = {
  status: WorkPeriodStatus
  error: string | null
  loadStage: WorkspaceLoadStage
  rangeStartDate: string
  rangeStartTime: string
  rangeEndDate: string
  rangeEndTime: string
  setRangeStartDate: Dispatch<SetStateAction<string>>
  setRangeStartTime: Dispatch<SetStateAction<string>>
  setRangeEndDate: Dispatch<SetStateAction<string>>
  setRangeEndTime: Dispatch<SetStateAction<string>>
  loadedRange: LoadedRangeIso | null
  loadedAt: string | null
  rawEventsRicardone: import('../../services/realJourneyEvents.types').RealJourneyEventDto[]
  rawAlerts: import('../../services/realTruckflowApi').RealAlertDto[]
  committee: import('../../services/realCommitteePipeline').CommitteePipelineResult | null
  cleanDataset: ReturnType<typeof buildCleanRealDataset> | null
  /** Dataset limpio omitido por volumen; usar `processDeferredCleanDataset`. */
  cleanDatasetDeferred: boolean
  cleanDatasetProcessing: boolean
  cleanDatasetError: string | null
  lastLoadCounts: WorkspaceLastLoadCounts | null
  lastTimingRows: LoadTimingRow[]
  loadPeriod: () => Promise<void>
  clearData: () => void
  processDeferredCleanDataset: () => Promise<void>

  localAnalysisPhase: LocalAnalysisPhase
  localAnalysisError: string | null
  localStagingEvents: import('../../services/realJourneyEvents.types').RealJourneyEventDto[]
  localStagingAlerts: import('../../services/realTruckflowApi').RealAlertDto[]
  localDiskLoadSummary: LocalDiskLoadSummary | null
  localPendingSiteScope: TruckflowSiteScope | null
  localDatasetProcessing: boolean
  localFilesPowerBiMeta: LocalFilesPowerBiMeta | null
  loadLocalJsonPeriod: (startDate: string, endDate: string, siteScope: TruckflowSiteScope) => Promise<void>
  processLocalDataset: () => Promise<void>
}

const RealTruckflowWorkspaceContext = createContext<RealTruckflowWorkspaceContextValue | undefined>(undefined)

export function useRealTruckflowWorkspaceOptional(): RealTruckflowWorkspaceContextValue | undefined {
  return useContext(RealTruckflowWorkspaceContext)
}

export function useRealTruckflowWorkspace(): RealTruckflowWorkspaceContextValue {
  const v = useContext(RealTruckflowWorkspaceContext)
  if (!v) throw new Error('useRealTruckflowWorkspace debe usarse dentro de RealTruckflowWorkspaceProvider')
  return v
}

export function RealTruckflowWorkspaceProvider({ children }: { children: ReactNode }) {
  const loadGenerationRef = useRef(0)

  const [rangeStartDate, setRangeStartDate] = useState(() => toDateInputValue(new Date()))
  const [rangeStartTime, setRangeStartTime] = useState('00:00')
  const [rangeEndDate, setRangeEndDate] = useState(() => toDateInputValue(new Date()))
  const [rangeEndTime, setRangeEndTime] = useState('23:59')

  const [status, setStatus] = useState<WorkPeriodStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [loadStage, setLoadStage] = useState<WorkspaceLoadStage>('idle')
  const [loadedRange, setLoadedRange] = useState<LoadedRangeIso | null>(null)
  const [loadedAt, setLoadedAt] = useState<string | null>(null)
  const [rawEventsRicardone, setRawEventsRicardone] =
    useState<RealTruckflowWorkspaceContextValue['rawEventsRicardone']>([])
  const [rawAlerts, setRawAlerts] = useState<RealTruckflowWorkspaceContextValue['rawAlerts']>([])
  const [committee, setCommittee] = useState<RealTruckflowWorkspaceContextValue['committee']>(null)
  const [cleanDataset, setCleanDataset] = useState<RealTruckflowWorkspaceContextValue['cleanDataset']>(null)
  const [cleanDatasetDeferred, setCleanDatasetDeferred] = useState(false)
  const [cleanDatasetProcessing, setCleanDatasetProcessing] = useState(false)
  const [cleanDatasetError, setCleanDatasetError] = useState<string | null>(null)
  const [lastLoadCounts, setLastLoadCounts] = useState<WorkspaceLastLoadCounts | null>(null)
  const [lastTimingRows, setLastTimingRows] = useState<LoadTimingRow[]>([])

  const [localAnalysisPhase, setLocalAnalysisPhase] = useState<LocalAnalysisPhase>('none')
  const [localAnalysisError, setLocalAnalysisError] = useState<string | null>(null)
  const [localStagingEvents, setLocalStagingEvents] =
    useState<RealTruckflowWorkspaceContextValue['localStagingEvents']>([])
  const [localStagingAlerts, setLocalStagingAlerts] =
    useState<RealTruckflowWorkspaceContextValue['localStagingAlerts']>([])
  const [localDiskLoadSummary, setLocalDiskLoadSummary] = useState<LocalDiskLoadSummary | null>(null)
  const [localPendingSiteScope, setLocalPendingSiteScope] = useState<TruckflowSiteScope | null>(null)
  const [localDatasetProcessing, setLocalDatasetProcessing] = useState(false)
  const [localFilesPowerBiMeta, setLocalFilesPowerBiMeta] = useState<LocalFilesPowerBiMeta | null>(null)
  const [localPendingDateRange, setLocalPendingDateRange] = useState<{ startDate: string; endDate: string } | null>(
    null
  )

  const clearData = useCallback(() => {
    loadGenerationRef.current += 1
    setStatus('idle')
    setError(null)
    setLoadStage('idle')
    setLoadedRange(null)
    setLoadedAt(null)
    setRawEventsRicardone([])
    setRawAlerts([])
    setCommittee(null)
    setCleanDataset(null)
    setCleanDatasetDeferred(false)
    setCleanDatasetProcessing(false)
    setCleanDatasetError(null)
    setLastLoadCounts(null)
    setLastTimingRows([])
    setLocalAnalysisPhase('none')
    setLocalAnalysisError(null)
    setLocalStagingEvents([])
    setLocalStagingAlerts([])
    setLocalDiskLoadSummary(null)
    setLocalPendingSiteScope(null)
    setLocalDatasetProcessing(false)
    setLocalFilesPowerBiMeta(null)
    setLocalPendingDateRange(null)
  }, [])

  const processDeferredCleanDataset = useCallback(async () => {
    if (!committee) {
      setCleanDatasetError('No hay pipeline comité cargado.')
      return
    }
    setCleanDatasetError(null)
    setCleanDatasetProcessing(true)
    setLoadStage('clean_dataset')
    try {
      await yieldToMain()
      const t0 = performance.now()
      const cds = buildCleanRealDataset(committee.segmentedOperationalEvents, committee.alertsAlignedToSegments)
      const buildMs = performance.now() - t0
      await yieldToMain()
      console.info(`[real-truckflow] buildCleanRealDataset (diferido) ${buildMs.toFixed(1)} ms`)
      setCleanDataset(cds)
      setCleanDatasetDeferred(false)
      setLoadStage('ready')
      setLastLoadCounts((prev) =>
        prev
          ? {
              ...prev,
              circuitsApprox: cds.reconstructedJourneysRaw.length,
            }
          : prev
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setCleanDatasetError(msg)
      setLoadStage('ready')
    } finally {
      setCleanDatasetProcessing(false)
    }
  }, [committee])

  const loadLocalJsonPeriod = useCallback(async (startDate: string, endDate: string, siteScope: TruckflowSiteScope) => {
    loadGenerationRef.current += 1
    setLocalAnalysisError(null)
    setLocalDatasetProcessing(false)
    setLocalFilesPowerBiMeta(null)
    setStatus('idle')
    setError(null)
    setLoadedRange(null)
    setLoadedAt(null)
    setCommittee(null)
    setCleanDataset(null)
    setCleanDatasetDeferred(false)
    setRawEventsRicardone([])
    setRawAlerts([])
    setLastLoadCounts(null)
    setLastTimingRows([])
    setLoadStage('idle')

    try {
      const res = await postTruckflowLoadLocalPeriod({ startDate, endDate })
      await yieldToMain()
      const eventsDto = await journeyDtoListFromRawExtractedRowsChunked(res.events as unknown[])
      await yieldToMain()
      const alertsDto = alertDtoListFromRawExtractedRows(res.alerts as unknown[])
      const evScoped = filterRealEventsBySiteScope(eventsDto, siteScope)
      const alScoped = filterRealAlertsBySiteScope(alertsDto, siteScope)
      setLocalStagingEvents(evScoped)
      setLocalStagingAlerts(alScoped)
      setLocalDiskLoadSummary({ daysLoaded: res.daysLoaded, dataRoot: res.dataRoot })
      setLocalPendingSiteScope(siteScope)
      setLocalPendingDateRange({ startDate, endDate })
      setLocalAnalysisPhase('staging')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLocalAnalysisError(msg)
      setLocalAnalysisPhase('none')
      setLocalStagingEvents([])
      setLocalStagingAlerts([])
      setLocalDiskLoadSummary(null)
      setLocalPendingSiteScope(null)
      setLocalPendingDateRange(null)
    }
  }, [])

  const processLocalDataset = useCallback(async () => {
    if (localAnalysisPhase !== 'staging') {
      setLocalAnalysisError('Primero cargá archivos locales.')
      return
    }
    setLocalAnalysisError(null)
    setLocalDatasetProcessing(true)
    setLoadStage('committee_pipeline')
    try {
      await yieldToMain()
      const eventsIn = localStagingEvents
      const alertsIn = localStagingAlerts
      const committeeResult = buildCommitteeOperationalPipeline(eventsIn, alertsIn)
      await yieldToMain()
      setLoadStage('clean_dataset')
      const cds = buildCleanRealDataset(
        committeeResult.segmentedOperationalEvents,
        committeeResult.alertsAlignedToSegments
      )
      await yieldToMain()

      const exec = committeeResult.executiveSummary

      const range = localPendingDateRange
      const startIso = range ? `${range.startDate}T00:00:00` : ''
      const endIso = range ? `${range.endDate}T23:59:59` : ''

      const counts: WorkspaceLastLoadCounts = {
        eventsApiCount: eventsIn.length,
        alertsApiCount: alertsIn.length,
        ricardoneEventCount: filterRicardoneSiteEventsOnly(eventsIn).length,
        operationalEventCount: exec.operationalEventCount,
        operationalAlertCount: exec.operationalAlertCount,
        circuitsApprox: cds.reconstructedJourneysRaw.length,
      }

      setCommittee(committeeResult)
      setCleanDataset(cds)
      setRawEventsRicardone(eventsIn)
      setRawAlerts(alertsIn)
      setLoadedRange({ startIso, endIso })
      setLoadedAt(new Date().toISOString())
      setLastLoadCounts(counts)
      setCleanDatasetDeferred(false)
      setStatus('loaded')
      setLoadStage('ready')

      const daysLoaded = localDiskLoadSummary?.daysLoaded ?? 0
      setLocalFilesPowerBiMeta({
        source_mode: 'local_files',
        local_folder: 'data/truckflow',
        start_date: range?.startDate ?? '',
        end_date: range?.endDate ?? '',
        days_loaded: daysLoaded,
      })
      setLocalAnalysisPhase('processed')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLocalAnalysisError(msg)
      setLoadStage('idle')
    } finally {
      setLocalDatasetProcessing(false)
    }
  }, [
    localAnalysisPhase,
    localStagingAlerts,
    localStagingEvents,
    localDiskLoadSummary?.daysLoaded,
    localPendingDateRange,
  ])

  const loadPeriod = useCallback(async () => {
    setLocalAnalysisPhase('none')
    setLocalStagingEvents([])
    setLocalStagingAlerts([])
    setLocalDiskLoadSummary(null)
    setLocalPendingSiteScope(null)
    setLocalPendingDateRange(null)
    setLocalFilesPowerBiMeta(null)
    setLocalAnalysisError(null)

    setError(null)
    setCleanDatasetError(null)
    setLastTimingRows([])

    const start = parseLocalPeriodStart(rangeStartDate, rangeStartTime)
    const end = parseLocalPeriodEnd(rangeEndDate, rangeEndTime)
    if (start > end) {
      setError('La fecha y hora final debe ser posterior o igual al inicio.')
      setStatus('error')
      setLoadStage('idle')
      return
    }

    const rangeMs = end.getTime() - start.getTime()
    const rangeHours = rangeMs / 3_600_000
    if (rangeHours > RANGE_WARNING_HOURS) {
      const ok = window.confirm(
        'El rango es grande y puede demorar. Recomendado trabajar por ventanas de 4 a 6 horas.\n\n¿Continuar con la carga?'
      )
      if (!ok) {
        setLoadStage('idle')
        setStatus('idle')
        return
      }
    }

    const startIso = toIsoLocalDateTime(start)
    const endIso = toIsoLocalDateTime(end)
    if (!startIso.trim() || !endIso.trim()) {
      setError('Rango inválido: faltan fecha/hora de inicio o fin.')
      setStatus('error')
      setLoadStage('idle')
      return
    }

    const params: RealTruckflowQueryParams = {
      startDate: startIso,
      endDate: endIso,
    }

    loadGenerationRef.current += 1
    const session = loadGenerationRef.current

    const masterAbort = new AbortController()
    const globalDeadlineTimer = window.setTimeout(() => {
      masterAbort.abort()
    }, LOAD_PERIOD_GLOBAL_MS)

    const globalT0 = performance.now()
    const budgetMs = () => Math.max(3_000, LOAD_PERIOD_GLOBAL_MS - (performance.now() - globalT0))

    const isActive = () => session === loadGenerationRef.current

    const timing: LoadTimingRow[] = []

    setStatus('loading')
    setLoadStage('fetching_events')
    setCleanDatasetDeferred(false)

    try {
      const tEv0 = performance.now()
      setLoadStage('fetching_events')
      const eventList = await fetchJourneyEvents(params, {
        signal: masterAbort.signal,
        timeoutMs: budgetMs(),
      })
      const fetchEventsMs = performance.now() - tEv0
      timing.push({
        etapa: 'fetch eventos',
        ms: Math.round(fetchEventsMs * 10) / 10,
        detalle: `${eventList.length.toLocaleString()} filas`,
      })
      if (!isActive()) return
      await yieldToMain()

      const tAl0 = performance.now()
      setLoadStage('fetching_alerts')
      const alertList = await fetchAlerts(params, {
        signal: masterAbort.signal,
        timeoutMs: budgetMs(),
      })
      const fetchAlertsMs = performance.now() - tAl0
      timing.push({
        etapa: 'fetch alertas',
        ms: Math.round(fetchAlertsMs * 10) / 10,
        detalle: `${alertList.length.toLocaleString()} filas`,
      })
      if (!isActive()) return
      await yieldToMain()

      setLoadStage('filtering_ricardone')
      const tRi0 = performance.now()
      const ricardoneOnly = filterRicardoneSiteEventsOnly(eventList)
      const filterRicMs = performance.now() - tRi0
      timing.push({
        etapa: 'filtro Ricardone',
        ms: Math.round(filterRicMs * 10) / 10,
        detalle: `${ricardoneOnly.length.toLocaleString()} eventos`,
      })
      if (!isActive()) return
      await yieldToMain()

      setLoadStage('committee_pipeline')
      const tCo0 = performance.now()
      const committeeResult = buildCommitteeOperationalPipeline(ricardoneOnly, alertList)
      const committeeMs = performance.now() - tCo0
      timing.push({
        etapa: 'buildCommitteeOperationalPipeline',
        ms: Math.round(committeeMs * 10) / 10,
        detalle: `oper_evt=${committeeResult.executiveSummary.operationalEventCount}, oper_alt=${committeeResult.executiveSummary.operationalAlertCount}`,
      })
      if (!isActive()) return
      await yieldToMain()

      const hugeVolume =
        eventList.length > LARGE_RAW_EVENTS_THRESHOLD || alertList.length > LARGE_RAW_ALERTS_THRESHOLD

      let cds: ReturnType<typeof buildCleanRealDataset> | null = null
      let cleanMs = 0
      if (hugeVolume) {
        timing.push({
          etapa: 'buildCleanRealDataset',
          ms: 0,
          detalle: `omitido (>${LARGE_RAW_EVENTS_THRESHOLD} evt o >${LARGE_RAW_ALERTS_THRESHOLD} alertas)`,
        })
        setCleanDatasetDeferred(true)
      } else {
        setLoadStage('clean_dataset')
        const tCl0 = performance.now()
        cds = buildCleanRealDataset(
          committeeResult.segmentedOperationalEvents,
          committeeResult.alertsAlignedToSegments
        )
        cleanMs = performance.now() - tCl0
        timing.push({
          etapa: 'buildCleanRealDataset',
          ms: Math.round(cleanMs * 10) / 10,
          detalle: `${cds.reconstructedJourneysRaw.length} circuitos raw`,
        })
        setCleanDatasetDeferred(false)
      }
      if (!isActive()) return
      await yieldToMain()

      const exec = committeeResult.executiveSummary
      const circuitsApprox =
        cds?.reconstructedJourneysRaw.length ?? exec.journeysProcessedCount

      const counts: WorkspaceLastLoadCounts = {
        eventsApiCount: eventList.length,
        alertsApiCount: alertList.length,
        ricardoneEventCount: ricardoneOnly.length,
        operationalEventCount: exec.operationalEventCount,
        operationalAlertCount: exec.operationalAlertCount,
        circuitsApprox,
      }

      setLoadStage('committing_state')
      const tSt0 = performance.now()
      setRawEventsRicardone(ricardoneOnly)
      setRawAlerts(alertList)
      setCommittee(committeeResult)
      setCleanDataset(cds)
      setLoadedRange({ startIso: params.startDate ?? '', endIso: params.endDate ?? '' })
      setLoadedAt(new Date().toISOString())
      setLastLoadCounts(counts)
      await yieldToMain()
      await yieldToMain()
      const setStateMs = performance.now() - tSt0
      timing.push({
        etapa: 'setState / flush React',
        ms: Math.round(setStateMs * 10) / 10,
        detalle: 'tras doble yieldToMain',
      })

      if (!isActive()) return

      console.table(timing)
      console.info('[real-truckflow] Período cargado', counts)

      setLastTimingRows(timing)
      setLoadStage('ready')
      setStatus('loaded')
      setLocalAnalysisPhase('none')
      setLocalFilesPowerBiMeta(null)
    } catch (e) {
      if (!isActive()) return
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setStatus('error')
      setLoadStage('idle')
      setRawEventsRicardone([])
      setRawAlerts([])
      setCommittee(null)
      setCleanDataset(null)
      setCleanDatasetDeferred(false)
      setLoadedRange(null)
      setLoadedAt(null)
      setLastLoadCounts(null)
      setLastTimingRows(timing.length ? timing : [])
      if (timing.length) console.table(timing)
    } finally {
      window.clearTimeout(globalDeadlineTimer)
    }
  }, [rangeEndDate, rangeEndTime, rangeStartDate, rangeStartTime])

  const value = useMemo<RealTruckflowWorkspaceContextValue>(
    () => ({
      status,
      error,
      loadStage,
      rangeStartDate,
      rangeStartTime,
      rangeEndDate,
      rangeEndTime,
      setRangeStartDate,
      setRangeStartTime,
      setRangeEndDate,
      setRangeEndTime,
      loadedRange,
      loadedAt,
      rawEventsRicardone,
      rawAlerts,
      committee,
      cleanDataset,
      cleanDatasetDeferred,
      cleanDatasetProcessing,
      cleanDatasetError,
      lastLoadCounts,
      lastTimingRows,
      loadPeriod,
      clearData,
      processDeferredCleanDataset,
      localAnalysisPhase,
      localAnalysisError,
      localStagingEvents,
      localStagingAlerts,
      localDiskLoadSummary,
      localPendingSiteScope,
      localDatasetProcessing,
      localFilesPowerBiMeta,
      loadLocalJsonPeriod,
      processLocalDataset,
    }),
    [
      status,
      error,
      loadStage,
      rangeStartDate,
      rangeStartTime,
      rangeEndDate,
      rangeEndTime,
      loadedRange,
      loadedAt,
      rawEventsRicardone,
      rawAlerts,
      committee,
      cleanDataset,
      cleanDatasetDeferred,
      cleanDatasetProcessing,
      cleanDatasetError,
      lastLoadCounts,
      lastTimingRows,
      loadPeriod,
      clearData,
      processDeferredCleanDataset,
      localAnalysisPhase,
      localAnalysisError,
      localStagingEvents,
      localStagingAlerts,
      localDiskLoadSummary,
      localPendingSiteScope,
      localDatasetProcessing,
      localFilesPowerBiMeta,
      loadLocalJsonPeriod,
      processLocalDataset,
    ]
  )

  return (
    <RealTruckflowWorkspaceContext.Provider value={value}>{children}</RealTruckflowWorkspaceContext.Provider>
  )
}
