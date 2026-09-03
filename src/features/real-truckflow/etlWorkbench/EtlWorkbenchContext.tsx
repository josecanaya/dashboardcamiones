import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type ReactNode,
} from 'react'
import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import type { RealAlertDto } from '../../../services/realTruckflowApi'
import {
  alertDtoListFromRawExtractedRows,
  journeyDtoListFromRawExtractedRowsChunked,
} from '../../../services/realTruckflowApi'
import { yieldToBrowser } from '../../../utils/yieldToBrowser'
import { parseTruckflowJsonFile, type ParsedTruckflowFile } from './parseTruckflowJsonFiles'
import type { EtlTransformInput, EtlTransformOutput } from './etlTransformContracts'
import { buildKpiTiemposArtifacts, type KpiTiemposBuildInput } from './etlKpiTiemposBuild'
import {
  createTransformPhaseSession,
  runEtlTransformTramo,
  type TransformTramoId,
  type TransformTramoStatus,
} from './etlTransformPhaseRunner'
import type { EtlTransformPhaseStore } from './etlTransformPhaseStore'
import type { MovimientosContratoFileInput } from './etlExternalMovimientosContrato'
import {
  peekContratoXlsxKind,
  type TiemposEntrePasosFileInput,
} from './etlTiemposEntrePasos'
import { inferSiteIdFromSectorCode } from '../../../services/realJourneyEventsMapper'
import { occurredAtLocalDayKey } from '../../../services/realJourneyQuality'
import {
  countUniqueRawJourneyUids,
  enrichApiJourneyStatsFromRawEvents,
} from '../../../services/truckflowRawJourneyStats'
import {
  postTruckflowLoadLocalPeriod,
  type TruckflowApiJourneyDayStat,
} from '../api/truckflowLocalServerApi'
import { getTruckPlateRegistry } from '../api/truckPlateRegistryApi'
import { getMovimientosRange } from '../api/movimientosBackupApi'
import {
  resolveWindow,
  requestRunEtl,
  listWindows,
  type ResolveWindowResult,
  type SavedWindow,
} from '../api/etlRunCacheApi'
import { loadTransformOutputFromRun } from './etlTransformOutputFromDisk'
import {
  composeRunsIntoTransformOutput,
  computeRangeCoverage,
  persistedLegRowsToSegmentLegs,
  type RangeCoverage,
} from './etlComposeRuns'
import {
  rebuildSegmentTimingIndexFromLegs,
  segmentTimingKpiCsv,
  segmentTimingLegsCsv,
} from './etlSegmentTiming'
import {
  buildPlantVisitUpsertsFromTransform,
  type FleetDatabaseSaveResult,
} from './truckPlantVisitSync'
import { syncPlantVisits, FLEET_SYNC_BATCH_SIZE } from '../api/truckFleetApi'
import type { ContractFirstProgressEvent } from './etlContractFirstProgress'

export type EtlLoadSummary = {
  loadedEventFilesCount: number
  loadedAlertFilesCount: number
  rawEventsCount: number
  rawAlertsCount: number
  daysDetected: string[]
  timeMin?: string
  timeMax?: string
  sitesDetected: string[]
  parseErrors: string[]
}

export type { TruckflowApiJourneyDayStat }

export type EtlDiskPeriod = { startDate: string; endDate: string }

/** Info del rango compuesto a partir de varias corridas guardadas (sin reprocesar). */
export type ComposedRangeInfo = {
  from: string
  to: string
  usedRunIds: string[]
  missingDays: string[]
  legCount: number
  kpiRowCount: number
}

