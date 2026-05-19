import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
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
import { runEtlTransform, type EtlTransformOutput } from './etlTransformPipeline'
import { inferSiteIdFromSectorCode } from '../../../services/realJourneyEventsMapper'
import { occurredAtLocalDayKey } from '../../../services/realJourneyQuality'
import { postTruckflowLoadLocalPeriod } from '../api/truckflowLocalServerApi'

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

export type EtlDiskPeriod = { startDate: string; endDate: string }

type Ctx = {
  loadSummary: EtlLoadSummary | null
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
  mergeWindowHours: number
  setMergeWindowHours: (h: number) => void
  loadJsonFiles: (list: FileList | File[]) => Promise<void>
  /** Lee data/truckflow/YYYY-MM-DD/*.json del servidor local (un solo request). */
  loadLocalPeriod: (startDate: string, endDate: string) => Promise<boolean>
  clearLoaded: () => void
  runTransform: () => Promise<EtlTransformOutput | null>
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
  const [diskPeriod, setDiskPeriod] = useState<EtlDiskPeriod | null>(null)
  const [transformResult, setTransformResult] = useState<EtlTransformOutput | null>(null)
  const [transformBusy, setTransformBusy] = useState(false)
  const [transformError, setTransformError] = useState<string | null>(null)
  const [mergeWindowHours, setMergeWindowHours] = useState(2)

  const clearLoaded = useCallback(() => {
    setParsedEventFiles([])
    setParsedAlertFiles([])
    setEvents([])
    setAlerts([])
    setLoadSummary(null)
    setDiskPeriod(null)
    setTransformResult(null)
    setTransformError(null)
  }, [])

  const loadJsonFiles = useCallback(async (list: FileList | File[]) => {
    const arr = [...list].filter((f) => f.name.toLowerCase().endsWith('.json'))
    if (!arr.length) {
      setTransformError(null)
      return
    }
    setBusyLoad(true)
    setTransformError(null)
    setTransformResult(null)
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
    } finally {
      setBusyLoad(false)
    }
  }, [])

  const loadLocalPeriod = useCallback(async (startDate: string, endDate: string): Promise<boolean> => {
    setBusyLoad(true)
    setTransformError(null)
    setTransformResult(null)
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
      setDiskPeriod({ startDate, endDate })
      return evDedup.length > 0 || alDedup.length > 0
    } catch (e) {
      setEvents([])
      setAlerts([])
      setParsedEventFiles([])
      setParsedAlertFiles([])
      setLoadSummary(null)
      setTransformError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusyLoad(false)
    }
  }, [])

  const runTransform = useCallback(async () => {
    if (!events.length && !alerts.length) {
      setTransformError('Cargá al menos un JSON de eventos o alertas.')
      return null
    }
    setTransformBusy(true)
    setTransformError(null)
    try {
      const out = await runEtlTransform({
        events,
        alerts,
        mergeWindowHours,
        loadedEventFilesCount: parsedEventFiles.length,
        loadedAlertFilesCount: parsedAlertFiles.length,
      })
      setTransformResult(out)
      return out
    } catch (e) {
      setTransformError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setTransformBusy(false)
    }
  }, [alerts, events, mergeWindowHours, parsedAlertFiles.length, parsedEventFiles.length])

  const value = useMemo<Ctx>(
    () => ({
      loadSummary,
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
      mergeWindowHours,
      setMergeWindowHours,
      loadJsonFiles,
      loadLocalPeriod,
      clearLoaded,
      runTransform,
    }),
    [
      loadSummary,
      diskPeriod,
      parsedEventFiles,
      parsedAlertFiles,
      events,
      alerts,
      busyLoad,
      transformResult,
      transformBusy,
      transformError,
      mergeWindowHours,
      loadJsonFiles,
      loadLocalPeriod,
      clearLoaded,
      runTransform,
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
