import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSite } from '../../context/SiteContext'
import {
  getCatalogSectorCodesForLiveMonitor,
  getExpectedDevicesForLiveSector,
} from '../../data/liveMonitorSectorCatalog'
import { lookupRealSectorCode } from '../../data/realSectorCodeMap'
import type { SiteId } from '../../domain/sites'
import { SITES } from '../../domain/sites'
import { normalizePlate } from '../../services/argentinaPlate'
import { normalizeRealAlertForView, type NormalizedRealAlertView } from '../../services/realAlertsInspector'
import type { RealJourneyEventDto } from '../../services/realJourneyEvents.types'
import { inferSiteIdFromSectorCode } from '../../services/realJourneyEventsMapper'
import {
  fetchAlerts,
  fetchJourneyEvents,
  REAL_TRUCKFLOW_BASE_URL,
  resolveRealTruckflowApiOrigin,
  type RealTruckflowQueryParams,
} from '../../services/realTruckflowApi'
import {
  buildCameraDiagnostics,
  buildOperationalTimeline,
  buildSectorStatus,
  compareFrontRearCameras,
  evaluateManualObservation,
  exportCameraDiagnosticCsv,
  exportCameraDiagnosticJson,
  getEventOperationalInstantIso,
  isValidObservedPlate,
  VEHICLE_TYPE_LABELS,
  WORK_MODE_LABELS,
  type CameraDiagnostics,
  type FrontRearComparisonRow,
  type LiveSectorStatus,
  type LiveWorkMode,
  type ManualObservation,
  type OperationalTimelineKind,
  type VehicleType,
} from '../../services/liveCameraDiagnostics'

const MATCH_WINDOW_MS = 20_000
const AUTO_REFRESH_MS = 30_000

type DateTimeRangeFilter = {
  startDate: string
  startTime: string
  endDate: string
  endTime: string
}

function fmtShort(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
}

function toIsoLocal(dt: Date): string {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  const hh = String(dt.getHours()).padStart(2, '0')
  const mm = String(dt.getMinutes()).padStart(2, '0')
  const ss = String(dt.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`
}

function toDateInputValue(dt: Date): string {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toTimeInputValue(dt: Date): string {
  const hh = String(dt.getHours()).padStart(2, '0')
  const mm = String(dt.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function getInitialDateTimeRange(): DateTimeRangeFilter {
  const end = new Date()
  const start = new Date(end.getTime() - 60 * 60 * 1000)
  return {
    startDate: toDateInputValue(start),
    startTime: toTimeInputValue(start),
    endDate: toDateInputValue(end),
    endTime: toTimeInputValue(end),
  }
}

function parseDateTimeRange(filter: DateTimeRangeFilter): { start: Date; end: Date } | null {
  if (!filter.startDate || !filter.startTime || !filter.endDate || !filter.endTime) return null
  const start = new Date(`${filter.startDate}T${filter.startTime}:00`)
  const end = new Date(`${filter.endDate}T${filter.endTime}:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  if (start >= end) return null
  return { start, end }
}

function parseMillis(iso: string): number {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? NaN : t
}

/**
 * En producción real, `/journey-event/list` a veces devuelve `occurredAt`/`recordedAt` erróneos (p. ej. año 2036)
 * mientras `createdAt` refleja cuándo se persistió. El monitor en vivo filtra por ventana local y descartaba todo.
 * Si la marca de “ocurrencia” difiere mucho de la persistencia, usamos createdAt como instante operativo.
 */
const MAX_OCCURRED_VS_PERSISTED_DRIFT_MS = 30 * 24 * 60 * 60 * 1000

function alignJourneyEventTimeForLiveView(e: RealJourneyEventDto): RealJourneyEventDto {
  const occMs = parseMillis(e.occurredAt)
  const anchorStr = (e.createdAt || e.modifiedAt || '').trim()
  if (!anchorStr) return e
  const anchMs = parseMillis(anchorStr)
  if (Number.isNaN(occMs) || Number.isNaN(anchMs)) return e
  if (Math.abs(occMs - anchMs) <= MAX_OCCURRED_VS_PERSISTED_DRIFT_MS) return e
  return { ...e, occurredAt: anchorStr, recordedAt: anchorStr }
}

/**
 * Instante “de pared” para en vivo: a veces occurredAt va horas atrasado respecto a createdAt y a las alertas
 * (mismo registro). Tomamos el más reciente entre occurred/created/modified tras alinear.
 */
function eventOperationalInstantMs(e: RealJourneyEventDto): number {
  const a = alignJourneyEventTimeForLiveView(e)
  const times = [
    parseMillis(a.occurredAt),
    parseMillis((a.createdAt || '').trim()),
    parseMillis((a.modifiedAt || '').trim()),
  ].filter((t) => !Number.isNaN(t))
  return times.length ? Math.max(...times) : NaN
}

function eventOperationalInstantIso(e: RealJourneyEventDto): string {
  const ms = eventOperationalInstantMs(e)
  if (Number.isNaN(ms)) return (alignJourneyEventTimeForLiveView(e).occurredAt || '').trim() || '—'
  return new Date(ms).toISOString()
}

/**
 * Rango pedido al GET journey-event/list (y alert/list): más ancho que la ventana mostrada.
 * La pestaña de diagnóstico pide el día completo hasta la hora final porque el backend puede filtrar por occurredAt desfasado.
 */
function liveListQueryBounds(start: Date, end: Date): { start: Date; end: Date } {
  const apiEnd = new Date(end.getTime() + 15 * 60 * 1000)
  const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0)
  return {
    start: dayStart,
    end: apiEnd,
  }
}

/** Holgencia hacia atrás: createdAt puede preceder unos minutos a la alerta en la misma lectura. */
const LIVE_EVENT_TIME_SLACK_START_MS = 45 * 60 * 1000

function journeyEventInUiWindow(e: RealJourneyEventDto, uiStartMs: number, uiEndMs: number): boolean {
  const lo = uiStartMs - LIVE_EVENT_TIME_SLACK_START_MS
  const hi = uiEndMs
  const op = eventOperationalInstantMs(e)
  if (!Number.isNaN(op) && op >= lo && op <= hi) return true
  const a = alignJourneyEventTimeForLiveView(e)
  const candidates = [
    parseMillis(a.occurredAt),
    parseMillis((a.createdAt || '').trim()),
    parseMillis((a.modifiedAt || '').trim()),
    parseMillis((a.recordedAt || '').trim()),
  ].filter((t) => !Number.isNaN(t))
  return candidates.some((t) => t >= lo && t <= hi)
}

function alertInUiWindow(a: NormalizedRealAlertView, uiStartMs: number, uiEndMs: number): boolean {
  const t = parseMillis(a.occurredAt)
  if (Number.isNaN(t)) return false
  return t >= uiStartMs && t <= uiEndMs
}

