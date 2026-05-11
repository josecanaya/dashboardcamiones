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
import { fetchAlerts, fetchJourneyEvents, type RealTruckflowQueryParams } from '../../services/realTruckflowApi'

const MATCH_WINDOW_MS = 20_000
const AUTO_REFRESH_MS = 5000
const FIELD_WATCH_MS = 20_000

type TimePresetId = 5 | 10 | 30 | 60

const TIME_PRESETS: { id: TimePresetId; label: string; minutes: number }[] = [
  { id: 5, label: 'Últimos 5 minutos', minutes: 5 },
  { id: 10, label: 'Últimos 10 minutos', minutes: 10 },
  { id: 30, label: 'Últimos 30 minutos', minutes: 30 },
  { id: 60, label: 'Última hora', minutes: 60 },
]

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

function parseMillis(iso: string): number {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? NaN : t
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

type SectorAggStatus = 'sin_datos' | 'normal' | 'con_alertas' | 'critico'

function computeSectorStatus(eventCount: number, alertCount: number, alerts: NormalizedRealAlertView[]): SectorAggStatus {
  if (eventCount === 0 && alertCount === 0) return 'sin_datos'
  const critical = alerts.some((a) => {
    const raw = a.raw as Record<string, unknown>
    const sev = String(raw.severity ?? raw.alertSeverity ?? '').toUpperCase()
    if (/CRITICAL|CRÍTICO|HIGH|ALTA/i.test(sev)) return true
    return a.alertLevel >= 8
  })
  if (critical) return 'critico'
  if (alertCount > 0) return 'con_alertas'
  return 'normal'
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
    .sort((a, b) => parseMillis(b.occurredAt) - parseMillis(a.occurredAt))
  const als = alerts
    .filter((a) => a.deviceCode === deviceCode && a.sectorCode === sectorCode)
    .sort((a, b) => parseMillis(b.occurredAt) - parseMillis(a.occurredAt))

  if (!evs.length && !als.length) return []

  const usedAlertIds = new Set<string>()
  const rows: CombinedDetectionRow[] = []

  for (const ev of evs) {
    const t0 = parseMillis(ev.occurredAt)
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
        at: ev.occurredAt,
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
        at: ev.occurredAt,
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

export type FieldObservationStatus =
  | 'esperando datos'
  | 'detectado con evento'
  | 'detectado con alerta'
  | 'detectado con evento + alerta'
  | 'sin detección'

export type FieldObservationRow = {
  id: string
  observedAt: string
  sectorCode: string
  sectorLabel: string
  deviceCode: string
  status: FieldObservationStatus
  linkedEventSummary: string
  linkedAlertSummary: string
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

  const [timePreset, setTimePreset] = useState<TimePresetId>(10)
  const [autoRefresh, setAutoRefresh] = useState(true)
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

  const [observations, setObservations] = useState<FieldObservationRow[]>([])

  const camerasPanelRef = useRef<HTMLDivElement | null>(null)
  const monitorPanelRef = useRef<HTMLDivElement | null>(null)
  const inFlightRef = useRef(false)

  const windowBounds = useMemo(() => {
    const end = new Date()
    const presetMin = TIME_PRESETS.find((p) => p.id === timePreset)?.minutes ?? 10
    const start = new Date(end.getTime() - presetMin * 60 * 1000)
    return { start, end, presetMin }
  }, [timePreset])

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    setError(null)
    const { start, end } = windowBounds
    const params: RealTruckflowQueryParams = {
      startDate: toIsoLocal(start),
      endDate: toIsoLocal(end),
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
      const [evts, rawAlerts] = await Promise.all([fetchJourneyEvents(params), fetchAlerts(params)])
      const startMs = start.getTime()
      const endMs = end.getTime()
      const inRange = (iso: string) => {
        const t = new Date(iso).getTime()
        return !Number.isNaN(t) && t >= startMs && t <= endMs
      }
      const evFiltered = evts.filter((e) => inRange(e.occurredAt))
      const norm = rawAlerts.map(normalizeRealAlertForView).filter((a) => inRange(a.occurredAt))
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
  }, [windowBounds, filterPlate, filterJourneyUuid, filterSectorCode, filterDeviceCode])

  useEffect(() => {
    void refresh()
  }, [refresh, plantSiteId, timePreset])

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
        const status = computeSectorStatus(ec, ac, bucket.alerts)
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
  }, [plantFilteredEvents, plantFilteredAlerts, plantSiteId, filterSectorCode])

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
      const lastEv = [...evC].sort((a, b) => parseMillis(b.occurredAt) - parseMillis(a.occurredAt))[0]
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
        lastDetectionAt = lastEv.occurredAt
      } else if (lastAl) {
        liveResultado = 'SOLO ALERTA'
        displayPlate = lastAl.rawPlate || lastAl.normalizedPlate || '—'
        lastDetectionAt = lastAl.occurredAt
      }
      return {
        deviceCode: dev,
        sectorCode: selectedSectorCode,
        lastEventAt: lastEv?.occurredAt ?? '',
        lastAlertAt: lastAl?.occurredAt ?? '',
        eventCount: evC.length,
        alertCount: alC.length,
        alertPct: pct,
        status,
        liveResultado,
        displayPlate,
        lastDetectionAt,
      }
    })
  }, [selectedSectorBuckets, selectedSectorCode])

  const monitorCombined = useMemo(() => {
    if (!selectedSectorCode || !selectedDeviceCode) return []
    return buildCombinedDetections(plantFilteredEvents, plantFilteredAlerts, selectedDeviceCode, selectedSectorCode)
  }, [plantFilteredEvents, plantFilteredAlerts, selectedSectorCode, selectedDeviceCode])

  const monitorEvents = useMemo(() => {
    if (!selectedSectorCode || !selectedDeviceCode) return []
    return plantFilteredEvents
      .filter((e) => e.sectorCode === selectedSectorCode && e.deviceCode === selectedDeviceCode)
      .sort((a, b) => parseMillis(b.occurredAt) - parseMillis(a.occurredAt))
  }, [plantFilteredEvents, selectedSectorCode, selectedDeviceCode])

  const monitorAlerts = useMemo(() => {
    if (!selectedSectorCode || !selectedDeviceCode) return []
    return plantFilteredAlerts
      .filter((a) => a.sectorCode === selectedSectorCode && a.deviceCode === selectedDeviceCode)
      .sort((a, b) => parseMillis(b.occurredAt) - parseMillis(a.occurredAt))
  }, [plantFilteredAlerts, selectedSectorCode, selectedDeviceCode])

  const monitorHeadline = useMemo(() => {
    if (!selectedSectorCode || !selectedDeviceCode) {
      return { estado: 'SIN DATOS' as CombinedResultKind, ultEv: '', ultAl: '' }
    }
    const lastEv = monitorEvents[0]
    const lastAl = monitorAlerts[0]
    const rows = buildCombinedDetections(plantFilteredEvents, plantFilteredAlerts, selectedDeviceCode, selectedSectorCode)
    let estado: CombinedResultKind = 'SIN DATOS'
    if (!lastEv && !lastAl) estado = 'SIN DATOS'
    else if (rows.length && rows[0]) estado = rows[0].resultado
    else if (lastEv && !lastAl) estado = 'EVENTO OK'
    else if (lastAl && !lastEv) estado = 'SOLO ALERTA'
    return { estado, ultEv: lastEv?.occurredAt ?? '', ultAl: lastAl?.occurredAt ?? '' }
  }, [plantFilteredEvents, plantFilteredAlerts, selectedSectorCode, selectedDeviceCode, monitorEvents, monitorAlerts])

  /** Actualiza observaciones de campo según datos vigentes */
  useEffect(() => {
    setObservations((prev) =>
      prev.map((row) => {
        if (row.status !== 'esperando datos') return row
        const t0 = parseMillis(row.observedAt)
        if (Number.isNaN(t0)) return row
        const deadline = t0 + FIELD_WATCH_MS
        const now = Date.now()
        if (now > deadline) {
          return { ...row, status: 'sin detección', linkedEventSummary: '—', linkedAlertSummary: '—' }
        }
        const evHit = plantFilteredEvents.find((e) => {
          const te = parseMillis(e.occurredAt)
          return (
            e.deviceCode === row.deviceCode &&
            e.sectorCode === row.sectorCode &&
            !Number.isNaN(te) &&
            te >= t0 &&
            te <= deadline
          )
        })
        const alHit = plantFilteredAlerts.find((a) => {
          const ta = parseMillis(a.occurredAt)
          return (
            a.deviceCode === row.deviceCode &&
            a.sectorCode === row.sectorCode &&
            !Number.isNaN(ta) &&
            ta >= t0 &&
            ta <= deadline
          )
        })
        let status: FieldObservationStatus = 'esperando datos'
        let linkedEventSummary = '—'
        let linkedAlertSummary = '—'
        if (evHit && alHit) {
          status = 'detectado con evento + alerta'
          linkedEventSummary = `${fmtShort(evHit.occurredAt)} · ${evHit.eventType || ''} · ${evHit.truckPlate || ''}`
          linkedAlertSummary = `${fmtShort(alHit.occurredAt)} · ${alHit.alertCode || alHit.alertType}`
        } else if (evHit) {
          status = 'detectado con evento'
          linkedEventSummary = `${fmtShort(evHit.occurredAt)} · ${evHit.eventType || ''} · ${evHit.truckPlate || ''}`
        } else if (alHit) {
          status = 'detectado con alerta'
          linkedAlertSummary = `${fmtShort(alHit.occurredAt)} · ${alHit.alertCode || alHit.alertType}`
        }
        if (status !== 'esperando datos') {
          return { ...row, status, linkedEventSummary, linkedAlertSummary }
        }
        return row
      })
    )
  }, [plantFilteredEvents, plantFilteredAlerts])

  const pasoCamion = () => {
    if (!selectedSectorCode || !selectedDeviceCode) return
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `obs-${Date.now()}-${Math.random()}`
    const observedAt = toIsoLocal(new Date())
    setObservations((prev) => [
      {
        id,
        observedAt,
        sectorCode: selectedSectorCode,
        sectorLabel: sectorDisplayName(selectedSectorCode),
        deviceCode: selectedDeviceCode,
        status: 'esperando datos',
        linkedEventSummary: '—',
        linkedAlertSummary: '—',
      },
      ...prev,
    ])
  }

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

  function timelineDotClass(resultado: CombinedResultKind): string {
    if (resultado === 'EVENTO OK') return 'bg-emerald-400'
    if (resultado === 'SOLO ALERTA') return 'bg-amber-400'
    if (resultado === 'EVENTO + ALERTA') return 'bg-cyan-400'
    return 'bg-slate-600'
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
            Feed desde <span className="font-mono text-cyan-200/80">/journey-event/list</span> +{' '}
            <span className="font-mono text-cyan-200/80">/alert/list</span>
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
          <div>
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-slate-500">Ventana</label>
            <select
              value={timePreset}
              onChange={(e) => setTimePreset(Number(e.target.value) as TimePresetId)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
            >
              {TIME_PRESETS.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900">
                  {p.label}
                </option>
              ))}
            </select>
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
            disabled={loading}
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
            Auto 5s
          </label>
        </div>
        {error ? (
          <div className="mt-3 rounded-lg border border-rose-500/35 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {error}
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
                const critical = s.status === 'critico'
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
                      {critical ? (
                        <span className="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase text-rose-300 ring-1 ring-rose-500/40">
                          Crítico
                        </span>
                      ) : null}
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
                        <div className="mt-2 text-center font-mono text-2xl font-bold tracking-wider text-white sm:text-3xl">
                          {cam.displayPlate}
                        </div>
                        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-500">
                          <span>{cam.lastDetectionAt ? fmtShort(cam.lastDetectionAt) : '—'}</span>
                          <span>
                            <span className="text-emerald-400/90">EVT {cam.eventCount}</span>
                            {' · '}
                            <span className="text-amber-400/90">ALT {cam.alertCount}</span>
                          </span>
                        </div>
                        <p className="mt-1 text-[9px] text-slate-600 group-hover:text-slate-500">
                          Clic · foco · doble clic · panel derecho
                        </p>
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
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/25 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">Última detección</p>
                  <p className="mt-2 font-mono text-3xl font-bold tracking-wider text-white">
                    {monitorCombined[0]?.plate ||
                      monitorEvents[0]?.truckPlate ||
                      monitorAlerts[0]?.rawPlate ||
                      '—'}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    Estado: <span className="font-semibold text-slate-200">{monitorHeadline.estado}</span>
                  </p>
                  <div className="mt-3 grid gap-1 text-[11px] text-slate-500">
                    <div>Evento: {monitorHeadline.ultEv ? fmtShort(monitorHeadline.ultEv) : '—'}</div>
                    <div>Alerta: {monitorHeadline.ultAl ? fmtShort(monitorHeadline.ultAl) : '—'}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={pasoCamion}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800/80 py-2.5 text-xs font-semibold text-slate-100 hover:border-cyan-500/40 hover:bg-slate-800"
                >
                  Pasó camión — control manual
                </button>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Timeline operativo</p>
                  <ul className="mt-3 max-h-[280px] space-y-3 overflow-auto pr-1">
                    {monitorCombined.slice(0, 12).map((row) => (
                      <li key={row.key} className="flex gap-3 text-[11px]">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${timelineDotClass(row.resultado)}`}
                        />
                        <div>
                          <div className="font-mono text-slate-300">{fmtShort(row.at)}</div>
                          <div className="font-mono text-sm font-semibold text-white">{row.plate}</div>
                          <div className="text-slate-500">
                            <span className="text-emerald-400/80">{row.eventSummary}</span>
                            {row.alertSummary !== '—' ? (
                              <>
                                {' · '}
                                <span className="text-amber-400/80">{row.alertSummary}</span>
                              </>
                            ) : null}
                          </div>
                          <div className="text-[10px] uppercase tracking-wide text-cyan-400/70">{row.resultado}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {!monitorCombined.length ? (
                    <p className="mt-2 text-[11px] text-slate-600">Sin línea de tiempo en esta ventana.</p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/50">
                  <div className="border-b border-slate-800 px-3 py-2 text-[10px] font-bold uppercase text-slate-500">
                    Detalle tabular
                  </div>
                  <div className="max-h-[200px] overflow-auto p-2">
                    <table className={smallTableClass}>
                      <thead>
                        <tr>
                          <th className={thClass}>Hora</th>
                          <th className={thClass}>Pat.</th>
                          <th className={thClass}>Res.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monitorCombined.slice(0, 15).map((r) => (
                          <tr key={r.key}>
                            <td className={`${tdClass} whitespace-nowrap text-[10px]`}>{fmtShort(r.at)}</td>
                            <td className={`${tdClass} font-mono text-[10px]`}>{r.plate}</td>
                            <td className={`${tdClass} text-[10px]`}>{r.resultado}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
              <div className="text-[11px] font-bold text-slate-400">Eventos recientes</div>
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
                    {monitorEvents.slice(0, 40).map((e) => (
                      <tr key={`${e.id}-${e.sequenceNumber}-${e.occurredAt}`}>
                        <td className={`${tdClass} whitespace-nowrap text-[10px]`}>{fmtShort(e.occurredAt)}</td>
                        <td className={`${tdClass} font-mono text-[10px]`}>{e.truckPlate}</td>
                        <td className={`${tdClass} text-[10px]`}>{e.eventType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-[11px] font-bold text-slate-400">Alertas recientes</div>
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
                    {monitorAlerts.slice(0, 40).map((a) => (
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
                  </tr>
                </thead>
                <tbody>
                  {observations.map((o) => (
                    <tr key={o.id}>
                      <td className={`${tdClass} whitespace-nowrap text-[10px]`}>{fmtShort(o.observedAt)}</td>
                      <td className={`${tdClass} font-mono text-[10px]`}>{o.deviceCode}</td>
                      <td className={`${tdClass} text-[10px]`}>{o.sectorLabel}</td>
                      <td className={`${tdClass} text-[10px]`}>{o.status}</td>
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
