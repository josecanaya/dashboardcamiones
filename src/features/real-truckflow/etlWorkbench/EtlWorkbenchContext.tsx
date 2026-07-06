import {
  createContext,
  useCallback,
  useContext,
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
import type { EtlTransformInput, EtlTransformOutput } from './etlTransformPipeline'
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
  /** Resultado del último transform (no se recalcula al render). */
  transformResult: EtlTransformOutput | null
  transformBusy: boolean
  transformError: string | null
  /** Tramo 4: KPI tiempos / dispersión (pestaña KPI Tiempos). */
  kpiTiemposBusy: boolean
  kpiTiemposError: string | null
  kpiTiemposBuilt: boolean
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
  const [loadSummary, setLoadSummary] = useState<EtlLoadSummary | null>(null)
  const [apiJourneyStatsPerDay, setApiJourneyStatsPerDay] = useState<TruckflowApiJourneyDayStat[] | null>(
    null
  )
  const [diskPeriod, setDiskPeriod] = useState<EtlDiskPeriod | null>(null)
  const [transformResult, setTransformResult] = useState<EtlTransformOutput | null>(null)
  const [fleetSaveBusy, setFleetSaveBusy] = useState(false)
  const [fleetSaveError, setFleetSaveError] = useState<string | null>(null)
  const [fleetSaveMessage, setFleetSaveMessage] = useState<string | null>(null)
  const [transformBusy, setTransformBusy] = useState(false)
  const [transformError, setTransformError] = useState<string | null>(null)
  const [kpiTiemposBusy, setKpiTiemposBusy] = useState(false)
  const [kpiTiemposError, setKpiTiemposError] = useState<string | null>(null)
  const [kpiTiemposBuilt, setKpiTiemposBuilt] = useState(false)
  const kpiTiemposPreparedRef = useRef<KpiTiemposBuildInput | null>(null)
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

  const buildTransformInput = useCallback(async (): Promise<EtlTransformInput> => {
    let plateRegistry = null
    try {
      plateRegistry = await getTruckPlateRegistry()
    } catch {
      /* servidor local apagado */
    }
    return {
      events,
      alerts,
      mergeWindowHours,
      loadedEventFilesCount: parsedEventFiles.length,
      loadedAlertFilesCount: parsedAlertFiles.length,
      plateRegistry,
      movimientosContratoFiles:
        movimientosContratoFiles.length ? movimientosContratoFiles : undefined,
      tiemposEntrePasosFiles:
        tiemposEntrePasosFiles.length ? tiemposEntrePasosFiles : undefined,
      onContractFirstProgress,
    }
  }, [
    alerts,
    events,
    mergeWindowHours,
    movimientosContratoFiles,
    tiemposEntrePasosFiles,
    onContractFirstProgress,
    parsedAlertFiles.length,
    parsedEventFiles.length,
  ])

  const commitTransformOutput = useCallback((out: EtlTransformOutput) => {
    kpiTiemposPreparedRef.current = out.kpiTiemposPrepared ?? null
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
      if (tramo === 1 && !movimientosContratoFiles.length) {
        setTransformError('Cargá XLSX de Movimientos por Contrato para el paso 1.')
        return null
      }
      if (tramo !== 1 && !events.length && !alerts.length) {
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
      movimientosContratoFiles.length,
      syncTramoStatusFromStore,
    ]
  )

  const runTransform = useCallback(async () => {
    if (movimientosContratoFiles.length && !events.length && !alerts.length) {
      setTransformError('Cargá JSON Truckflow además del Excel para procesar todo.')
      return null
    }
    if (!movimientosContratoFiles.length && !events.length && !alerts.length) {
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
      const steps: TransformTramoId[] =
        movimientosContratoFiles.length ? [1, 2, 3] : [2, 3]
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
  }, [events.length, movimientosContratoFiles.length, runTransformTramo])

  const runKpiTiempos = useCallback(async () => {
    if (!transformResult) {
      setKpiTiemposError('Primero ejecutá Procesar Transform en Análisis local.')
      return false
    }
    const prepared = kpiTiemposPreparedRef.current
    if (!prepared?.classifiedJourneys?.length) {
      setKpiTiemposError('No hay datos preparados. Volvé a ejecutar Transform.')
      return false
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
      transformResult,
      transformBusy,
      transformError,
      kpiTiemposBusy,
      kpiTiemposError,
      kpiTiemposBuilt,
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
      transformResult,
      transformBusy,
      transformError,
      kpiTiemposBusy,
      kpiTiemposError,
      kpiTiemposBuilt,
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