function sectorMatchesPlant(sectorCode: string, plant: SiteId): boolean {
  const sid = inferSiteIdFromSectorCode(sectorCode)
  if (plant === 'ricardone') return sid === 'ricardone'
  if (plant === 'san_lorenzo') return sid === 'san_lorenzo'
  if (plant === 'avellaneda') return sid === 'avellaneda'
  return false
}

function sectorDisplayName(code: string): string {
  const entry = lookupRealSectorCode(code)
  const label = entry?.label?.trim()
  const raw = code.trim()
  return label || raw || '—'
}

function frontRearPairsForSector(sectorCode: string): { front: string; rear: string }[] {
  const code = sectorCode.trim().toUpperCase()
  if (code === 'RICARDONE_EGRESO_CAMIONES') {
    return [
      { front: 'RicEgrCamFrente', rear: 'RicEgrCamTraser' },
      { front: 'RicEgrCamFrente', rear: 'RicEgrCamTrasera' },
    ]
  }
  if (code === 'RICARDONE_INGRESO_CAMIONES') {
    return [
      { front: 'RicIngCamFrente', rear: 'RicIngCamTrasera' },
      { front: 'RicIngCamFrente', rear: 'RicIngCamTraser' },
    ]
  }
  if (code === 'RICARDONE_PREINGRESO') return [{ front: 'RicPreIngInFr', rear: 'RicPreIngInTr' }]
  return []
}

type CameraAggStatus = 'sin_datos' | 'activa' | 'con_alertas' | 'critica'

function computeCameraStatus(
  eventCount: number,
  alertCount: number,
  alerts: NormalizedRealAlertView[]
): CameraAggStatus {
  if (eventCount === 0 && alertCount === 0) return 'sin_datos'
  const critical = alerts.some((a) => {
    const raw = a.raw as Record<string, unknown>
    const sev = String(raw.severity ?? '').toUpperCase()
    if (/CRITICAL|CRÍTICO|HIGH|ALTA/i.test(sev)) return true
    return a.alertLevel >= 8
  })
  if (critical) return 'critica'
  if (alertCount > 0) return 'con_alertas'
  return 'activa'
}

export type CombinedResultKind = 'EVENTO OK' | 'SOLO ALERTA' | 'EVENTO + ALERTA' | 'SIN DATOS'

export type CombinedDetectionRow = {
  key: string
  at: string
  plate: string
  tipo: string
  eventSummary: string
  alertSummary: string
  resultado: CombinedResultKind
  descripcion: string
}

function platesStrongMatch(ev: RealJourneyEventDto, al: NormalizedRealAlertView): boolean {
  const ep = (ev.normalizedPlate || normalizePlate(ev.truckPlate || '')).trim()
  const ap = (al.normalizedPlate || '').trim()
  if (ep && ap && ep === ap) return true
  const rawP = (al.rawPlate || '').trim().toUpperCase()
  const truck = (ev.truckPlate || '').trim().toUpperCase()
  if (rawP && truck && rawP === truck) return true
  return false
}

function buildCombinedDetections(
  events: RealJourneyEventDto[],
  alerts: NormalizedRealAlertView[],
  deviceCode: string,
  sectorCode: string
): CombinedDetectionRow[] {
  const evs = events
    .filter((e) => e.deviceCode === deviceCode && e.sectorCode === sectorCode)
    .sort((a, b) => eventOperationalInstantMs(b) - eventOperationalInstantMs(a))
  const als = alerts
    .filter((a) => a.deviceCode === deviceCode && a.sectorCode === sectorCode)
    .sort((a, b) => parseMillis(b.occurredAt) - parseMillis(a.occurredAt))

  if (!evs.length && !als.length) return []

  const usedAlertIds = new Set<string>()
  const rows: CombinedDetectionRow[] = []

  for (const ev of evs) {
    const t0 = eventOperationalInstantMs(ev)
    let best: NormalizedRealAlertView | null = null
    let bestD = Infinity
    for (const al of als) {
      if (usedAlertIds.has(al.alertId)) continue
      const t1 = parseMillis(al.occurredAt)
      if (Number.isNaN(t0) || Number.isNaN(t1)) continue
      const d = Math.abs(t0 - t1)
      if (d <= MATCH_WINDOW_MS && d < bestD) {
        bestD = d
        best = al
      }
    }
    const plate = ev.truckPlate || ev.normalizedPlate || best?.rawPlate || best?.normalizedPlate || '—'
    if (best) {
      usedAlertIds.add(best.alertId)
      const strong = platesStrongMatch(ev, best)
      rows.push({
        key: `ev-${ev.id}-${best.alertId}`,
        at: eventOperationalInstantIso(ev),
        plate,
        tipo: strong ? 'Fuerte + temporal' : 'Temporal',
        eventSummary: ev.eventType || ev.eventCategory || 'evento',
        alertSummary: best.alertCode || best.alertType || 'alerta',
        resultado: 'EVENTO + ALERTA',
        descripcion: strong ? 'Coincidencia fuerte (patente)' : 'Coincidencia temporal (cámara ±20s)',
      })
    } else {
      rows.push({
        key: `ev-${ev.id}`,
        at: eventOperationalInstantIso(ev),
        plate,
        tipo: 'Evento',
        eventSummary: ev.eventType || ev.eventCategory || 'evento',
        alertSummary: '—',
        resultado: 'EVENTO OK',
        descripcion: 'Evento sin alerta cercana en esta ventana',
      })
    }
  }

  for (const al of als) {
    if (usedAlertIds.has(al.alertId)) continue
    rows.push({
      key: `al-${al.alertId}`,
      at: al.occurredAt,
      plate: al.rawPlate || al.normalizedPlate || '—',
      tipo: 'Alerta',
      eventSummary: '—',
      alertSummary: al.alertCode || al.alertType || 'alerta',
      resultado: 'SOLO ALERTA',
      descripcion: 'Alerta sin evento cercano en esta ventana',
    })
  }

  rows.sort((a, b) => parseMillis(b.at) - parseMillis(a.at))
  return rows
}