type Ctx = {
  loadSummary: EtlLoadSummary | null
  /** journeyUid distintos por carpeta de extracción (JSON crudo API, pre-ETL). */
  apiJourneyStatsPerDay: TruckflowApiJourneyDayStat[] | null
  /** Último rango descargado a disco (Extracción) o cargado en memoria. */
  diskPeriod: EtlDiskPeriod | null
  setDiskPeriod: (p: EtlDiskPeriod | null) => void
  parsedEventFiles: ParsedTruckflowFile[]
  parsedAlertFiles: ParsedTruckflowFile[]
  events: RealJourneyEventDto[]
  alerts: RealAlertDto[]
  busyLoad: boolean
  /** Trae los eventos crudos de la ventana ya hidratada (desde disco no vienen). Idempotente. */
  windowEventsBusy: boolean
  ensureWindowEventsLoaded: () => Promise<RealJourneyEventDto[]>
  /** Resultado del último transform (no se recalcula al render). */
  transformResult: EtlTransformOutput | null
  transformBusy: boolean
  transformError: string | null
  /** Run cacheado en disco para la ventana elegida (runs/_index/by-window.json). */
  cachedWindow: ResolveWindowResult | null
  /** Si hay run vigente para (from,to), hidrata transformResult desde disco. */
  loadWindowOrOffer: (from: string, to: string) => Promise<{ cached: boolean; stale?: boolean } | null>
  /** Reprocesa la ventana en el servidor (force) y rehidrata desde el run nuevo. */
  recomputeWindow: (from: string, to: string) => Promise<void>
  /** Procesos guardados (ventanas cacheadas), más reciente primero. */
  savedWindows: SavedWindow[]
  savedWindowsLoading: boolean
  refreshSavedWindows: () => Promise<void>
  /** Carga un proceso guardado a memoria desde disco (sin reprocesar). */
  hydrateSavedWindow: (w: SavedWindow) => Promise<void>
  /** Compone un rango arbitrario uniendo las corridas guardadas que lo cubren (sin reprocesar). */
  loadComposedRange: (from: string, to: string) => Promise<RangeCoverage | null>
  /** Info del último rango compuesto (corridas usadas, días faltantes). */
  composedRange: ComposedRangeInfo | null
  /** Tramo 4: KPI tiempos / dispersión (pestaña KPI Tiempos). */
  kpiTiemposBusy: boolean
  kpiTiemposError: string | null
  kpiTiemposBuilt: boolean
  /** Hay insumo en memoria para (re)calcular KPI de tiempos. False en corridas guardadas. */
  kpiTiemposPrepared: boolean
  runKpiTiempos: () => Promise<boolean>
  mergeWindowHours: number
  setMergeWindowHours: (h: number) => void
  movimientosContratoFiles: MovimientosContratoFileInput[]
  movimientosContratoFileNames: string[]
  tiemposEntrePasosFiles: TiemposEntrePasosFileInput[]
  tiemposEntrePasosFileNames: string[]
  loadMovimientosContratoXlsx: (list: FileList | File[]) => Promise<void>
  clearMovimientosContrato: () => void
  loadJsonFiles: (list: FileList | File[]) => Promise<void>
  /** Lee data/truckflow/YYYY-MM-DD/*.json del servidor local (un solo request). */
  loadLocalPeriod: (startDate: string, endDate: string) => Promise<boolean>
  clearLoaded: () => void
  runTransform: () => Promise<EtlTransformOutput | null>
  transformTramoStatus: Record<TransformTramoId, TransformTramoStatus>
  transformActiveTramo: TransformTramoId | null
  transformTramoCompleted: 0 | 1 | 2 | 3
  transformRunAllInProgress: boolean
  /** Último evento de progreso del Paso 1 (Excel ↔ Truckflow). */
  contractFirstProgress: ContractFirstProgressEvent | null
  runTransformTramo: (
    tramo: TransformTramoId,
    options?: { keepGlobalBusy?: boolean }
  ) => Promise<EtlTransformOutput | null>
  /** Guarda visitas del último transform en camion/visita_planta (manual, no automático). */
  fleetSaveBusy: boolean
  fleetSaveError: string | null
  fleetSaveMessage: string | null
  saveFleetDatabase: () => Promise<FleetDatabaseSaveResult | null>
}

const EtlWorkbenchContext = createContext<Ctx | null>(null)

function dedupeKeyEvent(e: RealJourneyEventDto): string {
  return `${e.journeyUid}|${e.id}|${e.occurredAt}`
}

function dedupeKeyAlert(a: RealAlertDto): string {
  return `${String(a.journeyUid ?? a.journeyUuid ?? '')}|${String(a.id ?? '')}|${String(a.occurredAt ?? a.createdAt ?? '')}`
}

function buildLoadSummary(
  evFiles: ParsedTruckflowFile[],
  alFiles: ParsedTruckflowFile[],
  events: RealJourneyEventDto[],
  alerts: RealAlertDto[],
  parseErrors: string[]
): EtlLoadSummary {
  const days = new Set<string>()
  const sites = new Set<string>()
  let tmin: string | undefined
  let tmax: string | undefined

  const touchIso = (iso: string | undefined) => {
    const s = String(iso ?? '').trim()
    if (!s) return
    days.add(occurredAtLocalDayKey(s))
    if (!tmin || s < tmin) tmin = s
    if (!tmax || s > tmax) tmax = s
  }

  for (const e of events) {
    touchIso(e.occurredAt)
    const sid = inferSiteIdFromSectorCode(e.sectorCode)
    if (sid !== 'unknown') sites.add(sid)
  }
  for (const a of alerts) {
    touchIso(String(a.occurredAt ?? a.createdAt ?? ''))
    const sec = String(a.sectorCode ?? a.sector ?? '')
    const sid = inferSiteIdFromSectorCode(sec)
    if (sid !== 'unknown') sites.add(sid)
  }

  for (const f of evFiles) {
    if (f.dayHint && /^\d{4}-\d{2}-\d{2}$/.test(f.dayHint)) days.add(f.dayHint)
  }
  for (const f of alFiles) {
    if (f.dayHint && /^\d{4}-\d{2}-\d{2}$/.test(f.dayHint)) days.add(f.dayHint)
  }

  return {
    loadedEventFilesCount: evFiles.length,
    loadedAlertFilesCount: alFiles.length,
    rawEventsCount: events.length,
    rawAlertsCount: alerts.length,
    daysDetected: [...days].sort(),
    timeMin: tmin,
    timeMax: tmax,
    sitesDetected: [...sites].sort(),
    parseErrors,
  }
}

