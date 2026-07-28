import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import type { RealAlertDto } from '../../../services/realTruckflowApi'
import { useEtlWorkbenchOptional, type EtlDiskPeriod } from '../etlWorkbench/EtlWorkbenchContext'
import {
  buildExcelCameraComparativaReport,
  parseMovimientosFromNormalizedCsv,
  type ExcelCameraComparativaReport,
} from '../etlWorkbench/excelCameraComparativaWorkbench'
import { RAW_AUDIT_CIRCUIT_CODES } from '../etlWorkbench/auditExcelCameraMatrix'
import {
  cameraCalibrationAggregatesToCsv,
  cameraCalibrationDetailToCsv,
} from '../etlWorkbench/auditExcelCameraCalibration'
import {
  missedPlatesByCameraToCsv,
} from '../etlWorkbench/auditExcelCameraMissedPlates'
import { TURNOS_OPERATIVOS, turnoLabel } from '../etlWorkbench/operationalTurno'
import {
  buildCalibrationDashboardModel,
  captureEstadoFromPct,
  deviceOperativoLabel,
  hitoOperativoLabel,
  periodLabelFromReport,
  type CaptureEstado,
} from '../etlWorkbench/cameraCalibrationDashboardModel'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'
import { yieldToBrowser } from '../../../utils/yieldToBrowser'

const BG = '#F7F8FA'
const BORDER = '#E6E8EF'
const GREEN = '#16a34a'
const GREEN_LIGHT = '#dcfce7'
const RED_LIGHT = '#fecaca'
const AMBER = '#d97706'
const RED = '#dc2626'
const BLUE = '#2563eb'

type Props = {
  events: RealJourneyEventDto[]
  alerts?: RealAlertDto[]
  normalizedMovimientosCsv: string | undefined
  diskPeriod: EtlDiskPeriod | null
  excelTotalMovimientos?: number
  manual?: boolean
  disabled?: boolean
}

