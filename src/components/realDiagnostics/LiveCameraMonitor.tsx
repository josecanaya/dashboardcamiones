import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSite } from '../../context/SiteContext'
import { REAL_TRUCKFLOW_BASE_URL } from '../../services/realTruckflowApi'
import {
  fmtShort,
  getEventLiveInstantIso,
  parseLiveMillis,
  resolveLiveUiWindow,
  type LiveTimeMode,
  type LiveUiWindow,
} from '../../services/live/liveEventTime'
import {
  buildLiveCameraRow,
  buildLiveDetections,
  buildLiveFeedSectorDeviceBreakdown,
  buildLiveSectorSummary,
  filterLiveAlertsForView,
  isLprMalfunctionAlert,
  type LiveDetectionKind,
  type LiveDetectionRow,
} from '../../services/live/liveEventAlertMatch'
import {
  buildLiveCameraExportPayload,
  downloadTextFile,
  liveCameraExportCsv,
  liveCameraExportJson,
} from '../../services/live/liveExport'
import {
  entryDevices,
  entryKey,
  entryLabel,
  entrySectorCodes,
  filterAlertsByMonitorScope,
  filterEventsByMonitorScope,
  findLiveSectorEntryForScope,
  getLiveSectorEntriesForScope,
  scopedEntryKey,
  sectorDisplayName,
  type LiveMonitorScope,
} from '../../services/live/liveOperationalCatalog'
import {
  fetchLiveTruckflowFeed,
  resolveLiveFetchOrigin,
} from '../../services/live/liveTruckflowFeed'
import { useEtlWorkbenchOptional } from '../../features/real-truckflow/etlWorkbench/EtlWorkbenchContext'
import {
  buildCircuitClassificationIndex,
  resolveClassificationForLiveRow,
  type CircuitClassificationEntry,
} from '../../features/real-truckflow/etlWorkbench/etlCircuitClassificationIndex'
import type { RealJourneyEventDto } from '../../services/realJourneyEvents.types'
import type { NormalizedRealAlertView } from '../../services/realAlertsInspector'

const AUTO_REFRESH_MS = 30_000

type LiveDetailTab = 'actividad' | 'eventos' | 'alertas' | 'lprm'

type LiveTableColumn<T> = {
  id: string
  header: string
  className?: string
  cell: (row: T) => ReactNode
}

function truncateMiddle(text: string, max = 14): string {
  const t = text.trim()
  if (t.length <= max) return t
  const head = Math.ceil((max - 1) / 2)
  const tail = Math.floor((max - 1) / 2)
  return `${t.slice(0, head)}…${t.slice(-tail)}`
}