export function LiveCameraMonitor() {
  const { siteId, setSiteId } = useSite()
  const [plantSiteId, setPlantSiteId] = useState<SiteId>(siteId)

  useEffect(() => {
    setPlantSiteId(siteId)
  }, [siteId])

  const onPlantChange = (id: SiteId) => {
    setPlantSiteId(id)
    setSiteId(id)
  }

  const [dateTimeRange, setDateTimeRange] = useState<DateTimeRangeFilter>(() => getInitialDateTimeRange())
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [workMode, setWorkMode] = useState<LiveWorkMode>('live')
  const [filterSectorCode, setFilterSectorCode] = useState('')
  const [filterDeviceCode, setFilterDeviceCode] = useState('')
  const [filterPlate, setFilterPlate] = useState('')
  const [filterJourneyUuid, setFilterJourneyUuid] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<RealJourneyEventDto[]>([])
  const [normalizedAlerts, setNormalizedAlerts] = useState<NormalizedRealAlertView[]>([])
  const [rangeLabel, setRangeLabel] = useState('')

  const [selectedSectorCode, setSelectedSectorCode] = useState<string | null>(null)
  const [selectedDeviceCode, setSelectedDeviceCode] = useState<string | null>(null)
  const [cameraFocusFull, setCameraFocusFull] = useState(false)

  const [observations, setObservations] = useState<ManualObservation[]>([])
  const [vehicleType, setVehicleType] = useState<VehicleType>('desconocido')
  const [observedPlate, setObservedPlate] = useState('')
  const [manualObservation, setManualObservation] = useState('')
  const [operatorNote, setOperatorNote] = useState('')

  const camerasPanelRef = useRef<HTMLDivElement | null>(null)
  const monitorPanelRef = useRef<HTMLDivElement | null>(null)
  const inFlightRef = useRef(false)

  const windowBounds = useMemo(() => parseDateTimeRange(dateTimeRange), [dateTimeRange])
  const rangeValidationMessage = windowBounds ? '' : 'Seleccioná un rango válido: el inicio debe ser anterior al fin.'

  const apiOriginLabel = useMemo(() => resolveRealTruckflowApiOrigin(), [])
  /** Mismo host que documenta Truckflow; en dev Vite suele ir por proxy `/journey-api` por CORS. */
  const liveFetchOrigin = useMemo(
    () => (typeof import.meta !== 'undefined' && import.meta.env?.DEV ? undefined : REAL_TRUCKFLOW_BASE_URL),
    []
  )

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return
    if (!windowBounds) {
      setEvents([])
      setNormalizedAlerts([])
      setRangeLabel('')
      setError(rangeValidationMessage)
      return
    }
    inFlightRef.current = true
    setLoading(true)
    setError(null)
    const { start, end } = windowBounds
    const listBounds = liveListQueryBounds(start, end)
    const params: RealTruckflowQueryParams = {
      startDate: toIsoLocal(listBounds.start),
      endDate: toIsoLocal(listBounds.end),
    }
    const fp = filterPlate.trim()
    const fj = filterJourneyUuid.trim()
    const fs = filterSectorCode.trim()
    const fd = filterDeviceCode.trim()
    if (fp) params.plate = fp
    if (fj) params.journeyUuid = fj
    if (fs) params.sector = fs
    if (fd) params.device = fd

    try {
      const fetchOpts = liveFetchOrigin ? { baseOrigin: liveFetchOrigin } : undefined
      const [evts, rawAlerts] = await Promise.all([
        fetchJourneyEvents(params, fetchOpts),
        fetchAlerts(params, fetchOpts),
      ])
      const uiStartMs = start.getTime()
      const uiEndMs = end.getTime()
      const evAligned = evts.map(alignJourneyEventTimeForLiveView)
      const evFiltered = evAligned.filter((e) => journeyEventInUiWindow(e, uiStartMs, uiEndMs))
      const norm = rawAlerts.map(normalizeRealAlertForView).filter((a) => alertInUiWindow(a, uiStartMs, uiEndMs))
      setEvents(evFiltered)
      setNormalizedAlerts(norm)
      setRangeLabel(`${fmtShort(toIsoLocal(start))} → ${fmtShort(toIsoLocal(end))}`)
    } catch (e) {
      setEvents([])
      setNormalizedAlerts([])
      setError(e instanceof Error ? e.message : 'Error consultando datos reales')
    } finally {
      setLoading(false)
      inFlightRef.current = false
    }
  }, [windowBounds, rangeValidationMessage, filterPlate, filterJourneyUuid, filterSectorCode, filterDeviceCode, liveFetchOrigin])

  useEffect(() => {
    void refresh()
  }, [refresh, plantSiteId])

  useEffect(() => {
    if (!autoRefresh) return
    const id = window.setInterval(() => void refresh(), AUTO_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [autoRefresh, refresh])

  const plantFilteredEvents = useMemo(
    () => events.filter((e) => sectorMatchesPlant(e.sectorCode, plantSiteId)),
    [events, plantSiteId]
  )
  const plantFilteredAlerts = useMemo(
    () => normalizedAlerts.filter((a) => sectorMatchesPlant(a.sectorCode, plantSiteId)),
    [normalizedAlerts, plantSiteId]
  )

  const sectorsAgg = useMemo(() => {
    const map = new Map<
      string,
      {
        sectorCode: string
        events: RealJourneyEventDto[]
        alerts: NormalizedRealAlertView[]
        devices: Set<string>
      }
    >()
    const addDevice = (sectorCode: string, device: string) => {
      const d = device.trim()
      if (!sectorCode.trim() || !d) return
      if (!map.has(sectorCode)) map.set(sectorCode, { sectorCode, events: [], alerts: [], devices: new Set() })
      map.get(sectorCode)!.devices.add(d)
    }

    for (const e of plantFilteredEvents) {
      const code = e.sectorCode.trim()
      if (!code) continue
      if (!map.has(code)) map.set(code, { sectorCode: code, events: [], alerts: [], devices: new Set() })
      map.get(code)!.events.push(e)
      addDevice(code, e.deviceCode)
    }
    for (const a of plantFilteredAlerts) {
      const code = a.sectorCode.trim()
      if (!code) continue
      if (!map.has(code)) map.set(code, { sectorCode: code, events: [], alerts: [], devices: new Set() })
      map.get(code)!.alerts.push(a)
      addDevice(code, a.deviceCode)
    }

    for (const code of getCatalogSectorCodesForLiveMonitor(plantSiteId)) {
      if (!map.has(code)) map.set(code, { sectorCode: code, events: [], alerts: [], devices: new Set() })
      for (const d of getExpectedDevicesForLiveSector(code)) {
        addDevice(code, d)
      }
    }

    const fc = filterSectorCode.trim()
    const sectorKeys = fc
      ? [...map.keys()].filter((c) => c === fc || c.toUpperCase().includes(fc.toUpperCase()))
      : [...map.keys()]

    const list = sectorKeys
      .map((code) => {
        const bucket = map.get(code)!
        const ec = bucket.events.length
        const ac = bucket.alerts.length
        const pendingValidation = observations.some((o) => o.sectorCode === code && o.result === 'pendiente')
        const status = buildSectorStatus(ec, ac, pendingValidation, bucket.alerts)
        return {
          sectorCode: code,
          label: sectorDisplayName(code),
          eventCount: ec,
          alertCount: ac,
          cameraCount: bucket.devices.size,
          status,
          devices: bucket.devices,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))

    return list
  }, [plantFilteredEvents, plantFilteredAlerts, plantSiteId, filterSectorCode, observations])

  const selectedSectorBuckets = useMemo(() => {
    if (!selectedSectorCode) return null
    const ev = plantFilteredEvents.filter((e) => e.sectorCode === selectedSectorCode)
    const al = plantFilteredAlerts.filter((a) => a.sectorCode === selectedSectorCode)
    const devices = new Set<string>()
    getExpectedDevicesForLiveSector(selectedSectorCode).forEach((d) => devices.add(d))
    ev.forEach((e) => {
      if (e.deviceCode.trim()) devices.add(e.deviceCode.trim())
    })
    al.forEach((a) => {
      if (a.deviceCode.trim()) devices.add(a.deviceCode.trim())
    })
    const fd = filterDeviceCode.trim()
    const deviceList = [...devices].filter((d) => !fd || d === fd || d.includes(fd)).sort()
    return { ev, al, deviceList }
  }, [plantFilteredEvents, plantFilteredAlerts, selectedSectorCode, filterDeviceCode])

  const cameraRows = useMemo(() => {
    if (!selectedSectorBuckets || !selectedSectorCode) return []
    const { ev, al, deviceList } = selectedSectorBuckets
    return deviceList.map((dev) => {
      const evC = ev.filter((e) => e.deviceCode === dev)
      const alC = al.filter((a) => a.deviceCode === dev)
      const diagnostic = buildCameraDiagnostics(plantFilteredEvents, plantFilteredAlerts, dev, selectedSectorCode)
      const lastEv = [...evC].sort((a, b) => eventOperationalInstantMs(b) - eventOperationalInstantMs(a))[0]
      const lastAl = [...alC].sort((a, b) => parseMillis(b.occurredAt) - parseMillis(a.occurredAt))[0]
      const pct =
        evC.length > 0 ? Math.min(100, Math.round((alC.length / evC.length) * 100)) : alC.length > 0 ? 100 : 0
      const status = computeCameraStatus(evC.length, alC.length, alC)
      const combined = buildCombinedDetections(ev, al, dev, selectedSectorCode)
      const latest = combined[0]
      let liveResultado: CombinedResultKind = 'SIN DATOS'
      let displayPlate = '—'
      let lastDetectionAt = ''
      if (latest) {
        liveResultado = latest.resultado
        displayPlate = latest.plate || '—'
        lastDetectionAt = latest.at
      } else if (lastEv) {
        liveResultado = 'EVENTO OK'
        displayPlate = lastEv.truckPlate || lastEv.normalizedPlate || '—'
        lastDetectionAt = eventOperationalInstantIso(lastEv)
      } else if (lastAl) {
        liveResultado = 'SOLO ALERTA'
        displayPlate = lastAl.rawPlate || lastAl.normalizedPlate || '—'
        lastDetectionAt = lastAl.occurredAt
      }
      return {
        deviceCode: dev,
        sectorCode: selectedSectorCode,
        lastEventAt: lastEv ? eventOperationalInstantIso(lastEv) : '',
        lastAlertAt: lastAl?.occurredAt ?? '',
        eventCount: evC.length,
        alertCount: alC.length,
        alertPct: pct,
        status,
        diagnostic,
        liveResultado,
        displayPlate,
        lastDetectionAt,
      }
    })
  }, [plantFilteredEvents, plantFilteredAlerts, selectedSectorBuckets, selectedSectorCode])

  const monitorEvents = useMemo(() => {
    if (!selectedSectorCode || !selectedDeviceCode) return []
    return plantFilteredEvents
      .filter((e) => e.sectorCode === selectedSectorCode && e.deviceCode === selectedDeviceCode)
      .sort((a, b) => eventOperationalInstantMs(b) - eventOperationalInstantMs(a))
  }, [plantFilteredEvents, selectedSectorCode, selectedDeviceCode])

  const monitorAlerts = useMemo(() => {
    if (!selectedSectorCode || !selectedDeviceCode) return []
    return plantFilteredAlerts
      .filter((a) => a.sectorCode === selectedSectorCode && a.deviceCode === selectedDeviceCode)
      .sort((a, b) => parseMillis(b.occurredAt) - parseMillis(a.occurredAt))
  }, [plantFilteredAlerts, selectedSectorCode, selectedDeviceCode])

  const selectedCameraDiagnostic: CameraDiagnostics | null = useMemo(() => {
    if (!selectedSectorCode || !selectedDeviceCode) return null
    return buildCameraDiagnostics(plantFilteredEvents, plantFilteredAlerts, selectedDeviceCode, selectedSectorCode)
  }, [plantFilteredEvents, plantFilteredAlerts, selectedSectorCode, selectedDeviceCode])

  const operationalTimeline = useMemo(() => {
    if (!selectedSectorCode || !selectedDeviceCode) return []
    return buildOperationalTimeline(plantFilteredEvents, plantFilteredAlerts, selectedDeviceCode, selectedSectorCode)
  }, [plantFilteredEvents, plantFilteredAlerts, selectedSectorCode, selectedDeviceCode])

  const frontRearRows: FrontRearComparisonRow[] = useMemo(() => {
    if (!selectedSectorCode) return []
    const pairs = frontRearPairsForSector(selectedSectorCode)
    return pairs.flatMap((pair) =>
      compareFrontRearCameras(plantFilteredEvents, selectedSectorCode, pair.front, pair.rear).slice(0, 10)
    )
  }, [plantFilteredEvents, selectedSectorCode])

  /** Actualiza observaciones de campo según datos vigentes en ventana ±30s. */
  useEffect(() => {
    setObservations((prev) =>
      prev.map((row) => evaluateManualObservation(row, plantFilteredEvents, plantFilteredAlerts))
    )
  }, [plantFilteredEvents, plantFilteredAlerts])

  const pasoCamion = () => {
    if (!selectedSectorCode || !selectedDeviceCode) return
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `obs-${Date.now()}-${Math.random()}`
    const observedAt = toIsoLocal(new Date())
    const base: ManualObservation = {
      id,
      observedAt,
      sectorCode: selectedSectorCode,
      sectorLabel: sectorDisplayName(selectedSectorCode),
      deviceCode: selectedDeviceCode,
      vehicleType,
      observedPlate: observedPlate.trim(),
      operatorNote: operatorNote.trim(),
      manualObservation: manualObservation.trim(),
      result: 'pendiente',
      linkedEventSummary: '—',
      linkedAlertSummary: '—',
    }
    setObservations((prev) => [
      evaluateManualObservation(base, plantFilteredEvents, plantFilteredAlerts),
      ...prev,
    ])
  }

  const downloadTextFile = useCallback((fileName: string, content: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  const exportSelectedDiagnostic = useCallback(
    (format: 'json' | 'csv') => {
      if (!selectedCameraDiagnostic) return
      const obs = observations.filter(
        (o) => o.deviceCode === selectedCameraDiagnostic.deviceCode && o.sectorCode === selectedCameraDiagnostic.sectorCode
      )
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const base = `diagnostico-camara_${selectedCameraDiagnostic.deviceCode}_${stamp}`
      if (format === 'json') {
        downloadTextFile(
          `${base}.json`,
          exportCameraDiagnosticJson({ diagnostic: selectedCameraDiagnostic, periodLabel: rangeLabel, observations: obs }),
          'application/json;charset=utf-8'
        )
      } else {
        downloadTextFile(
          `${base}.csv`,
          '\uFEFF' +
            exportCameraDiagnosticCsv({ diagnostic: selectedCameraDiagnostic, periodLabel: rangeLabel, observations: obs }),
          'text/csv;charset=utf-8'
        )
      }
    },
    [downloadTextFile, observations, rangeLabel, selectedCameraDiagnostic]
  )

  const sectorOptions = useMemo(() => {
    const set = new Set<string>(getCatalogSectorCodesForLiveMonitor(plantSiteId))
    plantFilteredEvents.forEach((e) => {
      if (e.sectorCode.trim()) set.add(e.sectorCode.trim())
    })
    plantFilteredAlerts.forEach((a) => {
      if (a.sectorCode.trim()) set.add(a.sectorCode.trim())
    })
    return [...set].sort((a, b) => sectorDisplayName(a).localeCompare(sectorDisplayName(b)))
  }, [plantFilteredEvents, plantFilteredAlerts, plantSiteId])

  const deviceOptions = useMemo(() => {
    const set = new Set<string>()
    getCatalogSectorCodesForLiveMonitor(plantSiteId).forEach((sec) => {
      getExpectedDevicesForLiveSector(sec).forEach((d) => set.add(d))
    })
    plantFilteredEvents.forEach((e) => {
      if (e.deviceCode.trim()) set.add(e.deviceCode.trim())
    })
    plantFilteredAlerts.forEach((a) => {
      if (a.deviceCode.trim()) set.add(a.deviceCode.trim())
    })
    return [...set].sort()
  }, [plantFilteredEvents, plantFilteredAlerts, plantSiteId])

  /** Primera vez: sector activo para ver rejilla de cámaras al cargar */
  useEffect(() => {
    if (selectedSectorCode !== null) return
    if (sectorsAgg.length === 0) return
    setSelectedSectorCode(sectorsAgg[0].sectorCode)
  }, [sectorsAgg, selectedSectorCode])

  const smallTableClass = 'min-w-full border-collapse text-left text-xs'
  const thClass =
    'border border-slate-700/80 bg-slate-950/80 px-2 py-1.5 font-semibold uppercase tracking-wide text-slate-400'
  const tdClass = 'border border-slate-800 px-2 py-1.5 text-slate-200'

  function badgeForLiveResult(r: CombinedResultKind): { label: string; className: string } {
    switch (r) {
      case 'EVENTO OK':
        return { label: 'EVENTO VÁLIDO', className: 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/40' }
      case 'SOLO ALERTA':
        return { label: 'SOLO ALERTAS', className: 'bg-amber-500/20 text-amber-200 ring-amber-400/35' }
      case 'EVENTO + ALERTA':
        return { label: 'EVENTO + ALERTA', className: 'bg-cyan-500/15 text-cyan-200 ring-cyan-400/40' }
      default:
        return { label: 'SIN SEÑAL', className: 'bg-slate-700/40 text-slate-400 ring-slate-600/50' }
    }
  }

  function sectorStatusLabel(status: LiveSectorStatus): string {
    if (status === 'sin_datos') return 'Sin datos'
    if (status === 'operativa') return 'Operativa'
    if (status === 'con_alertas') return 'Con alertas'
    if (status === 'critica') return 'Crítica'
    return 'Pendiente'
  }

  function sectorStatusClass(status: LiveSectorStatus): string {
    if (status === 'operativa') return 'text-emerald-300 ring-emerald-500/40'
    if (status === 'con_alertas') return 'text-amber-200 ring-amber-500/40'
    if (status === 'critica') return 'text-rose-300 ring-rose-500/40'
    if (status === 'pendiente_validacion') return 'text-cyan-200 ring-cyan-500/40'
    return 'text-slate-400 ring-slate-600/50'
  }

  function timelineKindClass(kind: OperationalTimelineKind): string {
    if (kind === 'EVENTO OK') return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100'
    if (kind === 'EVENTO + ALERTA') return 'border-cyan-500/35 bg-cyan-500/10 text-cyan-100'
    if (kind === 'LPR inválida') return 'border-rose-500/35 bg-rose-500/10 text-rose-100'
    if (kind === 'Posible falso positivo') return 'border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-100'
    return 'border-amber-500/35 bg-amber-500/10 text-amber-100'
  }

  function manualResultLabel(result: ManualObservation['result']): string {
    if (result === 'detecto_evento_alerta') return 'Detectó evento + alerta'
    if (result === 'detecto_evento') return 'Detectó evento'
    if (result === 'detecto_alerta') return 'Detectó alerta'
    if (result === 'no_detecto_nada') return 'No detectó nada'
    return 'Pendiente'
  }

  const activeNodes = selectedSectorCode ? cameraRows.length : 0
  const sectorShortTitle = selectedSectorCode ? sectorDisplayName(selectedSectorCode) : '—'

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-[#0b1020] text-slate-100 shadow-xl ring-1 ring-white/5">
      {/* Barra superior tipo consola */}
      <header className="flex flex-col gap-4 border-b border-slate-800/90 bg-[#080d18] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400/90">Truckflow</p>
          <h2 className="mt-0.5 text-lg font-bold tracking-tight text-white sm:text-xl">Consola operativa · En vivo</h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Feed desde{' '}
            <span className="font-mono text-cyan-200/80">{REAL_TRUCKFLOW_BASE_URL}/journey-event/list</span> +{' '}
            <span className="font-mono text-cyan-200/80">{REAL_TRUCKFLOW_BASE_URL}/alert/list</span>
            {' · '}
            <span className="font-mono text-slate-500" title="Origen HTTP que usa el navegador (proxy en dev)">
              {apiOriginLabel}
            </span>
            {rangeLabel ? (
              <>
                {' '}
                · Ventana local <span className="text-slate-300">{rangeLabel}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${
              error
                ? 'bg-rose-500/15 text-rose-300 ring-rose-500/40'
                : loading
                  ? 'bg-amber-500/15 text-amber-200 ring-amber-400/35'
                  : 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/35'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-rose-400' : loading ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            {error ? 'Error de lectura' : loading ? 'Sincronizando…' : 'Nominal'}
          </span>
          <span className="rounded-md bg-slate-800/80 px-2 py-1 font-mono text-[10px] text-slate-400">
            Nodos {activeNodes.toString().padStart(2, '0')}
          </span>
        </div>
      </header>

      {/* Filtros compactos */}
      <div className="border-b border-slate-800/80 bg-[#0c1222] px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <div className="min-w-[190px]">
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-slate-500">Modo de trabajo</label>
            <select
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value as LiveWorkMode)}
              className="w-full rounded-lg border border-cyan-700/50 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-cyan-100"
            >
              {(Object.keys(WORK_MODE_LABELS) as LiveWorkMode[]).map((mode) => (
                <option key={mode} value={mode} className="bg-slate-900">
                  {WORK_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-slate-500">Planta</label>
            <select
              value={plantSiteId}
              onChange={(e) => onPlantChange(e.target.value as SiteId)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
            >
              {SITES.filter((s) => s.enabled).map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900">
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-slate-500">
              Sector API
            </label>
            <select
              value={filterSectorCode}
              onChange={(e) => setFilterSectorCode(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
            >
              <option value="">Todos</option>
              {sectorOptions.map((c) => (
                <option key={c} value={c} className="bg-slate-900">
                  {sectorDisplayName(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[120px] flex-1">
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-slate-500">Cámara</label>
            <select
              value={filterDeviceCode}
              onChange={(e) => setFilterDeviceCode(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-[11px] text-slate-100"
            >
              <option value="">Todas</option>
              {deviceOptions.map((d) => (
                <option key={d} value={d} className="bg-slate-900">
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-slate-500">Día desde</label>
            <input
              type="date"
              value={dateTimeRange.startDate}
              onChange={(e) => setDateTimeRange((prev) => ({ ...prev, startDate: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
            />
          </div>
          <div className="min-w-[92px]">
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-slate-500">Desde</label>
            <input
              type="time"
              value={dateTimeRange.startTime}
              onChange={(e) => setDateTimeRange((prev) => ({ ...prev, startTime: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
            />
          </div>
          <div className="min-w-[130px]">
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-slate-500">Día hasta</label>
            <input
              type="date"
              value={dateTimeRange.endDate}
              onChange={(e) => setDateTimeRange((prev) => ({ ...prev, endDate: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
            />
          </div>
          <div className="min-w-[92px]">
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-slate-500">Hasta</label>
            <input
              type="time"
              value={dateTimeRange.endTime}
              onChange={(e) => setDateTimeRange((prev) => ({ ...prev, endTime: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
            />
          </div>
          <div className="min-w-[90px]">
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-slate-500">Patente</label>
            <input
              value={filterPlate}
              onChange={(e) => setFilterPlate(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-[11px] text-slate-100 placeholder:text-slate-600"
              placeholder="—"
            />
          </div>
          <div className="min-w-[100px] flex-1">
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-slate-500">Journey</label>
            <input
              value={filterJourneyUuid}
              onChange={(e) => setFilterJourneyUuid(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-[10px] text-slate-100 placeholder:text-slate-600"
              placeholder="UUID"
            />
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || !windowBounds}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40"
          >
            {loading ? '…' : 'Actualizar'}
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-[10px] text-slate-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-600"
            />
            Auto 30s
          </label>
        </div>
        {error || rangeValidationMessage ? (
          <div className="mt-3 rounded-lg border border-rose-500/35 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {error || rangeValidationMessage}
          </div>
        ) : null}
      </div>

      {/* Cuerpo: sectores | rejilla cámaras | panel activo */}
      <div className="grid gap-0 xl:grid-cols-12">
        {/* Sectores */}
        <aside className="border-slate-800 xl:col-span-2 xl:border-r">
          <div className="sticky top-0 z-10 border-b border-slate-800 bg-[#0b1020]/95 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sectores</p>
          </div>
          <div className="flex max-h-[min(70vh,560px)] flex-col gap-1.5 overflow-auto p-2">
            {sectorsAgg.length === 0 ? (
              <p className="p-3 text-[11px] text-slate-500">Sin sectores en esta ventana.</p>
            ) : (
              sectorsAgg.map((s) => {
                const active = selectedSectorCode === s.sectorCode
                return (
                  <button
                    key={s.sectorCode}
                    type="button"
                    onClick={() => {
                      setSelectedSectorCode(s.sectorCode)
                      setSelectedDeviceCode(null)
                      setCameraFocusFull(false)
                    }}
                    onDoubleClick={() => {
                      setSelectedSectorCode(s.sectorCode)
                      camerasPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                    }}
                    className={`rounded-lg border px-2.5 py-2 text-left transition ${
                      active
                        ? 'border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_20px_rgba(34,211,238,0.08)]'
                        : 'border-slate-800 bg-slate-900/40 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[11px] font-bold uppercase leading-tight text-slate-200">{s.label}</span>
                      <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase ring-1 ${sectorStatusClass(s.status)}`}>
                        {sectorStatusLabel(s.status)}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[9px] text-slate-500">{s.sectorCode}</div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1 text-center font-mono text-[9px] text-slate-400">
                      <span className="rounded bg-slate-950/80 py-0.5" title="Cámaras">
                        CAM {String(s.cameraCount).padStart(2, '0')}
                      </span>
                      <span className="rounded bg-slate-950/80 py-0.5 text-emerald-300/90" title="Eventos">
                        E {String(s.eventCount).padStart(2, '0')}
                      </span>
                      <span className="rounded bg-slate-950/80 py-0.5 text-amber-300/90" title="Alertas">
                        A {String(s.alertCount).padStart(2, '0')}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* Rejilla de cámaras */}
        <main ref={camerasPanelRef} className="border-slate-800 xl:col-span-6 xl:border-r">
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#0b1020]/95 px-3 py-2 backdrop-blur-sm sm:px-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Monitor en vivo</p>
              <p className="text-sm font-semibold text-white">{sectorShortTitle}</p>
              <p className="font-mono text-[10px] text-cyan-400/70">
                LIVE FEED · {activeNodes} nodos activos
              </p>
            </div>
          </div>

          <div className="p-3 sm:p-4">
            {!selectedSectorCode ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center text-sm text-slate-500">
                Elegí un sector en la columna izquierda.
              </div>
            ) : cameraRows.length === 0 ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 p-4 text-sm text-amber-100/90">
                <p className="font-medium">Sin cámaras catalogadas en este sector.</p>
                <p className="mt-1 text-xs text-amber-200/70">
                  Ampliá la ventana temporal o esperá lecturas con <span className="font-mono">deviceCode</span> desde la API.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
                {cameraRows.map((cam) => {
                  const selected = selectedDeviceCode === cam.deviceCode
                  const badge = badgeForLiveResult(cam.liveResultado)
                  return (
                    <button
                      key={cam.deviceCode}
                      type="button"
                      onClick={() => {
                        setSelectedDeviceCode(cam.deviceCode)
                        setCameraFocusFull(false)
                      }}
                      onDoubleClick={() => {
                        setSelectedDeviceCode(cam.deviceCode)
                        setCameraFocusFull(true)
                        monitorPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                      }}
                      className={`group overflow-hidden rounded-xl border text-left transition ${
                        selected
                          ? 'border-cyan-400/60 bg-slate-900/80 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                          : 'border-slate-800 bg-slate-950/50 hover:border-slate-600'
                      }`}
                    >
                      {/* Área “video” placeholder */}
                      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-slate-900 via-[#0f172a] to-slate-950">
                        <div
                          className="absolute inset-0 opacity-[0.07]"
                          style={{
                            backgroundImage:
                              'linear-gradient(rgba(148,163,184,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.4) 1px, transparent 1px)',
                            backgroundSize: '14px 14px',
                          }}
                        />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3">
                          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                            Stream no disponible
                          </span>
                          <span className="text-center text-[9px] text-slate-600">Datos API · patente detectada</span>
                        </div>
                        <div className="absolute left-2 top-2">
                          <span
                            className={`inline-flex rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                      </div>
                      <div className="border-t border-slate-800 p-3">
                        <div className="font-mono text-[11px] font-bold text-cyan-300/90">{cam.deviceCode}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">{sectorDisplayName(cam.sectorCode)}</div>
                        <div className="mt-2 text-center font-mono text-2xl font-bold tracking-wider text-white sm:text-3xl">
                          {cam.displayPlate}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[9px] text-slate-400">
                          <span className="rounded bg-slate-950/80 px-1.5 py-1">
                            Últ. evento {cam.lastEventAt ? fmtShort(cam.lastEventAt) : '—'}
                          </span>
                          <span className="rounded bg-slate-950/80 px-1.5 py-1">
                            Últ. alerta {cam.lastAlertAt ? fmtShort(cam.lastAlertAt) : '—'}
                          </span>
                          <span className="rounded bg-slate-950/80 px-1.5 py-1 text-emerald-300">
                            EVT 10m {cam.diagnostic.eventsLast10Min}
                          </span>
                          <span className="rounded bg-slate-950/80 px-1.5 py-1 text-amber-300">
                            ALT 10m {cam.diagnostic.alertsLast10Min}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-500">
                          <span>{cam.lastDetectionAt ? fmtShort(cam.lastDetectionAt) : '—'}</span>
                          <span>
                            <span className="text-emerald-400/90">EVT {cam.eventCount}</span>
                            {' · '}
                            <span className="text-amber-400/90">ALT {cam.alertCount}</span>
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[9px] font-semibold text-slate-300">
                            {cam.diagnostic.suggestedStatus}
                          </span>
                          <span className="rounded bg-cyan-500/10 px-2 py-1 text-[9px] font-bold uppercase text-cyan-200">
                            Validar cámara
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </main>

        {/* Panel detalle / timeline */}
        <aside
          ref={monitorPanelRef}
          className={`flex flex-col border-slate-800 bg-[#070b14] xl:col-span-4 xl:border-l ${
            cameraFocusFull ? 'ring-2 ring-cyan-500/30 ring-inset' : ''
          }`}
        >
          <div className="border-b border-slate-800 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Stream activo</p>
            {!selectedDeviceCode ? (
              <p className="mt-1 font-mono text-sm text-slate-500">Seleccioná una cámara en la rejilla</p>
            ) : (
              <>
                <p className="mt-1 font-mono text-base font-bold text-cyan-300">{selectedDeviceCode}</p>
                <p className="text-xs text-slate-400">{sectorDisplayName(selectedSectorCode!)}</p>
              </>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
            {selectedSectorCode && selectedDeviceCode ? (
              <>
                {selectedCameraDiagnostic ? (
                  <div className="rounded-2xl border border-cyan-500/25 bg-cyan-950/15 p-4 shadow-[0_0_30px_rgba(8,145,178,0.08)]">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300/80">
                      Monitor de cámara seleccionada
                    </p>
                    <p className="mt-2 text-2xl font-black tracking-tight text-white">
                      {selectedCameraDiagnostic.latestKind === 'event'
                        ? 'EVENTO DETECTADO'
                        : selectedCameraDiagnostic.latestKind === 'alert'
                          ? 'ALERTA DETECTADA'
                          : 'SIN DATOS RECIENTES'}
                    </p>
                    <p className="mt-2 font-mono text-4xl font-bold tracking-wider text-white">
                      {selectedCameraDiagnostic.timeline[0]?.plate || selectedCameraDiagnostic.lastValidPlate}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg bg-slate-950/70 p-2">
                        <div className="text-slate-500">Último evento</div>
                        <div className="font-mono text-slate-200">
                          {selectedCameraDiagnostic.lastEvent ? fmtShort(getEventOperationalInstantIso(selectedCameraDiagnostic.lastEvent)) : '—'}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-950/70 p-2">
                        <div className="text-slate-500">Última alerta</div>
                        <div className="font-mono text-slate-200">
                          {selectedCameraDiagnostic.lastAlert ? fmtShort(selectedCameraDiagnostic.lastAlert.occurredAt) : '—'}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-950/70 p-2">
                        <div className="text-slate-500">Patente válida</div>
                        <div className="font-mono text-emerald-200">{selectedCameraDiagnostic.lastValidPlate}</div>
                      </div>
                      <div className="rounded-lg bg-slate-950/70 p-2">
                        <div className="text-slate-500">Lectura inválida</div>
                        <div className="font-mono text-rose-200">{selectedCameraDiagnostic.lastInvalidReading}</div>
                      </div>
                      <div className="rounded-lg bg-slate-950/70 p-2">
                        <div className="text-slate-500">Alertas LPR</div>
                        <div className="font-mono text-amber-200">{selectedCameraDiagnostic.lprAlertCount}</div>
                      </div>
                      <div className="rounded-lg bg-slate-950/70 p-2">
                        <div className="text-slate-500">LPR cada 100 eventos</div>
                        <div className="font-mono text-cyan-200">{selectedCameraDiagnostic.lprPer100Events}</div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[11px] text-slate-300">
                      <span className="font-semibold text-white">{selectedCameraDiagnostic.suggestedStatus}</span>
                      {' · '}
                      {selectedCameraDiagnostic.recommendedAction}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => exportSelectedDiagnostic('json')}
                        className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold text-cyan-100"
                      >
                        Exportar JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => exportSelectedDiagnostic('csv')}
                        className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-[11px] font-bold text-slate-100"
                      >
                        Exportar CSV
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Validación manual de campo</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <select
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-100"
                    >
                      {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((v) => (
                        <option key={v} value={v}>
                          {VEHICLE_TYPE_LABELS[v]}
                        </option>
                      ))}
                    </select>
                    <input
                      value={observedPlate}
                      onChange={(e) => setObservedPlate(e.target.value)}
                      placeholder="Patente observada"
                      className={`rounded-lg border bg-slate-900 px-2 py-2 font-mono text-xs text-slate-100 ${
                        observedPlate && !isValidObservedPlate(observedPlate) ? 'border-amber-500/50' : 'border-slate-700'
                      }`}
                    />
                    <input
                      value={manualObservation}
                      onChange={(e) => setManualObservation(e.target.value)}
                      placeholder="Observación manual"
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-100 sm:col-span-2"
                    />
                    <input
                      value={operatorNote}
                      onChange={(e) => setOperatorNote(e.target.value)}
                      placeholder="Nota del operador"
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-100 sm:col-span-2"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={pasoCamion}
                    className="mt-3 w-full rounded-lg border border-cyan-500/50 bg-cyan-500/15 py-2.5 text-xs font-bold text-cyan-100 hover:bg-cyan-500/25"
                  >
                    Pasó camión · buscar ±30s
                  </button>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Timeline operativo</p>
                  <ul className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1">
                    {operationalTimeline.slice(0, 16).map((row) => (
                      <li key={row.key} className={`rounded-xl border p-3 text-[11px] ${timelineKindClass(row.kind)}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-wide">{row.kind}</div>
                            <div className="mt-1 font-mono text-sm font-bold text-white">{row.plate || row.rawPlate || '—'}</div>
                          </div>
                          <div className="font-mono text-[10px] text-slate-300">{fmtShort(row.at)}</div>
                        </div>
                        <div className="mt-2 grid gap-1 font-mono text-[10px] text-slate-300">
                          <span>{row.deviceCode} · {row.sectorCode}</span>
                          <span>Journey {row.journeyUid || '—'}</span>
                          <span className="font-sans text-slate-400">{row.description}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {!operationalTimeline.length ? (
                    <p className="mt-2 text-[11px] text-slate-600">Sin línea de tiempo en esta ventana.</p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-600">Elegí una cámara para ver timeline y detalle.</p>
            )}
          </div>
        </aside>
      </div>

      {/* Tablas técnicas colapsables visualmente al fondo */}
      <div className="border-t border-slate-800 bg-[#060914] px-4 py-4 sm:px-6">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Registro técnico</p>

        {selectedSectorCode && selectedDeviceCode ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-[11px] font-bold text-slate-400">Eventos del rango ({monitorEvents.length})</div>
              <div className="mt-2 max-h-[220px] overflow-auto">
                <table className={smallTableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Hora</th>
                      <th className={thClass}>Patente</th>
                      <th className={thClass}>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitorEvents.map((e) => (
                      <tr key={`${e.id}-${e.sequenceNumber}-${getEventOperationalInstantIso(e)}`}>
                        <td className={`${tdClass} whitespace-nowrap text-[10px]`}>
                          {fmtShort(getEventOperationalInstantIso(e))}
                        </td>
                        <td className={`${tdClass} font-mono text-[10px]`}>{e.truckPlate}</td>
                        <td className={`${tdClass} text-[10px]`}>{e.eventType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-[11px] font-bold text-slate-400">Alertas del rango ({monitorAlerts.length})</div>
              <div className="mt-2 max-h-[220px] overflow-auto">
                <table className={smallTableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Hora</th>
                      <th className={thClass}>Código</th>
                      <th className={thClass}>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitorAlerts.map((a) => (
                      <tr key={a.alertId}>
                        <td className={`${tdClass} whitespace-nowrap text-[10px]`}>{fmtShort(a.occurredAt)}</td>
                        <td className={`${tdClass} text-[10px]`}>{a.alertCode || a.alertType}</td>
                        <td className={`${tdClass} max-w-[180px] truncate text-[10px]`}>
                          {a.description || a.message || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {workMode === 'front_rear' ? (
          <div className="mt-3 rounded-xl border border-cyan-500/25 bg-cyan-950/10 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-cyan-200">Comparación frente / trasera</div>
            {!frontRearRows.length ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Este sector no tiene pares frente/trasera configurados o no hay eventos cercanos.
              </p>
            ) : (
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {frontRearRows.slice(0, 12).map((row) => (
                  <div key={row.key} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[11px]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-mono text-cyan-200">{fmtShort(row.at)}</div>
                      <div className="rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase text-slate-200">{row.result}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[10px] text-slate-300">
                      <div>
                        <div className="text-slate-500">Frontal · {row.frontDeviceCode}</div>
                        <div className="text-white">{row.frontPlate}</div>
                        <div className="truncate text-slate-500">{row.frontJourneyUid}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Trasera · {row.rearDeviceCode}</div>
                        <div className="text-white">{row.rearPlate}</div>
                        <div className="truncate text-slate-500">{row.rearJourneyUid}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-slate-500">Diferencia: {row.deltaSeconds ?? '—'}s</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {workMode === 'lpr' && selectedCameraDiagnostic ? (
          <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-950/10 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-amber-200">Diagnóstico LPR automático</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-slate-950/70 p-3">
                <div className="text-[10px] uppercase text-slate-500">Estado</div>
                <div className="mt-1 font-bold text-white">{selectedCameraDiagnostic.suggestedStatus}</div>
              </div>
              <div className="rounded-lg bg-slate-950/70 p-3">
                <div className="text-[10px] uppercase text-slate-500">Alertas LPR</div>
                <div className="mt-1 font-mono text-xl text-amber-200">{selectedCameraDiagnostic.lprAlertCount}</div>
              </div>
              <div className="rounded-lg bg-slate-950/70 p-3">
                <div className="text-[10px] uppercase text-slate-500">LPR/100 eventos</div>
                <div className="mt-1 font-mono text-xl text-cyan-200">{selectedCameraDiagnostic.lprPer100Events}</div>
              </div>
              <div className="rounded-lg bg-slate-950/70 p-3">
                <div className="text-[10px] uppercase text-slate-500">Inválidas frecuentes</div>
                <div className="mt-1 font-mono text-xs text-rose-200">
                  {selectedCameraDiagnostic.invalidReadings.slice(0, 3).map((r) => `${r.value} (${r.count})`).join(' · ') || '—'}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-amber-100/80">{selectedCameraDiagnostic.recommendedAction}</p>
          </div>
        ) : null}

        <div className={`mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 ${selectedSectorCode && selectedDeviceCode ? '' : 'mt-0'}`}>
          <div className="text-[11px] font-bold text-slate-400">Controles manuales de campo</div>
          {!observations.length ? (
            <p className="mt-2 text-[11px] text-slate-600">
              Usá «Pasó camión» con una cámara seleccionada para registrar la observación.
            </p>
          ) : (
            <div className="mt-2 max-h-[200px] overflow-auto">
              <table className={smallTableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Hora</th>
                    <th className={thClass}>Cámara</th>
                    <th className={thClass}>Sector</th>
                    <th className={thClass}>Resultado</th>
                    <th className={thClass}>Vehículo</th>
                    <th className={thClass}>Patente obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {observations.map((o) => (
                    <tr key={o.id}>
                      <td className={`${tdClass} whitespace-nowrap text-[10px]`}>{fmtShort(o.observedAt)}</td>
                      <td className={`${tdClass} font-mono text-[10px]`}>{o.deviceCode}</td>
                      <td className={`${tdClass} text-[10px]`}>{o.sectorLabel}</td>
                      <td className={`${tdClass} text-[10px]`}>{manualResultLabel(o.result)}</td>
                      <td className={`${tdClass} text-[10px]`}>{VEHICLE_TYPE_LABELS[o.vehicleType]}</td>
                      <td className={`${tdClass} font-mono text-[10px]`}>{o.observedPlate || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