export function EtlWorkbenchProvider({ children }: { children: ReactNode }) {
  const [busyLoad, setBusyLoad] = useState(false)
  const [parsedEventFiles, setParsedEventFiles] = useState<ParsedTruckflowFile[]>([])
  const [parsedAlertFiles, setParsedAlertFiles] = useState<ParsedTruckflowFile[]>([])
  const [events, setEvents] = useState<RealJourneyEventDto[]>([])
  const [alerts, setAlerts] = useState<RealAlertDto[]>([])
  const [windowEventsBusy, setWindowEventsBusy] = useState(false)
  const windowEventsInflightRef = useRef<Promise<RealJourneyEventDto[]> | null>(null)
  const [loadSummary, setLoadSummary] = useState<EtlLoadSummary | null>(null)
  const [apiJourneyStatsPerDay, setApiJourneyStatsPerDay] = useState<TruckflowApiJourneyDayStat[] | null>(
    null
  )
  const [diskPeriod, setDiskPeriod] = useState<EtlDiskPeriod | null>(null)
  const [transformResult, setTransformResult] = useState<EtlTransformOutput | null>(null)
  const [cachedWindow, setCachedWindow] = useState<ResolveWindowResult | null>(null)
  const [savedWindows, setSavedWindows] = useState<SavedWindow[]>([])
  const [savedWindowsLoading, setSavedWindowsLoading] = useState(false)
  /** Info del último rango compuesto (varias corridas guardadas unidas sin reprocesar). */
  const [composedRange, setComposedRange] = useState<ComposedRangeInfo | null>(null)
  const [fleetSaveBusy, setFleetSaveBusy] = useState(false)
  const [fleetSaveError, setFleetSaveError] = useState<string | null>(null)
  const [fleetSaveMessage, setFleetSaveMessage] = useState<string | null>(null)
  const [transformBusy, setTransformBusy] = useState(false)
  const [transformError, setTransformError] = useState<string | null>(null)
  const [kpiTiemposBusy, setKpiTiemposBusy] = useState(false)
  const [kpiTiemposError, setKpiTiemposError] = useState<string | null>(null)
  const [kpiTiemposBuilt, setKpiTiemposBuilt] = useState(false)
  const kpiTiemposPreparedRef = useRef<KpiTiemposBuildInput | null>(null)
  /**
   * ¿Hay insumo en memoria para (re)calcular KPI de tiempos?
   *
   * Solo lo produce `runTransform`. Una corrida guardada hidrata tablas y stats pero
   * NO el insumo (los journeys reconstruidos con sus eventos no se persisten), así que
   * sin esta bandera el botón «Procesar KPI» quedaba habilitado y fallaba siempre.
   * Va en estado y no solo en el ref porque la UI necesita re-renderizar con el cambio.
   */
  const [kpiTiemposPrepared, setKpiTiemposPrepared] = useState(false)
  const transformPhaseStoreRef = useRef<EtlTransformPhaseStore>(createTransformPhaseSession())
  const [transformTramoStatus, setTransformTramoStatus] = useState<
    Record<TransformTramoId, TransformTramoStatus>
  >({ 1: 'idle', 2: 'idle', 3: 'idle' })
  const [transformActiveTramo, setTransformActiveTramo] = useState<TransformTramoId | null>(null)
  const [contractFirstProgress, setContractFirstProgress] = useState<ContractFirstProgressEvent | null>(
    null
  )

  const onContractFirstProgress = useCallback((ev: ContractFirstProgressEvent) => {
    console.info('[CONTRACT_FIRST_PROGRESS]', ev)
    startTransition(() => setContractFirstProgress(ev))
  }, [])
  const [transformTramoCompleted, setTransformTramoCompleted] = useState<0 | 1 | 2 | 3>(0)
  const [transformRunAllInProgress, setTransformRunAllInProgress] = useState(false)

  const resetKpiTiemposState = useCallback(() => {
    kpiTiemposPreparedRef.current = null
    setKpiTiemposPrepared(false)
    setKpiTiemposBuilt(false)
    setKpiTiemposError(null)
  }, [])

  const [mergeWindowHours, setMergeWindowHours] = useState(2)
  const [movimientosContratoFiles, setMovimientosContratoFiles] = useState<MovimientosContratoFileInput[]>(
    []
  )
  const [tiemposEntrePasosFiles, setTiemposEntrePasosFiles] = useState<TiemposEntrePasosFileInput[]>([])

  const movimientosContratoFileNames = useMemo(
    () => movimientosContratoFiles.map((f) => f.sourceFile),
    [movimientosContratoFiles]
  )

  const tiemposEntrePasosFileNames = useMemo(
    () => tiemposEntrePasosFiles.map((f) => f.sourceFile),
    [tiemposEntrePasosFiles]
  )

  const clearMovimientosContrato = useCallback(() => {
    setMovimientosContratoFiles([])
    setTiemposEntrePasosFiles([])
  }, [])

  const loadMovimientosContratoXlsx = useCallback(async (list: FileList | File[]) => {
    const files = [...list].filter((f) => /\.xlsx?$/i.test(f.name))
    const movLoaded: MovimientosContratoFileInput[] = []
    const tepLoaded: TiemposEntrePasosFileInput[] = []
    const unknownNames: string[] = []
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer()
      const item = { sourceFile: file.name, arrayBuffer }
      const kind = peekContratoXlsxKind(arrayBuffer)
      if (kind === 'tiempos_entre_pasos') tepLoaded.push(item)
      else if (kind === 'movimientos_contrato') movLoaded.push(item)
      else unknownNames.push(file.name)
    }
    if (unknownNames.length) {
      console.warn('[ETL] XLSX no reconocido (ni Movimientos ni TiemposEntrePasos):', unknownNames)
    }
    setMovimientosContratoFiles((prev) => {
      const byName = new Map(prev.map((p) => [p.sourceFile, p]))
      for (const item of movLoaded) byName.set(item.sourceFile, item)
      return [...byName.values()]
    })
    setTiemposEntrePasosFiles((prev) => {
      const byName = new Map(prev.map((p) => [p.sourceFile, p]))
      for (const item of tepLoaded) byName.set(item.sourceFile, item)
      return [...byName.values()]
    })
  }, [])

  const clearLoaded = useCallback(() => {
    setParsedEventFiles([])
    setParsedAlertFiles([])
    setEvents([])
    setAlerts([])
    setLoadSummary(null)
    setApiJourneyStatsPerDay(null)
    setDiskPeriod(null)
    setTransformResult(null)
    setCachedWindow(null)
    setTransformError(null)
    resetKpiTiemposState()
    transformPhaseStoreRef.current = createTransformPhaseSession()
    setTransformTramoStatus({ 1: 'idle', 2: 'idle', 3: 'idle' })
    setTransformTramoCompleted(0)
    setMovimientosContratoFiles([])
    setTiemposEntrePasosFiles([])
  }, [resetKpiTiemposState])