function LiveScrollTable<T>({
  rows,
  columns,
  rowKey,
  emptyMessage,
  maxHeightClass = 'max-h-[min(52vh,480px)]',
}: {
  rows: T[]
  columns: LiveTableColumn<T>[]
  rowKey: (row: T, index: number) => string
  emptyMessage: string
  maxHeightClass?: string
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700/80 bg-slate-950/30 px-4 py-10 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={`overflow-auto rounded-xl border border-slate-800/90 ${maxHeightClass}`}>
      <table className="min-w-full border-collapse text-left text-[11px]">
        <thead className="sticky top-0 z-10 bg-[#0a0f1c] shadow-[0_1px_0_0_rgba(51,65,85,0.6)]">
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                className={`whitespace-nowrap px-3 py-2.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className="border-t border-slate-800/70 transition hover:bg-slate-900/60 odd:bg-slate-950/20"
            >
              {columns.map((col) => (
                <td key={col.id} className={`px-3 py-2 align-middle text-slate-200 ${col.className ?? ''}`}>
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function alertLevelClass(level: number): string {
  if (level >= 8) return 'text-rose-300'
  if (level >= 5) return 'text-amber-200'
  return 'text-slate-400'
}

function badgeForKind(kind: LiveDetectionKind): { label: string; className: string } {
  switch (kind) {
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

function sectorStatusLabel(status: string): string {
  if (status === 'sin_datos') return 'Sin datos'
  if (status === 'operativa') return 'Operativa'
  if (status === 'con_alertas') return 'Con alertas'
  if (status === 'critica') return 'Crítica'
  return status
}

function sectorStatusClass(status: string): string {
  if (status === 'operativa') return 'text-emerald-300 ring-emerald-500/40'
  if (status === 'con_alertas') return 'text-amber-200 ring-amber-500/40'
  if (status === 'critica') return 'text-rose-300 ring-rose-500/40'
  return 'text-slate-400 ring-slate-600/50'
}

function CircuitClassBadge({ entry }: { entry: CircuitClassificationEntry }) {
  return (
    <span
      className="inline-flex max-w-[148px] flex-col rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-tight ring-1 ring-white/10"
      style={{ backgroundColor: `${entry.color}33`, color: entry.color }}
      title={`${entry.pieSliceLabel}${entry.executiveCircuitDisplay ? ` · ${entry.executiveCircuitDisplay}` : ''}`}
    >
      {entry.pieSliceLabel}
    </span>
  )
}

export const LiveCameraMonitor = memo(function LiveCameraMonitor() {
  const { siteId } = useSite()
  const [monitorScope, setMonitorScope] = useState<LiveMonitorScope>('all')
  const [timeMode, setTimeMode] = useState<LiveTimeMode>('rolling_hour')
  const [calendarDay, setCalendarDay] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [dayTimeStart, setDayTimeStart] = useState('00:00')
  const [dayTimeEnd, setDayTimeEnd] = useState('23:59')
  const timeModeRef = useRef(timeMode)
  const calendarDayRef = useRef(calendarDay)
  const dayTimeStartRef = useRef(dayTimeStart)
  const dayTimeEndRef = useRef(dayTimeEnd)
  useEffect(() => {
    timeModeRef.current = timeMode
  }, [timeMode])
  useEffect(() => {
    calendarDayRef.current = calendarDay
  }, [calendarDay])
  useEffect(() => {
    dayTimeStartRef.current = dayTimeStart
  }, [dayTimeStart])
  useEffect(() => {
    dayTimeEndRef.current = dayTimeEnd
  }, [dayTimeEnd])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [filterPlate, setFilterPlate] = useState('')
  const [filterJourneyUuid, setFilterJourneyUuid] = useState('')
  const filterPlateRef = useRef(filterPlate)
  const filterJourneyUuidRef = useRef(filterJourneyUuid)
  useEffect(() => {
    filterPlateRef.current = filterPlate
  }, [filterPlate])
  useEffect(() => {
    filterJourneyUuidRef.current = filterJourneyUuid
  }, [filterJourneyUuid])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<RealJourneyEventDto[]>([])
  const [alerts, setAlerts] = useState<NormalizedRealAlertView[]>([])
  const [uiWindow, setUiWindow] = useState<LiveUiWindow | null>(null)

  const [selectedSectorKey, setSelectedSectorKey] = useState<string | null>(null)
  const [selectedDeviceCode, setSelectedDeviceCode] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<LiveDetailTab>('actividad')
  /** LPR_MALFUNCTION es ruido OCR frecuente de madrugada; oculto por defecto en vista operativa. */
  const [hideLprMalfunction, setHideLprMalfunction] = useState(true)

  const wb = useEtlWorkbenchOptional()
  const circuitClassIndex = useMemo(
    () => buildCircuitClassificationIndex(wb?.transformResult?.csv.debug_matrix_classification),
    [wb?.transformResult?.csv.debug_matrix_classification]
  )
  const showCircuitClassColumn = timeMode === 'calendar_day' && circuitClassIndex.total > 0

  const apiOriginLabel = useMemo(() => resolveLiveFetchOrigin(), [])
  const liveFetchOrigin = useMemo(
    () => (typeof import.meta !== 'undefined' && import.meta.env?.DEV ? undefined : REAL_TRUCKFLOW_BASE_URL),
    []
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const mode = timeModeRef.current
    const resolved = resolveLiveUiWindow(
      mode,
      calendarDayRef.current,
      mode === 'calendar_day' ? dayTimeStartRef.current : '',
      mode === 'calendar_day' ? dayTimeEndRef.current : ''
    )
    if ('error' in resolved) {
      setEvents([])
      setAlerts([])
      setUiWindow(null)
      setError(resolved.error)
      setLoading(false)
      return
    }
    try {
      const feed = await fetchLiveTruckflowFeed(
        resolved,
        {
          plate: filterPlateRef.current.trim(),
          journeyUuid: filterJourneyUuidRef.current.trim(),
        },
        liveFetchOrigin ? { baseOrigin: liveFetchOrigin } : undefined
      )
      setEvents(feed.events)
      setAlerts(feed.alerts)
      setUiWindow(feed.window)
    } catch (e) {
      setEvents([])
      setAlerts([])
      setUiWindow(null)
      setError(e instanceof Error ? e.message : 'Error consultando datos reales')
    } finally {
      setLoading(false)
    }
  }, [liveFetchOrigin])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial; filtros solo con Actualizar
  }, [])

  useEffect(() => {
    if (!autoRefresh || timeMode !== 'rolling_hour') return
    const id = window.setInterval(() => void refresh(), AUTO_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [autoRefresh, refresh, timeMode])

  const plantEvents = useMemo(() => filterEventsByMonitorScope(events, monitorScope), [events, monitorScope])
  const plantAlerts = useMemo(() => filterAlertsByMonitorScope(alerts, monitorScope), [alerts, monitorScope])
  const plantAlertsForView = useMemo(
    () => filterLiveAlertsForView(plantAlerts, hideLprMalfunction),
    [plantAlerts, hideLprMalfunction]
  )
  const lprMalfunctionCount = useMemo(
    () => plantAlerts.filter(isLprMalfunctionAlert).length,
    [plantAlerts]
  )

  const apiFeedBreakdown = useMemo(
    () => buildLiveFeedSectorDeviceBreakdown(plantEvents, plantAlerts),
    [plantEvents, plantAlerts]
  )
  const slApiFeedBreakdown = useMemo(
    () =>
      apiFeedBreakdown.filter(
        (r) =>
          r.sectorCode.startsWith('PUERTO_SAN_LORENZO_') ||
          r.deviceCode.startsWith('SLZ') ||
          r.deviceCode.toLowerCase().startsWith('slz')
      ),
    [apiFeedBreakdown]
  )

  const sectorRows = useMemo(() => getLiveSectorEntriesForScope(monitorScope), [monitorScope])

  const sectorsAgg = useMemo(
    () =>
      sectorRows.map(({ plant, entry }) => {
        const key = scopedEntryKey(monitorScope, entry, plant)
        const label =
          monitorScope === 'all' ?
            `${plant === 'san_lorenzo' ? 'SL' : 'Ric'} · ${entryLabel(entry)}`
          : entryLabel(entry)
        return buildLiveSectorSummary(
          key,
          label,
          entrySectorCodes(entry),
          entryDevices(entry),
          plantEvents,
          plantAlertsForView
        )
      }),
    [sectorRows, monitorScope, plantEvents, plantAlertsForView]
  )

  useEffect(() => {
    if (selectedSectorKey !== null) return
    if (sectorsAgg.length === 0) return
    setSelectedSectorKey(sectorsAgg[0]!.key)
  }, [sectorsAgg, selectedSectorKey])

  const selectedRow = useMemo(
    () => (selectedSectorKey ? findLiveSectorEntryForScope(monitorScope, selectedSectorKey) : undefined),
    [selectedSectorKey, monitorScope]
  )

  const selectedEntry = selectedRow?.entry

  const selectedSectorCodes = useMemo(
    () => (selectedEntry ? entrySectorCodes(selectedEntry) : []),
    [selectedEntry]
  )

  const selectedDevices = useMemo(() => {
    if (!selectedEntry) return []
    const fromCatalog = entryDevices(selectedEntry)
    const seen = new Set(fromCatalog)
    for (const e of plantEvents) {
      if (selectedSectorCodes.includes(e.sectorCode.trim()) && e.deviceCode.trim()) {
        seen.add(e.deviceCode.trim())
      }
    }
    for (const a of plantAlertsForView) {
      if (selectedSectorCodes.includes((a.sectorCode || '').trim()) && a.deviceCode?.trim()) {
        seen.add(a.deviceCode.trim())
      }
    }
    return [...seen].sort()
  }, [selectedEntry, selectedSectorCodes, plantEvents, plantAlertsForView])

  const cameraRows = useMemo(() => {
    if (!selectedEntry) return []
    return selectedDevices.map((dev) =>
      buildLiveCameraRow(plantEvents, plantAlertsForView, dev, selectedSectorCodes)
    )
  }, [selectedDevices, selectedEntry, selectedSectorCodes, plantEvents, plantAlertsForView])

  useEffect(() => {
    if (cameraRows.length === 0) {
      setSelectedDeviceCode(null)
      return
    }
    if (!selectedDeviceCode || !cameraRows.some((c) => c.deviceCode === selectedDeviceCode)) {
      const best = [...cameraRows].sort(
        (a, b) => b.eventCount - a.eventCount || a.deviceCode.localeCompare(b.deviceCode)
      )[0]
      setSelectedDeviceCode(best!.deviceCode)
    }
  }, [cameraRows, selectedDeviceCode])

  const selectedCameraEvents = useMemo(() => {
    if (!selectedDeviceCode) return []
    const codes = new Set(selectedSectorCodes)
    return plantEvents
      .filter((e) => e.deviceCode === selectedDeviceCode && codes.has(e.sectorCode.trim()))
      .sort((a, b) => parseLiveMillis(getEventLiveInstantIso(b)) - parseLiveMillis(getEventLiveInstantIso(a)))
  }, [plantEvents, selectedDeviceCode, selectedSectorCodes])

  const selectedCameraAlerts = useMemo(() => {
    if (!selectedDeviceCode) return []
    const codes = new Set(selectedSectorCodes)
    return plantAlerts
      .filter(
        (a) =>
          a.deviceCode === selectedDeviceCode &&
          codes.has((a.sectorCode || '').trim()) &&
          !isLprMalfunctionAlert(a)
      )
      .sort((a, b) => parseLiveMillis(b.occurredAt) - parseLiveMillis(a.occurredAt))
  }, [plantAlerts, selectedDeviceCode, selectedSectorCodes])

  const selectedCameraLprmAlerts = useMemo(() => {
    if (!selectedDeviceCode) return []
    const codes = new Set(selectedSectorCodes)
    return plantAlerts
      .filter(
        (a) =>
          a.deviceCode === selectedDeviceCode &&
          codes.has((a.sectorCode || '').trim()) &&
          isLprMalfunctionAlert(a)
      )
      .sort((a, b) => parseLiveMillis(b.occurredAt) - parseLiveMillis(a.occurredAt))
  }, [plantAlerts, selectedDeviceCode, selectedSectorCodes])

  const selectedDetections = useMemo(() => {
    if (!selectedDeviceCode) return []
    return buildLiveDetections(plantEvents, plantAlertsForView, selectedDeviceCode, selectedSectorCodes)
  }, [plantEvents, plantAlertsForView, selectedDeviceCode, selectedSectorCodes])

  const exportScope = useMemo(() => {
    if (!uiWindow || !selectedEntry || !selectedDeviceCode) return null
    return {
      siteId,
      sectorKey: entryKey(selectedEntry),
      sectorLabel: entryLabel(selectedEntry),
      sectorCodes: selectedSectorCodes,
      deviceCode: selectedDeviceCode,
      window: uiWindow,
      filters: {
        plate: filterPlate.trim(),
        journeyUuid: filterJourneyUuid.trim(),
        hideLprMalfunction,
      },
    }
  }, [uiWindow, selectedEntry, selectedDeviceCode, siteId, selectedSectorCodes, filterPlate, filterJourneyUuid, hideLprMalfunction])

  const exportSelectedCamera = useCallback(
    (format: 'json' | 'csv') => {
      if (!exportScope) return
      const payload = buildLiveCameraExportPayload(
        exportScope,
        selectedCameraEvents,
        selectedCameraAlerts,
        selectedDetections
      )
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const base = `camara_${exportScope.deviceCode}_${exportScope.window.timeMode}_${stamp}`
      if (format === 'json') {
        downloadTextFile(`${base}.json`, liveCameraExportJson(payload), 'application/json;charset=utf-8')
      } else {
        downloadTextFile(`${base}.csv`, liveCameraExportCsv(payload), 'text/csv;charset=utf-8')
      }
    },
    [exportScope, selectedCameraAlerts, selectedCameraEvents, selectedDetections]
  )

  const rangeLabel = uiWindow?.rangeLabel ?? ''
  const sectorShortTitle = selectedEntry ? entryLabel(selectedEntry) : '—'
  const selectedCameraRow = cameraRows.find((c) => c.deviceCode === selectedDeviceCode)

  const detectionColumns: LiveTableColumn<LiveDetectionRow>[] = useMemo(() => {
    const cols: LiveTableColumn<LiveDetectionRow>[] = [
      {
        id: 'at',
        header: 'Hora',
        className: 'whitespace-nowrap font-mono text-[10px] text-slate-400',
        cell: (d) => fmtShort(d.at),
      },
      {
        id: 'kind',
        header: 'Resultado',
        cell: (d) => {
          const badge = badgeForKind(d.kind)
          return (
            <span className={`inline-flex rounded px-2 py-0.5 text-[9px] font-bold uppercase ring-1 ${badge.className}`}>
              {badge.label}
            </span>
          )
        },
      },
      {
        id: 'plate',
        header: 'Patente',
        className: 'font-mono text-xs font-semibold text-white',
        cell: (d) => d.plate || '—',
      },
    ]

    if (showCircuitClassColumn) {
      cols.push({
        id: 'circuitClass',
        header: 'Porción torta',
        className: 'max-w-[160px]',
        cell: (d) => {
          const entry = resolveClassificationForLiveRow(circuitClassIndex, d.journeyUid, d.plate)
          if (!entry) return <span className="text-slate-500">—</span>
          return <CircuitClassBadge entry={entry} />
        },
      })
    }

    cols.push(
      {
        id: 'eventType',
        header: 'Evento',
        cell: (d) => d.eventType || '—',
      },
      {
        id: 'alertCode',
        header: 'Alerta',
        cell: (d) => d.alertCode || '—',
      },
      {
        id: 'journey',
        header: 'Journey',
        className: 'font-mono text-[10px] text-slate-500',
        cell: (d) => (d.journeyUid ? truncateMiddle(d.journeyUid, 18) : '—'),
      }
    )

    return cols
  }, [circuitClassIndex, showCircuitClassColumn])

  const eventColumns: LiveTableColumn<RealJourneyEventDto>[] = useMemo(
    () => [
      {
        id: 'at',
        header: 'Hora',
        className: 'whitespace-nowrap font-mono text-[10px] text-slate-400',
        cell: (e) => fmtShort(getEventLiveInstantIso(e)),
      },
      {
        id: 'plate',
        header: 'Patente',
        className: 'font-mono text-xs font-semibold text-white',
        cell: (e) => e.truckPlate || e.normalizedPlate || '—',
      },
      {
        id: 'type',
        header: 'Tipo',
        cell: (e) => e.eventType || e.eventCategory || '—',
      },
      {
        id: 'level',
        header: 'Nivel',
        className: 'text-right font-mono',
        cell: (e) => <span className={alertLevelClass(e.alertLevel)}>{e.alertLevel}</span>,
      },
      {
        id: 'journey',
        header: 'Journey',
        className: 'font-mono text-[10px] text-slate-500',
        cell: (e) => (e.journeyUid ? truncateMiddle(e.journeyUid, 18) : '—'),
      },
      {
        id: 'seq',
        header: 'Seq',
        className: 'text-right font-mono text-slate-500',
        cell: (e) => e.sequenceNumber,
      },
    ],
    []
  )

  const alertColumns: LiveTableColumn<NormalizedRealAlertView>[] = useMemo(
    () => [
      {
        id: 'at',
        header: 'Hora',
        className: 'whitespace-nowrap font-mono text-[10px] text-slate-400',
        cell: (a) => fmtShort(a.occurredAt),
      },
      {
        id: 'plate',
        header: 'Patente',
        className: 'font-mono text-xs font-semibold text-white',
        cell: (a) => a.rawPlate || a.normalizedPlate || '—',
      },
      {
        id: 'code',
        header: 'Código',
        cell: (a) => a.alertCode || a.alertType || '—',
      },
      {
        id: 'level',
        header: 'Nivel',
        className: 'text-right font-mono',
        cell: (a) => <span className={alertLevelClass(a.alertLevel)}>{a.alertLevel}</span>,
      },
      {
        id: 'detail',
        header: 'Detalle',
        className: 'max-w-[280px] truncate text-slate-400',
        cell: (a) => a.description || a.message || a.reason || '—',
      },
      {
        id: 'journey',
        header: 'Journey',
        className: 'font-mono text-[10px] text-slate-500',
        cell: (a) => (a.journeyUid ? truncateMiddle(a.journeyUid, 18) : '—'),
      },
    ],
    []
  )

  const detailTabCounts = {
    actividad: selectedDetections.length,
    eventos: selectedCameraEvents.length,
    alertas: selectedCameraAlerts.length,
    lprm: selectedCameraLprmAlerts.length,
  }

  const tableScrollClass =
    timeMode === 'calendar_day' ? 'max-h-[min(78vh,960px)]' : 'max-h-[min(52vh,480px)]'

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-[#0b1020] text-slate-100 shadow-xl ring-1 ring-white/5">
      <header className="flex flex-col gap-4 border-b border-slate-800/90 bg-[#080d18] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400/90">Truckflow</p>
          <h2 className="mt-0.5 text-lg font-bold tracking-tight text-white sm:text-xl">Consola operativa · En vivo</h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            API · <span className="font-mono text-cyan-200/80">{apiOriginLabel}</span>
            {rangeLabel ? <> · Ventana <span className="text-slate-300">{rangeLabel}</span></> : null}
            {' · '}
            Planta global: <span className="text-slate-300">{siteId === 'san_lorenzo' ? 'San Lorenzo' : siteId === 'avellaneda' ? 'Avellaneda' : 'Ricardone'}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${
              error ? 'bg-rose-500/15 text-rose-300 ring-rose-500/40' : loading ? 'bg-amber-500/15 text-amber-200 ring-amber-400/35' : 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/35'
            }`}
          >
            {error ? 'Error' : loading ? 'Sincronizando…' : 'Nominal'}
          </span>
        </div>
      </header>

      <div className="border-b border-slate-800/80 bg-[#0c1222] px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <div className="min-w-[160px]">
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-slate-500">Planta en consola</label>
            <select
              value={monitorScope}
              onChange={(e) => {
                setMonitorScope(e.target.value as LiveMonitorScope)
                setSelectedSectorKey(null)
                setSelectedDeviceCode(null)
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-slate-100"
            >
              <option value="all">Ricardone + San Lorenzo</option>
              <option value="ricardone">Solo Ricardone</option>
              <option value="san_lorenzo">Solo San Lorenzo</option>
            </select>
          </div>
          <div className="min-w-[200px]">
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-slate-500">Vista temporal</label>
            <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
              <button
                type="button"
                onClick={() => setTimeMode('rolling_hour')}
                className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold ${timeMode === 'rolling_hour' ? 'bg-cyan-500/25 text-cyan-100' : 'text-slate-500'}`}
              >
                Última hora
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoRefresh(false)
                  setTimeMode('calendar_day')
                }}
                className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold ${timeMode === 'calendar_day' ? 'bg-violet-500/25 text-violet-100' : 'text-slate-500'}`}
              >
                Día completo
              </button>
            </div>
          </div>
          {timeMode === 'calendar_day' ? (
            <>
              <div className="min-w-[140px]">
                <label className="mb-1 block text-[9px] font-medium uppercase text-slate-500">Día</label>
                <input
                  type="date"
                  value={calendarDay}
                  onChange={(e) => setCalendarDay(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-[11px] text-slate-100"
                />
              </div>
              <div className="min-w-[110px]">
                <label className="mb-1 block text-[9px] font-medium uppercase text-slate-500">Desde hora</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="00:00"
                  maxLength={5}
                  value={dayTimeStart}
                  onChange={(e) => setDayTimeStart(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-[11px] text-slate-100"
                />
              </div>
              <div className="min-w-[110px]">
                <label className="mb-1 block text-[9px] font-medium uppercase text-slate-500">Hasta hora</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="23:59"
                  maxLength={5}
                  value={dayTimeEnd}
                  onChange={(e) => setDayTimeEnd(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-[11px] text-slate-100"
                />
              </div>
            </>
          ) : null}
          <div className="min-w-[120px] flex-1">
            <label className="mb-1 block text-[9px] font-medium uppercase text-slate-500">Patente</label>
            <input
              value={filterPlate}
              onChange={(e) => setFilterPlate(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-[11px] text-slate-100"
              placeholder="Ej. AB123CD"
            />
          </div>
          <div className="min-w-[160px] flex-[1.25]">
            <label className="mb-1 block text-[9px] font-medium uppercase text-slate-500">Journey ID</label>
            <input
              value={filterJourneyUuid}
              onChange={(e) => setFilterJourneyUuid(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-[10px] text-slate-100"
              placeholder="UUID"
            />
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 disabled:opacity-40"
          >
            Actualizar
          </button>
          <label className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] ${timeMode === 'calendar_day' ? 'border-slate-800 text-slate-600' : 'border-slate-700 text-slate-400'}`}>
            <input
              type="checkbox"
              checked={autoRefresh && timeMode === 'rolling_hour'}
              disabled={timeMode === 'calendar_day'}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto 30s
          </label>
          <label className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-100/90">
            <input
              type="checkbox"
              checked={hideLprMalfunction}
              onChange={(e) => setHideLprMalfunction(e.target.checked)}
            />
            Ocultar LPR_MALFUNCTION
          </label>
        </div>
        {hideLprMalfunction && lprMalfunctionCount > 0 ? (
          <p className="mt-2 text-[10px] text-amber-200/80">
            {lprMalfunctionCount} alertas LPR_MALFUNCTION separadas en pestaña LPRM (ruido OCR frecuente 00–04 h, sin patente válida). La API no envía{' '}
            <span className="font-mono">occurredAt</span> en alertas — usamos <span className="font-mono">createdAt</span>.
          </p>
        ) : null}
        {error ? <div className="mt-3 rounded-lg border border-rose-500/35 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">{error}</div> : null}
      </div>

      <div className="grid gap-0 xl:grid-cols-12">
        <aside className="border-slate-800 xl:col-span-2 xl:border-r">
          <div className="border-b border-slate-800 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sectores</p>
          </div>
          <div className="flex max-h-[min(70vh,560px)] flex-col gap-1.5 overflow-auto p-2">
            {sectorsAgg.map((s) => {
              const active = selectedSectorKey === s.key
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setSelectedSectorKey(s.key)
                    setSelectedDeviceCode(null)
                    setDetailTab('actividad')
                  }}
                  className={`rounded-lg border px-2.5 py-2 text-left transition ${
                    active ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-800 bg-slate-900/40 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[11px] font-bold uppercase leading-tight text-slate-200">{s.label}</span>
                    <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase ring-1 ${sectorStatusClass(s.status)}`}>
                      {sectorStatusLabel(s.status)}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1 text-center font-mono text-[9px]">
                    <span className="rounded bg-slate-950/80 py-0.5">CAM {String(s.cameraCount).padStart(2, '0')}</span>
                    <span className="rounded bg-slate-950/80 py-0.5 text-emerald-300/90">E {String(s.eventCount).padStart(2, '0')}</span>
                    <span className="rounded bg-slate-950/80 py-0.5 text-amber-300/90">A {String(s.alertCount).padStart(2, '0')}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <main className="xl:col-span-10">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cámaras</p>
              <p className="text-xs text-slate-300">
                {sectorShortTitle}
                {selectedDeviceCode ? (
                  <>
                    <span className="mx-1.5 text-slate-600">›</span>
                    <span className="font-mono text-cyan-300">{selectedDeviceCode}</span>
                  </>
                ) : null}
              </p>
            </div>
            {selectedEntry ? (
              <p className="text-[10px] text-slate-500">
                {cameraRows.length} cámara{cameraRows.length === 1 ? '' : 's'} · ventana {rangeLabel || '—'}
              </p>
            ) : null}
          </div>

          <div className="grid gap-0 lg:grid-cols-[minmax(240px,280px)_1fr]">
            <div className="border-b border-slate-800 lg:border-b-0 lg:border-r">
              <div className="border-b border-slate-800/80 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Streams del sector</p>
              </div>
              <div className="flex max-h-[min(70vh,560px)] flex-col gap-1 overflow-auto p-2">
                {!selectedEntry ? (
                  <p className="px-2 py-4 text-sm text-slate-500">Elegí un sector.</p>
                ) : cameraRows.length === 0 ? (
                  <p className="px-2 py-4 text-sm text-amber-100/90">Sin cámaras en este sector.</p>
                ) : (
                  cameraRows.map((cam) => {
                    const selected = selectedDeviceCode === cam.deviceCode
                    const badge = badgeForKind(cam.liveResultado)
                    return (
                      <button
                        key={cam.deviceCode}
                        type="button"
                        onClick={() => {
                          setSelectedDeviceCode(cam.deviceCode)
                          setDetailTab('actividad')
                        }}
                        className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                          selected
                            ? 'border-cyan-400/55 bg-cyan-500/10 shadow-[inset_2px_0_0_0_rgba(34,211,238,0.7)]'
                            : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-[11px] font-bold text-cyan-300">{cam.deviceCode}</span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ring-1 ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-baseline justify-between gap-2">
                          <span className="truncate font-mono text-sm font-bold text-white">{cam.displayPlate}</span>
                          <span className="shrink-0 font-mono text-[9px] text-slate-500">
                            {cam.lastDetectionAt ? fmtShort(cam.lastDetectionAt) : '—'}
                          </span>
                        </div>
                        <div className="mt-1.5 flex gap-2 font-mono text-[9px]">
                          <span className="rounded bg-slate-900/80 px-1.5 py-0.5 text-emerald-300/90">
                            EVT {cam.eventCount}
                          </span>
                          <span className="rounded bg-slate-900/80 px-1.5 py-0.5 text-amber-300/90">
                            ALT {cam.alertCount}
                          </span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="min-w-0 p-3 sm:p-4">
              {!selectedDeviceCode ? (
                <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-700/80 bg-slate-950/20 px-6 text-center text-sm text-slate-500">
                  Seleccioná una cámara para ver actividad, eventos y alertas del período filtrado.
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-950/40">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-500">Detalle operativo</p>
                      <p className="mt-0.5 font-mono text-sm font-bold text-cyan-200">{selectedDeviceCode}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {sectorDisplayName(selectedCameraRow?.sectorCode || selectedSectorCodes[0] || '')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => exportSelectedCamera('json')}
                        disabled={!exportScope}
                        className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-bold text-cyan-100 disabled:opacity-40"
                      >
                        Exportar JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => exportSelectedCamera('csv')}
                        disabled={!exportScope}
                        className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-slate-100 disabled:opacity-40"
                      >
                        Exportar CSV
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 border-b border-slate-800 px-3 py-2">
                    {(
                      [
                        ['actividad', 'Actividad'],
                        ['eventos', 'Eventos'],
                        ['alertas', 'Alertas'],
                        ['lprm', 'LPRM'],
                      ] as const
                    ).map(([id, label]) => {
                      const active = detailTab === id
                      const count = detailTabCounts[id]
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setDetailTab(id)}
                          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                            active
                              ? 'bg-slate-800 text-white ring-1 ring-slate-600'
                              : 'text-slate-500 hover:bg-slate-900/70 hover:text-slate-300'
                          }`}
                        >
                          {label}
                          <span className={`ml-1.5 font-mono text-[10px] ${active ? 'text-cyan-300' : 'text-slate-600'}`}>
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="p-3 sm:p-4">
                    <p className="mb-3 text-[10px] text-slate-500">
                      Mostrando <span className="text-slate-300">{selectedDeviceCode}</span> en{' '}
                      <span className="text-slate-300">{rangeLabel || 'la ventana activa'}</span>.
                      {detailTab === 'actividad' && hideLprMalfunction ? ' LPR_MALFUNCTION en pestaña LPRM.' : ''}
                      {detailTab === 'actividad' ? (
                        <> · <span className="font-mono text-slate-400">{detailTabCounts.actividad} filas</span></>
                      ) : detailTab === 'eventos' ? (
                        <> · <span className="font-mono text-slate-400">{detailTabCounts.eventos} eventos</span></>
                      ) : detailTab === 'alertas' ? (
                        <> · <span className="font-mono text-slate-400">{detailTabCounts.alertas} alertas</span></>
                      ) : (
                        <> · <span className="font-mono text-slate-400">{detailTabCounts.lprm} LPR_MALFUNCTION</span></>
                      )}
                    </p>

                    {timeMode === 'calendar_day' && detailTab === 'actividad' ?
                      showCircuitClassColumn ?
                        <p className="mb-3 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[10px] text-violet-100">
                          Columna <strong>Porción torta</strong>: clasificación del journey según el último Transform ETL en memoria.
                        </p>
                      : <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-100">
                          Ejecutá <strong>Transform</strong> en el ETL (mismo período) para ver la porción de torta por patente.
                        </p>
                    : null}

                    {detailTab === 'actividad' ? (
                      <LiveScrollTable
                        rows={selectedDetections}
                        columns={detectionColumns}
                        rowKey={(d) => d.key}
                        emptyMessage="Sin actividad en esta franja para esta cámara."
                        maxHeightClass={tableScrollClass}
                      />
                    ) : null}

                    {detailTab === 'eventos' ? (
                      <LiveScrollTable
                        rows={selectedCameraEvents}
                        columns={eventColumns}
                        rowKey={(e) => `${e.id}-${e.sequenceNumber}`}
                        emptyMessage="Sin eventos en esta franja para esta cámara."
                        maxHeightClass={tableScrollClass}
                      />
                    ) : null}

                    {detailTab === 'alertas' ? (
                      <LiveScrollTable
                        rows={selectedCameraAlerts}
                        columns={alertColumns}
                        rowKey={(a) => a.alertId}
                        emptyMessage="Sin alertas en esta franja para esta cámara."
                        maxHeightClass={tableScrollClass}
                      />
                    ) : null}

                    {detailTab === 'lprm' ? (
                      <LiveScrollTable
                        rows={selectedCameraLprmAlerts}
                        columns={alertColumns}
                        rowKey={(a) => a.alertId}
                        emptyMessage="Sin LPR_MALFUNCTION en esta franja para esta cámara."
                        maxHeightClass={tableScrollClass}
                      />
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <details className="border-t border-slate-800 bg-[#0a1020] px-4 py-3 sm:px-6">
        <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-teal-300/90">
          Diagnóstico API · sectorCode · deviceCode (Truckflow crudo)
        </summary>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          Conteo de la ventana actual según lo que devolvió{' '}
          <span className="font-mono text-slate-300">/journey-event/list</span> y{' '}
          <span className="font-mono text-slate-300">/alert/list</span>, antes de agrupar por catálogo.
          Si acá solo aparece ingreso SL, el origen es Truckflow — no un filtro del dashboard.
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase text-slate-500">
              San Lorenzo ({slApiFeedBreakdown.length} pares)
            </p>
            {slApiFeedBreakdown.length === 0 ?
              <p className="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-xs text-slate-500">
                Sin filas SL en esta ventana.
              </p>
            : <div className="max-h-48 overflow-auto rounded-lg border border-slate-800">
                <table className="min-w-full text-left text-[10px]">
                  <thead className="sticky top-0 bg-[#0a1020] text-[9px] uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5">sectorCode</th>
                      <th className="px-2 py-1.5">deviceCode</th>
                      <th className="px-2 py-1.5 text-right">E</th>
                      <th className="px-2 py-1.5 text-right">A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slApiFeedBreakdown.map((r) => (
                      <tr key={`${r.sectorCode}-${r.deviceCode}`} className="border-t border-slate-800/80">
                        <td className="px-2 py-1 font-mono text-cyan-100/90">{r.sectorCode}</td>
                        <td className="px-2 py-1 font-mono text-slate-300">{r.deviceCode}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-emerald-300">{r.eventCount}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-amber-200">{r.alertCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase text-slate-500">
              Toda la planta en consola ({apiFeedBreakdown.length} pares · E {plantEvents.length} · A {plantAlerts.length})
            </p>
            <div className="max-h-48 overflow-auto rounded-lg border border-slate-800">
              <table className="min-w-full text-left text-[10px]">
                <thead className="sticky top-0 bg-[#0a1020] text-[9px] uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5">sectorCode</th>
                    <th className="px-2 py-1.5">deviceCode</th>
                    <th className="px-2 py-1.5 text-right">E</th>
                    <th className="px-2 py-1.5 text-right">A</th>
                  </tr>
                </thead>
                <tbody>
                  {apiFeedBreakdown.slice(0, 40).map((r) => (
                    <tr key={`all-${r.sectorCode}-${r.deviceCode}`} className="border-t border-slate-800/80">
                      <td className="px-2 py-1 font-mono text-slate-400">{r.sectorCode}</td>
                      <td className="px-2 py-1 font-mono text-slate-500">{r.deviceCode}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-slate-300">{r.eventCount}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-slate-400">{r.alertCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {apiFeedBreakdown.length > 40 ?
              <p className="mt-1 text-[10px] text-slate-600">Mostrando top 40 de {apiFeedBreakdown.length} pares.</p>
            : null}
          </div>
        </div>
      </details>
    </section>
  )
})