export function ExcelCameraComparativaPanel({
  events,
  alerts,
  normalizedMovimientosCsv,
  diskPeriod,
  excelTotalMovimientos,
  manual = false,
  disabled,
}: Props) {
  const wb = useEtlWorkbenchOptional()
  const [circuit, setCircuit] = useState<string>('R7')
  const [missedDeviceFilter, setMissedDeviceFilter] = useState<string>('all')
  const [report, setReport] = useState<ExcelCameraComparativaReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputKey = `${normalizedMovimientosCsv?.length ?? 0}|${events.length}|${diskPeriod?.startDate ?? ''}|${diskPeriod?.endDate ?? ''}`

  useEffect(() => {
    if (manual) {
      setReport(null)
      setError(null)
    }
  }, [manual, inputKey])

  const autoReport = useMemo(() => {
    if (manual) return null
    const csv = normalizedMovimientosCsv?.trim()
    if (!csv || events.length === 0) return null
    const movimientos = parseMovimientosFromNormalizedCsv(csv)
    if (!movimientos.length) return null
    return buildExcelCameraComparativaReport({
      movimientos,
      events,
      alerts,
      fromDay: diskPeriod?.startDate,
      toDay: diskPeriod?.endDate,
    })
  }, [manual, normalizedMovimientosCsv, events, alerts, diskPeriod?.startDate, diskPeriod?.endDate])

  const effectiveReport = manual ? report : autoReport

  const runComparativa = useCallback(async () => {
    const csv = normalizedMovimientosCsv?.trim()
    if (!csv || events.length === 0) {
      setError('Faltan eventos Truckflow o CSV de movimientos normalizados.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await yieldToBrowser()
      const movimientos = parseMovimientosFromNormalizedCsv(csv)
      if (!movimientos.length) {
        setError('El CSV normalizado no tiene filas parseables.')
        setReport(null)
        return
      }
      const built = buildExcelCameraComparativaReport({
        movimientos,
        events,
        alerts,
        fromDay: diskPeriod?.startDate,
        toDay: diskPeriod?.endDate,
      })
      setReport(built)
      if (!built.circuits.length) {
        setError('Sin movimientos R1/R5/R6/R7 en el período para comparar.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setReport(null)
    } finally {
      setBusy(false)
    }
  }, [normalizedMovimientosCsv, events, alerts, diskPeriod?.startDate, diskPeriod?.endDate])

  const active =
    effectiveReport?.circuits.find((c) => c.circuitCode === circuit) ?? effectiveReport?.circuits[0]

  const dash = useMemo(
    () => (active ? buildCalibrationDashboardModel(active) : null),
    [active]
  )

  const circuitDepthByCode = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildCalibrationDashboardModel>>()
    for (const c of effectiveReport?.circuits ?? []) {
      map.set(c.circuitCode, buildCalibrationDashboardModel(c))
    }
    return map
  }, [effectiveReport])

  const missedRows = useMemo(() => {
    const all = active?.calibration.missedPlatesByCamera ?? []
    if (missedDeviceFilter === 'all') return all
    return all.filter((r) => r.deviceCode === missedDeviceFilter)
  }, [active, missedDeviceFilter])

  const missedPreview = useMemo(() => missedRows.slice(0, 100), [missedRows])

  const periodLabel = effectiveReport ? periodLabelFromReport(effectiveReport) : '—'

  if (!normalizedMovimientosCsv?.trim()) {
    return (
      <p className="mt-2 text-sm text-slate-600">
        Requiere paso 3 con XLSX Movimientos por contrato (
        <code className="rounded bg-slate-100 px-1 text-xs">external_movimientos_contrato_normalized</code>
        ).
      </p>
    )
  }

  if (!events.length) {
    /*
      Abrir un proceso guardado hidrata las tablas del ETL pero NO los eventos crudos, y la
      calibración los necesita para cruzar lecturas de cámara. Antes esto era un cartel sin
      salida ("cargá el paso 0") aunque los días del período ya estén en disco: acá se ofrece
      cargarlos directamente para el período de la ventana abierta.
    */
    const canLoad = Boolean(wb && diskPeriod?.startDate && diskPeriod?.endDate)
    return (
      <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
        <p className="text-sm text-amber-950">
          La calibración cruza los movimientos de Excel contra las <strong>lecturas crudas</strong>{' '}
          de cámara, que no vienen en el proceso guardado.
          {canLoad ?
            <>
              {' '}
              Los días de {diskPeriod!.startDate} → {diskPeriod!.endDate} están en disco.
            </>
          : ' Cargá un período en el paso 0.'}
        </p>
        {canLoad ?
          <button
            type="button"
            disabled={wb!.busyLoad}
            onClick={() =>
              void (async () => {
                const { startDate, endDate } = diskPeriod!
                // `loadLocalPeriod` hace setTransformResult(null): borra las tablas de la
                // ventana abierta y con eso el panel pierde el CSV de movimientos (el tablero
                // quedaba habilitado pero vacío). Hay que re-hidratar la ventana después,
                // igual que el botón "Cargar período" del paso 0.
                const ok = await wb!.loadLocalPeriod(startDate, endDate)
                if (ok) await wb!.loadWindowOrOffer(startDate, endDate)
              })()
            }
            className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {wb!.busyLoad ? 'Cargando eventos…' : 'Cargar lecturas de cámara del período'}
          </button>
        : null}
      </div>
    )
  }

  if (manual && !effectiveReport) {
    return (
      <div className="mt-2 rounded-xl border p-4" style={{ borderColor: BORDER, background: BG }}>
        <p className="text-sm text-slate-600">
          Generá el tablero para cruzar movimientos Excel con lecturas Truckflow en la ventana operativa.
        </p>
        {error ?
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </p>
        : null}
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void runComparativa()}
          className="mt-3 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45"
          style={{ background: BLUE }}
        >
          {busy ? 'Analizando…' : 'Generar tablero de calibración'}
        </button>
      </div>
    )
  }

  if (!effectiveReport || !effectiveReport.circuits.length || !dash || !active) {
    return (
      <p className="mt-2 text-sm text-slate-600">
        Sin movimientos R1/R5/R6/R7 en el período para calibración.
      </p>
    )
  }

  const excelInPeriod = effectiveReport.periodTotals.totalRowsInRange
  const excelCtgs = effectiveReport.periodTotals.uniqueCtgsInRange
  const alertCount = alerts?.length ?? 0

  return (
    <div
      className="mt-3 space-y-4 rounded-xl border p-4 shadow-sm"
      style={{ background: BG, borderColor: BORDER }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-bold text-slate-900">Calibración de cámaras vs Excel</h4>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-600">
            Comparación entre movimientos esperados por Excel y eventos capturados por TruckFlow
          </p>
          <p className="mt-1 text-xs font-medium" style={{ color: BLUE }}>
            Período: {periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {manual ?
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => void runComparativa()}
              className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              style={{ borderColor: BORDER }}
            >
              Regenerar
            </button>
          : null}
          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            style={{ borderColor: BORDER }}
            onClick={() => {
              triggerBrowserCsvDownload(
                `calibracion_detalle_${active.circuitCode}.csv`,
                cameraCalibrationDetailToCsv(active.calibration.detailRows, active.circuitCode)
              )
            }}
          >
            ↓ Detalle CSV
          </button>
            <button
              type="button"
              className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              style={{ borderColor: BORDER }}
              onClick={() => {
                triggerBrowserCsvDownload(
                  `patentes_no_leidas_${active.circuitCode}.csv`,
                  missedPlatesByCameraToCsv(active.calibration.missedPlatesByCamera)
                )
              }}
            >
              ↓ Patentes no leídas (DSS)
            </button>
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Kpi label="Movimientos Excel" value={excelInPeriod} />
        <Kpi label="CTG únicos Excel" value={excelCtgs} />
        <Kpi label="Eventos TruckFlow" value={effectiveReport.rawEventCount} />
        <Kpi label="Alertas en memoria" value={alertCount} />
        <Kpi label="Camiones circuito" value={dash.excelCamiones} />
        <Kpi
          label="% reconocimiento"
          value={`${dash.reconocimientoPct}%`}
          accent={captureEstadoFromPct(dash.reconocimientoPct)}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {RAW_AUDIT_CIRCUIT_CODES.map((code) => {
          const c = effectiveReport.circuits.find((x) => x.circuitCode === code)
          const n = c?.excelCamiones ?? 0
          const selected = active.circuitCode === code
          const depth = circuitDepthByCode.get(code)?.pointDepth
          return (
            <button
              key={code}
              type="button"
              disabled={n === 0}
              onClick={() => setCircuit(code)}
              className="rounded-xl px-3 py-2.5 text-left transition"
              style={{
                background: selected ? BLUE : '#fff',
                color: selected ? '#fff' : n === 0 ? '#94a3b8' : '#1e293b',
                border: `1px solid ${selected ? BLUE : BORDER}`,
                opacity: n === 0 ? 0.5 : 1,
              }}
            >
              <div className="text-sm font-bold">
                {code} · {n}
              </div>
              {depth ?
                <div
                  className="mt-1.5 space-y-0.5 text-[11px] leading-snug"
                  style={{ color: selected ? 'rgba(255,255,255,0.88)' : '#64748b' }}
                >
                  <div>
                    Todos los puntos:{' '}
                    <span className="font-semibold tabular-nums">{depth.allPoints}</span>
                  </div>
                  <div>
                    Todos excepto descarga:{' '}
                    <span className="font-semibold tabular-nums">{depth.allExceptDescarga}</span>
                  </div>
                  <div>
                    En 3 puntos: <span className="font-semibold tabular-nums">{depth.exactly3Points}</span>
                  </div>
                </div>
              : <div className="mt-1.5 text-[11px]">Sin datos</div>}
            </button>
          )
        })}
      </div>

      <p className="text-sm font-semibold text-slate-800">{dash.circuitSubtitle}</p>

      <Card>
        <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">Lectura automática</h5>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
          {dash.brief.parrafos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Card>

      <Card>
        <h5 className="text-sm font-bold text-slate-900">Captura vs faltante por hito</h5>
        <p className="text-xs text-slate-500">Ordenado por mayor % sin lectura</p>
        <div className="mt-3 h-[max(220px,12rem)] w-full min-w-0" style={{ minHeight: dash.stackedBars.length * 36 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dash.stackedBars}
              layout="vertical"
              margin={{ top: 4, right: 56, left: 8, bottom: 4 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fontSize: 12, fill: '#334155' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  value,
                  name === 'capturados' ? 'Capturados' : 'Sin lectura',
                ]}
              />
              <Bar dataKey="capturados" stackId="a" fill={GREEN} radius={[0, 0, 0, 0]} />
              <Bar dataKey="sinLectura" stackId="a" fill={RED_LIGHT} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 space-y-1">
          {dash.stackedBars.map((row) => (
            <div key={row.hito} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="w-[140px] shrink-0 truncate font-medium text-slate-800">{row.name}</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${row.porcentajeCaptura}%`,
                    background: GREEN,
                  }}
                />
              </div>
              <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-slate-900">
                {row.porcentajeCaptura}%
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h5 className="text-sm font-bold text-slate-900">Estado de captura por hito</h5>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-slate-500" style={{ borderColor: BORDER }}>
                <th className="py-2 pr-3 font-semibold">Hito</th>
                <th className="py-2 pr-3 font-semibold">Capturados</th>
                <th className="py-2 pr-3 font-semibold">Total Excel</th>
                <th className="py-2 pr-3 font-semibold">% Captura</th>
                <th className="py-2 pr-3 font-semibold">Sin lectura</th>
                <th className="py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {dash.hitoRows.map((row) => (
                <tr key={row.hito} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-medium text-slate-900" title={row.logicalCode}>
                    {row.hitoLabel}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{row.capturados}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.totalExcel}</td>
                  <td className="py-2 pr-3 tabular-nums font-semibold">{row.porcentajeCaptura}%</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-600">{row.sinLectura}</td>
                  <td className="py-2">
                    <EstadoBadge estado={row.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section>
        <h5 className="text-sm font-bold text-slate-900">Por turno operativo</h5>
        <p className="mt-1 text-xs text-slate-500">Ventanas hora Argentina: 02–08, 08–14, 14–20, 20–02</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {dash.turnoCards.map((card, i) => (
            <TurnoCard
              key={card.turno}
              data={card}
              accent={[AMBER, BLUE, GREEN, '#7c3aed'][i % 4]!}
            />
          ))}
        </div>
        <Card className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-slate-500" style={{ borderColor: BORDER }}>
                <th className="py-2 pr-2">Hito</th>
                {TURNOS_OPERATIVOS.map((t) => (
                  <th key={t} className="py-2 pr-2 whitespace-nowrap">
                    {turnoLabel(t)} %
                  </th>
                ))}
                <th className="py-2 pr-2">Peor turno</th>
                <th className="py-2">Diagnóstico</th>
              </tr>
            </thead>
            <tbody>
              {dash.hitoTurnoCompare.map((r) => (
                <tr key={r.hito} className="border-b border-slate-100">
                  <td className="py-2 pr-2 font-medium">{r.hitoLabel}</td>
                  {TURNOS_OPERATIVOS.map((t) => (
                    <td key={t} className="py-2 pr-2 tabular-nums">
                      {r.pctByTurno[t] != null ? `${r.pctByTurno[t]}%` : '—'}
                    </td>
                  ))}
                  <td className="py-2 pr-2 tabular-nums">
                    {r.peorTurno} ({r.peorTurnoPct}%)
                  </td>
                  <td className="py-2 text-slate-700">{r.diagnostico}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <Card>
        <h5 className="text-sm font-bold text-slate-900">Top problemas de calibración</h5>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-slate-500" style={{ borderColor: BORDER }}>
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Hito</th>
                <th className="py-2 pr-2">Cámara</th>
                <th className="py-2 pr-2">Turno</th>
                <th className="py-2 pr-2">Faltantes</th>
                <th className="py-2 pr-2">% sin lectura</th>
                <th className="py-2">Acción sugerida</th>
              </tr>
            </thead>
            <tbody>
              {dash.topProblems.length === 0 ?
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-500">
                    Sin combinaciones críticas en este circuito.
                  </td>
                </tr>
              : dash.topProblems.map((p) => (
                  <tr key={`${p.prioridad}-${p.hito}-${p.camara}-${p.turno}`} className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-bold tabular-nums">{p.prioridad}</td>
                    <td className="py-2 pr-2" title={p.hito}>
                      {p.hitoLabel}
                    </td>
                    <td className="py-2 pr-2" title={p.camara}>
                      {p.camaraLabel}
                    </td>
                    <td className="py-2 pr-2">{p.turnoLabel}</td>
                    <td className="py-2 pr-2 tabular-nums">{p.faltantes}</td>
                    <td className="py-2 pr-2 tabular-nums font-semibold text-red-700">{p.pctSinLectura}%</td>
                    <td className="py-2 text-slate-700">{p.accionSugerida}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h5 className="text-sm font-bold text-slate-900">Casos para DSS · patentes no leídas</h5>
            <p className="mt-1 max-w-2xl text-xs text-slate-600">
              Camiones en Excel sin captura en un hito, desglosado por cámara que debería cubrir ese punto.
              Usá CTG, patente y ventana ingreso/egreso para buscar en DSS.{' '}
              <strong>sin_evento_en_ventana</strong> = la cámara no registró nada;{' '}
              <strong>lectura_sin_hito</strong> = hubo eventos pero no clasificaron al hito (OCR/ángulo).
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            style={{ borderColor: BORDER }}
            onClick={() => {
              const rows =
                missedDeviceFilter === 'all' ?
                  active.calibration.missedPlatesByCamera
                : missedRows
              triggerBrowserCsvDownload(
                `patentes_no_leidas_${active.circuitCode}_${missedDeviceFilter === 'all' ? 'todas' : missedDeviceFilter}.csv`,
                missedPlatesByCameraToCsv(rows)
              )
            }}
          >
            ↓ CSV {missedDeviceFilter === 'all' ? 'completo' : 'cámara filtrada'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setMissedDeviceFilter('all')}
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              background: missedDeviceFilter === 'all' ? BLUE : '#fff',
              color: missedDeviceFilter === 'all' ? '#fff' : '#334155',
              border: `1px solid ${BORDER}`,
            }}
          >
            Todas las cámaras ({active.calibration.missedPlatesByCamera.length})
          </button>
          {dash.missedByDevice.slice(0, 12).map((d) => (
            <button
              key={d.deviceCode}
              type="button"
              title={d.deviceCode}
              onClick={() => setMissedDeviceFilter(d.deviceCode)}
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                background: missedDeviceFilter === d.deviceCode ? BLUE : '#fff',
                color: missedDeviceFilter === d.deviceCode ? '#fff' : '#334155',
                border: `1px solid ${BORDER}`,
              }}
            >
              {d.deviceLabel} · {d.uniquePlates}
            </button>
          ))}
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b text-[10px] uppercase text-slate-500" style={{ borderColor: BORDER }}>
                <th className="py-2 pr-2">Cámara</th>
                <th className="py-2 pr-2">Hito</th>
                <th className="py-2 pr-2">Patente</th>
                <th className="py-2 pr-2">CTG</th>
                <th className="py-2 pr-2">Turno</th>
                <th className="py-2 pr-2">Motivo</th>
                <th className="py-2 pr-2">Ingreso Excel</th>
                <th className="py-2 pr-2">Egreso Excel</th>
                <th className="py-2">Hitos OK</th>
              </tr>
            </thead>
            <tbody>
              {missedPreview.length === 0 ?
                <tr>
                  <td colSpan={9} className="py-4 text-center text-slate-500">
                    Sin faltantes para este filtro.
                  </td>
                </tr>
              : missedPreview.map((r) => (
                  <tr key={`${r.deviceCode}-${r.ctg}-${r.stepKey}-${r.patente}`} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2" title={r.deviceCode}>
                      {deviceOperativoLabel(r.deviceCode)}
                    </td>
                    <td className="py-1.5 pr-2" title={r.logicalCode}>
                      {hitoOperativoLabel(r.stepKey, r.hitoHeader)}
                    </td>
                    <td className="py-1.5 pr-2 font-mono font-semibold">{r.patente}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{r.ctg}</td>
                    <td className="py-1.5 pr-2">{r.dayNight}</td>
                    <td className="py-1.5 pr-2 text-slate-700">{r.motivo}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap text-[10px]">{r.excelIngresoAt || '—'}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap text-[10px]">{r.excelSalidaAt || '—'}</td>
                    <td className="py-1.5 text-[10px] text-slate-600">{r.hitosOk || '—'}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
        {missedRows.length > 100 ?
          <p className="mt-2 text-[10px] text-slate-500">
            Vista previa: 100 de {missedRows.length} filas — descargá el CSV para el listado completo por cámara.
          </p>
        : null}
      </Card>

      {excelTotalMovimientos != null ?
        <p className="text-xs text-slate-500">
          Filas normalizadas en transform: {excelTotalMovimientos.toLocaleString()} · Participación{' '}
          {active.circuitCode}: {effectiveReport.periodTotals.rowsByCircuit[active.circuitCode] ?? 0} /{' '}
          {excelInPeriod}
        </p>
      : null}
    </div>
  )
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${className}`}
      style={{ borderColor: BORDER, borderRadius: 12 }}
    >
      {children}
    </div>
  )
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent?: CaptureEstado
}) {
  const color =
    accent === 'OK' ? GREEN
    : accent === 'Revisar' ? AMBER
    : accent === 'Crítico' ? RED
    : '#0f172a'
  return (
    <div className="rounded-xl border bg-white px-3 py-2 shadow-sm" style={{ borderColor: BORDER }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums" style={{ color }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  )
}

function EstadoBadge({ estado }: { estado: CaptureEstado }) {
  const styles =
    estado === 'OK' ?
      { bg: GREEN_LIGHT, color: GREEN, label: 'OK' }
    : estado === 'Revisar' ?
      { bg: '#fef3c7', color: AMBER, label: 'Revisar' }
    : { bg: RED_LIGHT, color: RED, label: 'Crítico' }
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-bold"
      style={{ background: styles.bg, color: styles.color }}
    >
      {styles.label}
    </span>
  )
}

function TurnoCard({
  data,
  accent,
}: {
  data: {
    turnoLabel: string
    reconocidos: number
    parciales: number
    noReconocidos: number
    pctCapturaPromedio: number
    peorHito: string
    peorCamara: string
  }
  accent: string
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm" style={{ borderColor: BORDER }}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
        <h6 className="text-sm font-bold text-slate-900">{data.turnoLabel}</h6>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Reconocidos</dt>
          <dd className="font-semibold text-emerald-700">{data.reconocidos}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Parciales</dt>
          <dd className="font-semibold text-amber-700">{data.parciales}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">No reconocidos</dt>
          <dd className="font-semibold text-red-700">{data.noReconocidos}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">% captura prom.</dt>
          <dd className="font-semibold tabular-nums">{data.pctCapturaPromedio}%</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-slate-500">Peor hito</dt>
          <dd className="font-medium text-slate-800">{data.peorHito}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-slate-500">Peor cámara</dt>
          <dd className="font-medium text-slate-800">{data.peorCamara}</dd>
        </div>
      </dl>
    </div>
  )
}