function buildApiJourneyStatsFromParsedFiles(
  evFiles: ParsedTruckflowFile[],
  alFiles: ParsedTruckflowFile[]
): TruckflowApiJourneyDayStat[] {
  const dayKeys = new Set<string>()
  for (const f of [...evFiles, ...alFiles]) {
    if (f.dayHint && /^\d{4}-\d{2}-\d{2}$/.test(f.dayHint)) dayKeys.add(f.dayHint)
  }
  const days = [...dayKeys].sort()
  return days.map((day) => {
    const evRecs = evFiles.filter((f) => f.dayHint === day).flatMap((f) => f.records)
    const alRecs = alFiles.filter((f) => f.dayHint === day).flatMap((f) => f.records)
    return {
      day,
      events: evRecs.length,
      alerts: alRecs.length,
      uniqueJourneyUids: countUniqueRawJourneyUids(evRecs),
      uniqueAlertJourneyUids: countUniqueRawJourneyUids(alRecs),
      eventFile: evRecs.length > 0,
      alertFile: alRecs.length > 0,
    }
  })
}

  const loadJsonFiles = useCallback(async (list: FileList | File[]) => {
    const arr = [...list].filter((f) => f.name.toLowerCase().endsWith('.json'))
    if (!arr.length) {
      setTransformError(null)
      return
    }
    setBusyLoad(true)
    setTransformError(null)
    setTransformResult(null)
    resetKpiTiemposState()
    try {
      const evFiles: ParsedTruckflowFile[] = []
      const alFiles: ParsedTruckflowFile[] = []
      const errors: string[] = []
      let unknownCount = 0

      for (const file of arr) {
        try {
          const parsed = await parseTruckflowJsonFile(file)
          if (parsed.kind === 'events') evFiles.push(parsed)
          else if (parsed.kind === 'alerts') alFiles.push(parsed)
          else {
            unknownCount++
            errors.push(`${file.name}: no se detectó tipo (eventos vs alertas).`)
          }
        } catch (e) {
          errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      if (unknownCount && !evFiles.length && !alFiles.length) {
        setEvents([])
        setAlerts([])
        setLoadSummary(buildLoadSummary(evFiles, alFiles, [], [], errors))
        return
      }

      const rawEvRows = evFiles.flatMap((f) => f.records)
      const rawAlRows = alFiles.flatMap((f) => f.records)

      const dtoEv = await journeyDtoListFromRawExtractedRowsChunked(rawEvRows)
      await yieldToBrowser()
      const dtoAl = alertDtoListFromRawExtractedRows(rawAlRows)

      const evMap = new Map<string, RealJourneyEventDto>()
      for (const e of dtoEv) evMap.set(dedupeKeyEvent(e), e)
      const evDedup = [...evMap.values()]

      const alMap = new Map<string, RealAlertDto>()
      for (const a of dtoAl) alMap.set(dedupeKeyAlert(a), a)
      const alDedup = [...alMap.values()]

      setParsedEventFiles(evFiles)
      setParsedAlertFiles(alFiles)
      setEvents(evDedup)
      setAlerts(alDedup)
      setLoadSummary(buildLoadSummary(evFiles, alFiles, evDedup, alDedup, errors))
      setApiJourneyStatsPerDay(buildApiJourneyStatsFromParsedFiles(evFiles, alFiles))
    } finally {
      setBusyLoad(false)
    }
  }, [resetKpiTiemposState])

  const loadLocalPeriod = useCallback(async (startDate: string, endDate: string): Promise<boolean> => {
    setBusyLoad(true)
    setTransformError(null)
    setTransformResult(null)
    resetKpiTiemposState()
    try {
      const res = await postTruckflowLoadLocalPeriod({ startDate, endDate })
      await yieldToBrowser()
      const dtoEv = await journeyDtoListFromRawExtractedRowsChunked(res.events as unknown[])
      await yieldToBrowser()
      const dtoAl = alertDtoListFromRawExtractedRows(res.alerts as unknown[])

      const evMap = new Map<string, RealJourneyEventDto>()
      for (const e of dtoEv) evMap.set(dedupeKeyEvent(e), e)
      const evDedup = [...evMap.values()]

      const alMap = new Map<string, RealAlertDto>()
      for (const a of dtoAl) alMap.set(dedupeKeyAlert(a), a)
      const alDedup = [...alMap.values()]

      const evFiles: ParsedTruckflowFile[] = res.perDay
        .filter((d) => d.eventFile)
        .map((d) => ({
          filename: `${d.day}/event-list.json`,
          kind: 'events' as const,
          recordCount: d.events,
          records: [],
          dayHint: d.day,
          endpointHint: 'journey-event/list',
        }))
      const alFiles: ParsedTruckflowFile[] = res.perDay
        .filter((d) => d.alertFile)
        .map((d) => ({
          filename: `${d.day}/alert-list.json`,
          kind: 'alerts' as const,
          recordCount: d.alerts,
          records: [],
          dayHint: d.day,
          endpointHint: 'alert/list',
        }))

      const missingDays = res.perDay.filter((d) => !d.eventFile && !d.alertFile).map((d) => d.day)
      const errors: string[] = []
      if (missingDays.length) {
        errors.push(`Sin JSON en disco para: ${missingDays.join(', ')} (extracción pendiente).`)
      }

      setParsedEventFiles(evFiles)
      setParsedAlertFiles(alFiles)
      setEvents(evDedup)
      setAlerts(alDedup)
      setLoadSummary(buildLoadSummary(evFiles, alFiles, evDedup, alDedup, errors))
      setApiJourneyStatsPerDay(enrichApiJourneyStatsFromRawEvents(res.perDay, res.events))
      setDiskPeriod({ startDate, endDate })
      return evDedup.length > 0 || alDedup.length > 0
    } catch (e) {
      setEvents([])
      setAlerts([])
      setParsedEventFiles([])
      setParsedAlertFiles([])
      setLoadSummary(null)
      setApiJourneyStatsPerDay(null)
      setTransformError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusyLoad(false)
    }
  }, [resetKpiTiemposState])

  /**
   * Hidrata `events` (eventos crudos) para la ventana ya cargada. Las corridas guardadas
   * traen las tablas materializadas pero NO el insumo de eventos; los timelines por camión
   * (Seguridad) los necesitan para el horario por nodo. No toca `transformResult` ni el KPI:
   * sólo rellena `events` desde el servidor local, una vez, con guarda anti-concurrencia.
   */
  const ensureWindowEventsLoaded = useCallback(async (): Promise<RealJourneyEventDto[]> => {
    if (events.length) return events
    if (windowEventsInflightRef.current) return windowEventsInflightRef.current
    const startDate = diskPeriod?.startDate ?? cachedWindow?.from ?? ''
    const endDate = diskPeriod?.endDate ?? cachedWindow?.to ?? ''
    if (!startDate || !endDate) return []
    setWindowEventsBusy(true)
    const p = (async () => {
      try {
        const res = await postTruckflowLoadLocalPeriod({ startDate, endDate })
        const dtoEv = await journeyDtoListFromRawExtractedRowsChunked(res.events as unknown[])
        const evMap = new Map<string, RealJourneyEventDto>()
        for (const e of dtoEv) evMap.set(dedupeKeyEvent(e), e)
        const evDedup = [...evMap.values()]
        setEvents(evDedup)
        return evDedup
      } catch {
        return []
      } finally {
        setWindowEventsBusy(false)
        windowEventsInflightRef.current = null
      }
    })()
    windowEventsInflightRef.current = p
    return p
  }, [events, diskPeriod, cachedWindow])

  const buildTransformInput = useCallback(async (): Promise<EtlTransformInput> => {
    let plateRegistry = null
    try {
      plateRegistry = await getTruckPlateRegistry()
    } catch {
      /* servidor local apagado */
    }

    // Movimientos: SOLO del backup local (data/movimientos) por rango de eventos.
    // Si el endpoint falla, abortamos: sin productos el Transform se ve "roto"
    // (sin filtro Soja/Girasol/Aceite y anomalías sin curar).
    let preNormalizedMovimientos: EtlTransformInput['preNormalizedMovimientos']
    const evDays = events
      .map((e) => String(e.occurredAt ?? '').slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
    if (evDays.length) {
      const from = evDays[0]!
      const to = evDays[evDays.length - 1]!
      try {
        const rows = await getMovimientosRange(from, to)
        if (rows.length) preNormalizedMovimientos = rows
        else {
          throw new Error(
            `Backup de movimientos vacío para ${from}→${to}. ` +
              `Subí los Excel en «Backup de Movimientos» y reiniciá el servidor local si hace falta.`
          )
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // 404 típico: servidor viejo sin GET /api/movimientos/range
        if (/404|Not Found/i.test(msg) || /Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg)) {
          throw new Error(
            `No se pudo leer el backup de movimientos (${from}→${to}): ${msg}. ` +
              `Reiniciá el servidor local (node server/truckflow-local-server.mjs) y volvé a Procesar.`
          )
        }
        throw e instanceof Error ? e : new Error(msg)
      }
    }

    return {
      events,
      alerts,
      mergeWindowHours,
      loadedEventFilesCount: parsedEventFiles.length,
      loadedAlertFilesCount: parsedAlertFiles.length,
      plateRegistry,
      preNormalizedMovimientos,
      tiemposEntrePasosFiles:
        tiemposEntrePasosFiles.length ? tiemposEntrePasosFiles : undefined,
      onContractFirstProgress,
    }
  }, [
    alerts,
    events,
    mergeWindowHours,
    tiemposEntrePasosFiles,
    onContractFirstProgress,
    parsedAlertFiles.length,
    parsedEventFiles.length,
  ])

  const commitTransformOutput = useCallback((out: EtlTransformOutput) => {
    kpiTiemposPreparedRef.current = out.kpiTiemposPrepared ?? null
    setKpiTiemposPrepared(Boolean(out.kpiTiemposPrepared?.classifiedJourneys?.length))
    setKpiTiemposBuilt(false)
    setKpiTiemposError(null)
    const { kpiTiemposPrepared: _drop, ...publicOut } = out
    startTransition(() => {
      setTransformResult(publicOut)
    })
    setFleetSaveError(null)
    setFleetSaveMessage(null)
    return publicOut
  }, [])

  const syncTramoStatusFromStore = useCallback((store: EtlTransformPhaseStore) => {
    setTransformTramoCompleted(store.tramoCompleted)
    setTransformTramoStatus({
      1: store.tramoCompleted >= 1 ? 'done' : 'idle',
      2: store.tramoCompleted >= 2 ? 'done' : 'idle',
      3: store.tramoCompleted >= 3 ? 'done' : 'idle',
    })
  }, [])

  const runTransformTramo = useCallback(
    async (tramo: TransformTramoId, options?: { keepGlobalBusy?: boolean }) => {
      if (!events.length && !alerts.length) {
        setTransformError('Cargá al menos un JSON de eventos o alertas.')
        return null
      }
      if (!options?.keepGlobalBusy) setTransformBusy(true)
      setTransformActiveTramo(tramo)
      if (tramo === 2) setContractFirstProgress(null)
      setTransformError(null)
      setTransformTramoStatus((s) => ({ ...s, [tramo]: 'running' }))
      try {
        const inp = await buildTransformInput()
        const out = await runEtlTransformTramo(tramo, inp, transformPhaseStoreRef.current)
        await yieldToBrowser()
        const publicOut = commitTransformOutput(out)
        syncTramoStatusFromStore(transformPhaseStoreRef.current)
        setTransformTramoStatus((s) => ({ ...s, [tramo]: 'done' }))
        return publicOut
      } catch (e) {
        setTransformError(e instanceof Error ? e.message : String(e))
        setTransformTramoStatus((s) => ({ ...s, [tramo]: 'error' }))
        return null
      } finally {
        setTransformActiveTramo(null)
        if (!options?.keepGlobalBusy) setTransformBusy(false)
      }
    },
    [
      buildTransformInput,
      commitTransformOutput,
      events.length,
      alerts.length,
      syncTramoStatusFromStore,
    ]
  )

  const runTransform = useCallback(async () => {
    if (!events.length && !alerts.length) {
      setTransformError('Cargá al menos un JSON de eventos o alertas.')
      return null
    }
    setTransformBusy(true)
    setTransformRunAllInProgress(true)
    setTransformError(null)
    setContractFirstProgress(null)
    transformPhaseStoreRef.current = createTransformPhaseSession()
    setTransformTramoStatus({ 1: 'idle', 2: 'idle', 3: 'idle' })
    setTransformTramoCompleted(0)
    try {
      let last: EtlTransformOutput | null = null
      // Movimientos del backup (tramo 1); si el rango no tiene, la integración se
      // saltea sola. Truckflow (tramo 2/3) siempre.
      const steps: TransformTramoId[] = [1, 2, 3]
      for (const tramo of steps) {
        last = await runTransformTramo(tramo, { keepGlobalBusy: true })
        if (!last) break
      }
      return last
    } finally {
      setTransformActiveTramo(null)
      setTransformRunAllInProgress(false)
      setTransformBusy(false)
    }
  }, [events.length, alerts.length, runTransformTramo])

  const runKpiTiempos = useCallback(async () => {
    if (!transformResult) {
      setKpiTiemposError('Primero ejecutá Procesar Transform en Análisis local.')
      return false
    }
    const prepared = kpiTiemposPreparedRef.current
    if (!prepared?.classifiedJourneys?.length) {
      // Sin insumo en memoria (corrida guardada o rango compuesto): re-agregamos el KPI
      // desde los `segment_timing_legs` persistidos, que sí traen todo lo necesario.
      const legRows = (transformResult.tables as Record<string, { rows?: Record<string, unknown>[] }> | undefined)
        ?.segment_timing_legs?.rows
      const legs = legRows ? persistedLegRowsToSegmentLegs(legRows) : []
      if (!legs.length) {
        setKpiTiemposError(
          'Esta vista no tiene tramos (segment_timing_legs) para recalcular el KPI. ' +
            'Cargá el período en «Análisis local» y corré Transform.'
        )
        return false
      }
      setKpiTiemposBusy(true)
      setKpiTiemposError(null)
      try {
        const index = rebuildSegmentTimingIndexFromLegs(legs)
        const kpiCsv = segmentTimingKpiCsv(index)
        const legsCsv = segmentTimingLegsCsv(index)
        await yieldToBrowser()
        startTransition(() => {
          setTransformResult((prev) =>
            prev
              ? {
                  ...prev,
                  csv: { ...prev.csv, segment_timing_kpi: kpiCsv, segment_timing_legs: legsCsv },
                  // Los gráficos del KPI leen stats.segmentTiming, no el CSV.
                  stats: { ...prev.stats, segmentTiming: index, kpiTiemposBuilt: true },
                }
              : prev
          )
          setKpiTiemposBuilt(true)
        })
        return true
      } catch (e) {
        setKpiTiemposError(e instanceof Error ? e.message : String(e))
        return false
      } finally {
        setKpiTiemposBusy(false)
      }
    }
    setKpiTiemposBusy(true)
    setKpiTiemposError(null)
    try {
      const built = await buildKpiTiemposArtifacts(prepared)
      await yieldToBrowser()
      startTransition(() => {
        setTransformResult((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            csv: { ...prev.csv, ...built.csv },
            stats: {
              ...prev.stats,
              segmentTiming: built.segmentTiming,
              circuitTiming: built.circuitTiming,
              kpiTiemposBuilt: true,
              slBalanzaComiteDiagnostics: built.slBalanzaComiteDiagnostics,
            },
          }
        })
        setKpiTiemposBuilt(true)
      })
      return true
    } catch (e) {
      setKpiTiemposError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setKpiTiemposBusy(false)
    }
  }, [transformResult])

  const saveFleetDatabase = useCallback(async () => {
    if (!transformResult) {
      setFleetSaveError('Ejecutá Procesar Transform antes de guardar en la base.')
      return null
    }
    setFleetSaveBusy(true)
    setFleetSaveError(null)
    setFleetSaveMessage('Conectando con servidor local…')
    try {
      const visitas = buildPlantVisitUpsertsFromTransform(transformResult)
        if (!visitas.length) {
        const empty: FleetDatabaseSaveResult = {
          ok: false,
          visitCount: 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          storage: '',
          message:
            'No hay visitas con patente Argentina válida (ABC123 o AB123CD). Revisá el merge/clean del transform o datos OCR erróneos.',
        }
        setFleetSaveError(empty.message)
        return empty
      }

      const res = await syncPlantVisits(visitas, {
        onProgress: ({ batch, totalBatches, rowsDone, rowsTotal }) => {
          setFleetSaveMessage(
            `Guardando lote ${batch}/${totalBatches} (${Math.min(rowsDone + FLEET_SYNC_BATCH_SIZE, rowsTotal)}/${rowsTotal} filas)…`
          )
        },
      })

      const storage = res.storage || 'desconocido'
      const batchNote = res.batches > 1 ? ` (${res.batches} lotes)` : ''
      const countNote =
        res.dbCounts ?
          ` En ${res.supabaseHost ?? 'Supabase'} hay ${res.dbCounts.camion} camiones y ${res.dbCounts.visitaPlanta} visitas.`
        : ''
      const result: FleetDatabaseSaveResult = {
        ok: !res.syncWarning,
        visitCount: visitas.length,
        inserted: res.inserted,
        updated: res.updated,
        skipped: res.skipped,
        storage,
        message: `Guardado en ${storage}${batchNote}: ${res.inserted} filas procesadas, ${res.skipped} omitidas.${countNote}`,
      }
      if (res.syncWarning) {
        setFleetSaveError(res.syncWarning)
        setFleetSaveMessage(result.message)
        return { ...result, ok: false }
      }
      setFleetSaveMessage(result.message)
      return result
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const hint = msg.includes('8787') || msg.includes('fetch') || msg.includes('Servidor local') ?
        ''
      : msg.includes('camion_plate_normalized_chk') || msg.includes('Patente inválida') ?
        ' Solo se guardan patentes Argentina (6–7 caracteres). Reiniciá server:truckflow tras actualizar.'
      : ' Si el servidor responde, revisá la migración camion/visita_planta en Supabase.'
      setFleetSaveError(msg + hint)
      return null
    } finally {
      setFleetSaveBusy(false)
    }
  }, [transformResult])

  const loadWindowOrOffer = useCallback(async (from: string, to: string) => {
    setTransformError(null)
    let hit: ResolveWindowResult | null = null
    try {
      hit = await resolveWindow(from, to)
    } catch (e) {
      setTransformError(e instanceof Error ? e.message : String(e))
      setCachedWindow(null)
      return null
    }
    if (!hit) {
      setCachedWindow(null)
      return { cached: false }
    }
    setCachedWindow(hit)
    if (hit.stale) return { cached: true, stale: true }
    try {
      const out = await loadTransformOutputFromRun(hit.runId)
      startTransition(() => {
        setTransformResult(out)
      })
      setTransformTramoCompleted(3)
      setTransformTramoStatus({ 1: 'done', 2: 'done', 3: 'done' })
      return { cached: true, stale: false }
    } catch (e) {
      setTransformError(e instanceof Error ? e.message : String(e))
      return { cached: true, stale: false }
    }
  }, [])

  const recomputeWindow = useCallback(async (from: string, to: string) => {
    setTransformError(null)
    setTransformBusy(true)
    try {
      const { runId } = await requestRunEtl(from, to, { force: true })
      const hit = await resolveWindow(from, to)
      setCachedWindow(hit)
      const out = await loadTransformOutputFromRun(runId)
      startTransition(() => {
        setTransformResult(out)
      })
      setTransformTramoCompleted(3)
      setTransformTramoStatus({ 1: 'done', 2: 'done', 3: 'done' })
      try {
        setSavedWindows(await listWindows())
      } catch {
        /* servidor local apagado */
      }
    } catch (e) {
      setTransformError(e instanceof Error ? e.message : String(e))
    } finally {
      setTransformBusy(false)
    }
  }, [])

  const refreshSavedWindows = useCallback(async () => {
    setSavedWindowsLoading(true)
    try {
      const ws = await listWindows()
      setSavedWindows(ws)
    } catch {
      /* servidor local apagado: dejamos la lista como está */
    } finally {
      setSavedWindowsLoading(false)
    }
  }, [])

  const hydrateSavedWindow = useCallback(
    async (w: SavedWindow) => {
      setTransformError(null)
      setCachedWindow({
        from: w.from,
        to: w.to,
        runId: w.runId,
        inputHash: '',
        rulesVersion: w.rulesVersion,
        createdAt: w.createdAt,
        stale: w.stale,
        currentRulesVersion: w.rulesVersion,
      })
      setDiskPeriod({ startDate: w.from, endDate: w.to })
      try {
        const out = await loadTransformOutputFromRun(w.runId)
        startTransition(() => {
          setTransformResult(out)
        })
        // La corrida guardada trae las tablas de KPI ya materializadas, pero no el
        // insumo en memoria para recalcularlas: hay que dejarlo explícito para que la
        // UI no ofrezca «Procesar KPI» sabiendo que va a fallar.
        resetKpiTiemposState()
        setTransformTramoCompleted(3)
        setTransformTramoStatus({ 1: 'done', 2: 'done', 3: 'done' })
      } catch (e) {
        setTransformError(e instanceof Error ? e.message : String(e))
      }
    },
    []
  )

  /**
   * Compone un rango arbitrario [from,to] uniendo las corridas guardadas que lo
   * cubren, SIN reprocesar. Re-agrega el KPI de tiempos desde los legs persistidos.
   * Devuelve la cobertura (días cubiertos / faltantes) para que la UI avise.
   */
  const loadComposedRange = useCallback(
    async (from: string, to: string): Promise<RangeCoverage | null> => {
      setTransformError(null)
      let windows: SavedWindow[] = savedWindows
      if (!windows.length) {
        try {
          windows = await listWindows()
          setSavedWindows(windows)
        } catch {
          /* servidor local apagado: seguimos con lo que haya */
        }
      }
      const vigentes = windows.filter((w) => !w.stale)
      const coverage = computeRangeCoverage(from, to, vigentes)
      if (!coverage.coveringRuns.length) {
        setComposedRange(null)
        setTransformError(
          `No hay corridas guardadas que cubran ${from} → ${to}. Procesá el período en «Análisis local».`
        )
        return coverage
      }
      setTransformBusy(true)
      try {
        const loaded = await Promise.all(
          coverage.coveringRuns.map(async (r) => ({
            runId: r.runId,
            output: await loadTransformOutputFromRun(r.runId),
          }))
        )
        const composed = composeRunsIntoTransformOutput(loaded, from, to)
        startTransition(() => {
          setTransformResult(composed.output)
        })
        resetKpiTiemposState()
        setKpiTiemposBuilt(true)
        setTransformTramoCompleted(3)
        setTransformTramoStatus({ 1: 'done', 2: 'done', 3: 'done' })
        setDiskPeriod({ startDate: from, endDate: to })
        setCachedWindow(null)
        setComposedRange({
          from,
          to,
          usedRunIds: composed.usedRunIds,
          missingDays: coverage.missingDays,
          legCount: composed.composedLegCount,
          kpiRowCount: composed.kpiRowCount,
        })
      } catch (e) {
        setTransformError(e instanceof Error ? e.message : String(e))
      } finally {
        setTransformBusy(false)
      }
      return coverage
    },
    [savedWindows]
  )

  // Al montar: traer los procesos guardados y, si no hay nada cargado, hidratar
  // el más reciente como "fuente de la verdad" por default (sin reprocesar).
  const didAutoHydrateRef = useRef(false)
  useEffect(() => {
    if (didAutoHydrateRef.current) return
    didAutoHydrateRef.current = true
    void (async () => {
      let ws: SavedWindow[] = []
      setSavedWindowsLoading(true)
      try {
        ws = await listWindows()
        setSavedWindows(ws)
      } catch {
        /* servidor local apagado */
      } finally {
        setSavedWindowsLoading(false)
      }
      const latestVigente = ws.find((w) => !w.stale)
      if (latestVigente && !transformResult) {
        await hydrateSavedWindow(latestVigente)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      loadSummary,
      apiJourneyStatsPerDay,
      diskPeriod,
      setDiskPeriod,
      parsedEventFiles,
      parsedAlertFiles,
      events,
      alerts,
      busyLoad,
      windowEventsBusy,
      ensureWindowEventsLoaded,
      transformResult,
      transformBusy,
      transformError,
      cachedWindow,
      loadWindowOrOffer,
      recomputeWindow,
      savedWindows,
      savedWindowsLoading,
      refreshSavedWindows,
      hydrateSavedWindow,
      loadComposedRange,
      composedRange,
      kpiTiemposBusy,
      kpiTiemposError,
      kpiTiemposBuilt,
      kpiTiemposPrepared,
      runKpiTiempos,
      mergeWindowHours,
      setMergeWindowHours,
      movimientosContratoFiles,
      movimientosContratoFileNames,
      tiemposEntrePasosFiles,
      tiemposEntrePasosFileNames,
      loadMovimientosContratoXlsx,
      clearMovimientosContrato,
      loadJsonFiles,
      loadLocalPeriod,
      clearLoaded,
      runTransform,
      transformTramoStatus,
      transformActiveTramo,
      transformTramoCompleted,
      transformRunAllInProgress,
      contractFirstProgress,
      runTransformTramo,
      fleetSaveBusy,
      fleetSaveError,
      fleetSaveMessage,
      saveFleetDatabase,
    }),
    [
      loadSummary,
      apiJourneyStatsPerDay,
      diskPeriod,
      parsedEventFiles,
      parsedAlertFiles,
      events,
      alerts,
      busyLoad,
      windowEventsBusy,
      ensureWindowEventsLoaded,
      transformResult,
      transformBusy,
      transformError,
      cachedWindow,
      loadWindowOrOffer,
      recomputeWindow,
      savedWindows,
      savedWindowsLoading,
      refreshSavedWindows,
      hydrateSavedWindow,
      loadComposedRange,
      composedRange,
      kpiTiemposBusy,
      kpiTiemposError,
      kpiTiemposBuilt,
      kpiTiemposPrepared,
      runKpiTiempos,
      mergeWindowHours,
      movimientosContratoFiles,
      movimientosContratoFileNames,
      tiemposEntrePasosFiles,
      tiemposEntrePasosFileNames,
      loadMovimientosContratoXlsx,
      clearMovimientosContrato,
      loadJsonFiles,
      loadLocalPeriod,
      clearLoaded,
      runTransform,
      transformTramoStatus,
      transformActiveTramo,
      runTransformTramo,
      transformTramoCompleted,
      transformRunAllInProgress,
      contractFirstProgress,
      fleetSaveBusy,
      fleetSaveError,
      fleetSaveMessage,
      saveFleetDatabase,
    ]
  )

  return <EtlWorkbenchContext.Provider value={value}>{children}</EtlWorkbenchContext.Provider>
}

export function useEtlWorkbench(): Ctx {
  const c = useContext(EtlWorkbenchContext)
  if (!c) throw new Error('useEtlWorkbench requiere EtlWorkbenchProvider')
  return c
}

export function useEtlWorkbenchOptional(): Ctx | null {
  return useContext(EtlWorkbenchContext)
}
