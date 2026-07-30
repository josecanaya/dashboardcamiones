import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EXECUTIVE_CIRCUIT_MATRIX } from '../etlWorkbench/finalCircuitScoring'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'
import {
  getCircuitSegmentTemplate,
  listCircuitSegmentAggregates,
  logicalPointLabel,
  mergeVolcableReceiptSegmentTiming,
  countUniqueOperationsForCircuit,
  kpiCircuitCodesForScatterFilter,
  VOLCABLE_RECEIPT_KPI_UNION_CODE,
  SEGMENT_TIMING_HISTOGRAM_BIN_MIN,
  type SegmentTimingAggregate,
} from '../etlWorkbench/etlSegmentTiming'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { CircuitChecklistFilter } from '../components/CircuitChecklistFilter'
import { exportChartAsPng, safeExportFilename } from '../../../utils/chartExport'
import { histogramWithKde } from '../../../utils/stats'
import { SegmentTimingChartPanel } from './SegmentTimingChartPanel'
import { RicardoneSectorScatterPanel } from './RicardoneSectorScatterPanel'
import { SegmentOccupancyChartPanel } from './SegmentOccupancyChartPanel'
import { CaladaCamerasPanel } from './CaladaCamerasPanel'
import { parseSegmentScatterByDayCsv } from '../etlWorkbench/etlSegmentScatterByDay'
import { isWithinSegmentScatterDisplayMax } from '../etlWorkbench/etlSegmentScatterByDay'
import { legsForAggregate } from '../etlWorkbench/etlSegmentSlowTail'

function fmtMin(v: number): string {
  return v.toFixed(1)
}

function buildChartDataForAggregate(agg: SegmentTimingAggregate) {
  if (!agg.durationsMinutes.length) return []
  return histogramWithKde(agg.durationsMinutes, SEGMENT_TIMING_HISTOGRAM_BIN_MIN, 5, { unit: 'min' })
}

export function KpiTiemposTab() {
  const wb = useEtlWorkbenchOptional()
  const tr = wb?.transformResult
  const kpiBuilt = wb?.kpiTiemposBuilt ?? tr?.stats.kpiTiemposBuilt ?? false
  /**
   * Recalcular necesita los recorridos reconstruidos, que solo existen en memoria tras
   * un Transform. Una corrida guardada trae las tablas de KPI pero no ese insumo.
   */
  const canRunKpi = wb?.kpiTiemposPrepared ?? false
  const segmentTimingRaw = kpiBuilt ? tr?.stats.segmentTiming : null

  const analysisSourceLabel = tr?.csv.excel_operations_with_truckflow?.trim() ?
    'Excel-first + Truckflow'
  : 'Truckflow ETL'

  const isExcelFirstKpi = Boolean(tr?.csv.excel_operations_with_truckflow?.trim())
  const excelFirstReadyForScatter = Number(tr?.stats.movimientosContrato?.excelFirst?.ready_for_scatter ?? 0)
  const slBalanzaComiteDiag = tr?.stats.slBalanzaComiteDiagnostics as
    | { funnelLog: string; detailLog: string }
    | undefined

  // Reemplaza al filtro de producto: el usuario tilda qué circuitos entran. null = aún
  // sin inicializar → se toman todos (ver efecto más abajo).
  const [checkedCircuits, setCheckedCircuits] = useState<Set<string> | null>(null)
  const [circuitFilter, setCircuitFilter] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [chartView, setChartView] = useState<'tiempos' | 'ocupacion' | 'sectores_ric' | 'calada'>('tiempos')

  const segmentTiming = useMemo(() => {
    if (!segmentTimingRaw) return null
    if (circuitFilter === VOLCABLE_RECEIPT_KPI_UNION_CODE) {
      return mergeVolcableReceiptSegmentTiming(segmentTimingRaw)
    }
    return segmentTimingRaw
  }, [segmentTimingRaw, circuitFilter])

  const periodLabel = useMemo(() => {
    if (!wb?.loadSummary?.daysDetected.length) return '—'
    const d = wb.loadSummary.daysDetected
    return d.length === 1 ? d[0] : `${d[0]} → ${d[d.length - 1]}`
  }, [wb?.loadSummary])

  /** Circuitos reales presentes (para el checklist). */
  const checklistOptions = useMemo(
    () =>
      (segmentTimingRaw?.circuitCodes ?? []).map((c) => ({
        id: c,
        label: `${c} · ${EXECUTIVE_CIRCUIT_MATRIX[c]?.label ?? c}`,
      })),
    [segmentTimingRaw?.circuitCodes]
  )

  // Set efectivo: null (sin inicializar) = todos los circuitos.
  const effectiveChecked = useMemo(
    () => checkedCircuits ?? new Set(checklistOptions.map((o) => o.id)),
    [checkedCircuits, checklistOptions]
  )

  /** Opciones del drilldown de un circuito (tabla de tramos): solo los tildados + unión R5+R6. */
  const circuitOptions = useMemo(() => {
    const codes = checklistOptions.map((o) => o.id).filter((c) => effectiveChecked.has(c))
    const opts = codes.map((c) => ({
      id: c,
      label: `${c} · ${EXECUTIVE_CIRCUIT_MATRIX[c]?.label ?? c}`,
    }))
    if (codes.includes('R5') && codes.includes('R6')) {
      return [
        { id: VOLCABLE_RECEIPT_KPI_UNION_CODE, label: 'R5+R6 · Volcable 1 + Volcable 2 (unificado)' },
        ...opts,
      ]
    }
    return opts
  }, [checklistOptions, effectiveChecked])

  const scatterByDayAll = useMemo(
    () => parseSegmentScatterByDayCsv(tr?.csv.segment_scatter_by_day),
    [tr?.csv.segment_scatter_by_day]
  )

  const periodFechas = useMemo(() => {
    const fromDisk = [...(wb?.loadSummary?.daysDetected ?? [])]
    const fromScatter = scatterByDayAll.map((r) => r.fecha_tramo).filter(Boolean)
    return [...new Set([...fromDisk, ...fromScatter])].sort()
  }, [wb?.loadSummary?.daysDetected, scatterByDayAll])

  useEffect(() => {
    // Default o resincroniza si el circuito del drilldown quedó fuera de los tildados.
    const ids = circuitOptions.map((o) => o.id)
    if (ids.length && (!circuitFilter || !ids.includes(circuitFilter))) {
      setCircuitFilter(ids[0]!)
      setSelectedKey(null)
    }
  }, [circuitFilter, circuitOptions])

  const visibleAggregates = useMemo((): SegmentTimingAggregate[] => {
    if (!segmentTiming || !circuitFilter) return []
    if (circuitFilter === VOLCABLE_RECEIPT_KPI_UNION_CODE) {
      return listCircuitSegmentAggregates(segmentTiming, VOLCABLE_RECEIPT_KPI_UNION_CODE)
    }
    return listCircuitSegmentAggregates(segmentTiming, circuitFilter)
  }, [segmentTiming, circuitFilter])

  const aggregatesWithData = useMemo(
    () => visibleAggregates.filter((a) => a.stats.count > 0),
    [visibleAggregates]
  )

  const circuitExportRef = useRef<HTMLDivElement | null>(null)
  const [exportBusy, setExportBusy] = useState(false)

  const selectedAggregate = useMemo(() => {
    if (!visibleAggregates.length) return null
    if (selectedKey) {
      const hit = visibleAggregates.find((a) => a.transitionKey === selectedKey)
      if (hit) return hit
    }
    return aggregatesWithData[0] ?? visibleAggregates[visibleAggregates.length - 1] ?? null
  }, [visibleAggregates, aggregatesWithData, selectedKey])

  const circuitScatterUniqueOps = useMemo(() => {
    if (!circuitFilter) return 0
    const codes = kpiCircuitCodesForScatterFilter(circuitFilter)
    const ids = new Set(
      scatterByDayAll
        .filter((r) => codes.includes(r.circuito) && isWithinSegmentScatterDisplayMax(r.duracion_minutos))
        .map((r) => r.journey_id)
    )
    return ids.size
  }, [scatterByDayAll, circuitFilter])

  const scatterPoolHint = useMemo(
    () => ({
      uniqueOpsInCircuit: circuitScatterUniqueOps,
      globalReadyForScatter: isExcelFirstKpi && excelFirstReadyForScatter > 0 ? excelFirstReadyForScatter : undefined,
    }),
    [circuitScatterUniqueOps, isExcelFirstKpi, excelFirstReadyForScatter]
  )

  const scatterByDayForTramo = useCallback(
    (tramoLabel: string) => {
      if (!circuitFilter) return []
      const circuitCodes = kpiCircuitCodesForScatterFilter(circuitFilter)
      const rows = scatterByDayAll.filter(
        (r) => circuitCodes.includes(r.circuito) && r.tramo_operativo === tramoLabel
      )
      return rows.filter((r) => isWithinSegmentScatterDisplayMax(r.duracion_minutos))
    },
    [scatterByDayAll, circuitFilter]
  )

  const legsForTramo = useCallback(
    (agg: SegmentTimingAggregate) => {
      if (!segmentTiming) return []
      return legsForAggregate(segmentTiming, circuitFilter, agg.fromCode, agg.toCode)
    },
    [segmentTiming, circuitFilter]
  )

  const exportCircuitRecorrido = useCallback(async () => {
    if (!aggregatesWithData.length || exportBusy || !circuitExportRef.current) return
    setExportBusy(true)
    const generatedAt = new Date().toLocaleString('es-AR')
    try {
      await new Promise((r) => setTimeout(r, 400))
      await exportChartAsPng(
        circuitExportRef.current,
        safeExportFilename(`kpi_${circuitFilter}_circuito`, 'png'),
        {
          title: `${circuitFilter} · KPI tiempos por tramo`,
          period: periodLabel,
          generatedAt,
          source: analysisSourceLabel,
        },
        2,
        { excludeExportHide: true }
      )
    } finally {
      setExportBusy(false)
    }
  }, [aggregatesWithData.length, analysisSourceLabel, circuitFilter, exportBusy, periodLabel])

  const circuitPathLabel = useMemo(() => {
    const template = getCircuitSegmentTemplate(circuitFilter)
    if (!template.length) return '—'
    return template.map(logicalPointLabel).join(' → ')
  }, [circuitFilter])

  const circuitOperationCount = useMemo(() => {
    if (!segmentTiming || !circuitFilter) return 0
    return countUniqueOperationsForCircuit(segmentTiming, circuitFilter)
  }, [segmentTiming, circuitFilter])

  if (!wb) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Workbench ETL no disponible.
      </p>
    )
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50/90 to-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">KPI tiempos por circuito y tramo</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Tramo 4 del flujo: después del Transform, procesá acá los tiempos y la dispersión. Con XLSX cargados,
              la fuente es <strong>Excel-first</strong>; sin XLSX, Truckflow COMPLETOS. Cada gráfico cuenta solo
              camiones con <strong>KPI válido en ese tramo</strong> (p. ej. balanza ingreso→egreso exige cámaras,
              duración mínima y tope); el total <strong>ready_for_scatter</strong> incluye operaciones de otros
              tramos o aún sin ese KPI.
            </p>
            <p className="mt-2 font-mono text-xs text-slate-500">
              Período: {periodLabel} · Reglas: {tr?.rulesVersion ?? '—'} · Fuente: {analysisSourceLabel}
              {checklistOptions.length && effectiveChecked.size < checklistOptions.length ?
                ` · ${effectiveChecked.size}/${checklistOptions.length} circuitos`
              : ''}:{' '}
              {isExcelFirstKpi ?
                `${segmentTiming?.journeyCount ?? '—'} operaciones Excel (ready_for_scatter: ${excelFirstReadyForScatter || '—'})`
              : `${segmentTiming?.journeyCount ?? '—'} journeys`}{' '}
              · Unidad: minutos
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              // Sin insumo en memoria el proceso falla siempre (corrida guardada).
              disabled={!tr || !canRunKpi || wb?.transformBusy || wb?.kpiTiemposBusy}
              title={
                !canRunKpi ?
                  'Los KPI de esta corrida guardada ya están calculados. Para recalcularlos, cargá el período en «Análisis local» y corré Transform.'
                : undefined
              }
              onClick={() => void wb?.runKpiTiempos()}
              className="rounded-xl bg-violet-700 px-5 py-2 text-sm font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {wb?.kpiTiemposBusy ?
                'Procesando KPI tiempos…'
              : kpiBuilt ?
                'Reprocesar KPI tiempos'
              : 'Procesar KPI tiempos (tramo 4)'}
            </button>
            <button
              type="button"
              disabled={!tr?.csv.segment_timing_kpi}
              onClick={() => {
                const csv = tr?.csv.segment_timing_kpi
                if (csv) triggerBrowserCsvDownload('segment_timing_kpi.csv', csv)
              }}
              className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-800 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export CSV KPI
            </button>
            <button
              type="button"
              disabled={!tr?.csv.segment_scatter_by_day}
              onClick={() => {
                const csv = tr?.csv.segment_scatter_by_day
                if (csv) triggerBrowserCsvDownload('segment_scatter_by_day.csv', csv)
              }}
              className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-800 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export Power BI (dispersión día)
            </button>
            <button
              type="button"
              disabled={!tr?.csv.sector_occupancy_30min}
              onClick={() => {
                const csv = tr?.csv.sector_occupancy_30min
                if (csv) triggerBrowserCsvDownload('sector_occupancy_30min.csv', csv)
              }}
              className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-800 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export Power BI (ocupación 30 min)
            </button>
            <button
              type="button"
              disabled={!tr?.csv.sector_occupancy_events}
              onClick={() => {
                const csv = tr?.csv.sector_occupancy_events
                if (csv) triggerBrowserCsvDownload('sector_occupancy_events.csv', csv)
              }}
              className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-800 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export eventos ocupación
            </button>
          </div>
        </div>
      </div>

      {wb?.kpiTiemposError ?
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
          {wb.kpiTiemposError}
        </p>
      : null}

      {!tr ?
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          Sin transform. Andá a <strong>Análisis local</strong> → Cargar período → <strong>Procesar Transform</strong>.
        </p>
      : !canRunKpi ?
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-950">
          Estás viendo una <strong>corrida guardada</strong>: los KPI de tiempos ya están calculados y se muestran
          abajo. <strong>Reprocesar no está disponible</strong> porque los recorridos reconstruidos (el insumo del
          cálculo) no se persisten en la corrida. Para recalcular: <strong>Análisis local</strong> → Cargar período →{' '}
          <strong>Procesar Transform</strong> → volver acá.
        </p>
      : !kpiBuilt ?
        <p className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-4 text-sm text-violet-950">
          Transform listo. Los KPI de tiempos y dispersión <strong>no se calculan solos</strong>: usá{' '}
          <strong>Procesar KPI tiempos (tramo 4)</strong> arriba. Así el Transform termina antes y esta pestaña
          solo trabaja cuando la abrís.
        </p>
      : circuitOptions.length === 0 ?
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
          Transform ejecutado, pero no hay tramos agregados para journeys COMPLETOS con circuito ejecutivo asignado.
        </p>
      : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-slate-700">Vista gráficos</span>
              <div className="inline-flex rounded-xl border border-slate-300 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setChartView('tiempos')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    chartView === 'tiempos' ? 'bg-white text-violet-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Tiempos (dispersión)
                </button>
                <button
                  type="button"
                  onClick={() => setChartView('ocupacion')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    chartView === 'ocupacion' ? 'bg-white text-violet-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Ocupación sector (30 min)
                </button>
                <button
                  type="button"
                  onClick={() => setChartView('sectores_ric')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    chartView === 'sectores_ric' ? 'bg-white text-violet-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Sectores Ric (general)
                </button>
                <button
                  type="button"
                  onClick={() => setChartView('calada')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    chartView === 'calada' ? 'bg-white text-violet-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Cámaras calada
                </button>
              </div>
            </div>
            <CircuitChecklistFilter
              options={checklistOptions}
              checked={effectiveChecked}
              onChange={setCheckedCircuits}
            />
            {chartView === 'sectores_ric' || chartView === 'calada' ?
              null
            : <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-slate-700">Circuito ejecutivo</span>
              <select
                value={circuitFilter}
                onChange={(e) => {
                  setCircuitFilter(e.target.value)
                  setSelectedKey(null)
                }}
                className="min-w-[16rem] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {circuitOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="max-w-2xl text-sm text-slate-600">
              <span className="font-semibold text-slate-700">Recorrido:</span> {circuitPathLabel}
              {isExcelFirstKpi && circuitOperationCount > 0 && (
                <span className="mt-1 block text-xs text-violet-700">
                  {circuitOperationCount} operaciones Excel con tramos en {circuitFilter}. N por fila = operaciones
                  con ese tramo observado (puede variar si la ruta Truckflow está incompleta).
                </span>
              )}
              {(circuitFilter === 'R7' || circuitFilter === 'SL1' || circuitFilter === 'R26' || circuitFilter === 'R27') && (
                <span className="mt-1 block text-xs text-violet-700">
                  Pata San Lorenzo: ingreso → balanza de entrada → <strong>egreso</strong> (S1→S7).
                  Inicio = cámara balanza; si falta S1, tránsito corto desde ingreso puerto Truckflow.
                  Tope 3 h (se corrige, no se elimina el camión). Salida Excel = egreso si falta S7.
                </span>
              )}
              {(circuitFilter === 'R1' ||
                circuitFilter === 'R5' ||
                circuitFilter === 'R6' ||
                circuitFilter === VOLCABLE_RECEIPT_KPI_UNION_CODE) && (
                <span className="mt-1 block text-xs text-violet-700">
                  Recepción Ricardone / Volcable: tramo <strong>balanza ingreso → balanza egreso</strong> incluye
                  estadía en plataforma (pasa por Volcable en R5/R6). Salida Excel cierra si falta cámara de egreso.
                  Con Volcable en el medio se aceptan estadías ≥ 3 min; sin Volcable, mínimo 10 min (B1/B2).
                  {circuitFilter === VOLCABLE_RECEIPT_KPI_UNION_CODE ?
                    ' Vista unificada R5+R6. Volcable 1/2: se reconstruyen tramos con Excel (ingreso/calado/salida) + Truckflow; mínimo de cámaras reducido.'
                  : null}
                </span>
              )}
              {(circuitFilter === 'R1' ||
                circuitFilter === 'R5' ||
                circuitFilter === 'R6' ||
                circuitFilter === VOLCABLE_RECEIPT_KPI_UNION_CODE ||
                circuitFilter === 'R9' ||
                circuitFilter === 'R19' ||
                circuitFilter === 'R20' ||
                circuitFilter === 'R3' ||
                circuitFilter === 'R4') && (
                <span className="mt-1 block text-xs text-violet-700">
                  Excel-first: match patente+producto → Truckflow da el recorrido. Si falta cámara:{' '}
                  <strong>ingreso</strong>, <strong>calado</strong> o <strong>salida</strong> del Excel rellenan el
                  punto. Truckflow medido tiene prioridad.
                </span>
              )}
              {(circuitFilter === 'R3' || circuitFilter === 'R4') && (
                <span className="mt-1 block text-xs text-violet-700">
                  Silos Kepler (R3/R4): tramos <strong>ingreso → calada → balanza ingreso → balanza egreso</strong>.
                  Secuencia provisional S0–S1–S2–S4–S4 (sin cámara en silo). Si falta un hito, se usa{' '}
                  <strong>ingreso</strong>, <strong>calado</strong> o <strong>salida</strong> del Excel; no se inventan
                  tiempos intermedios.
                </span>
              )}
              {(circuitFilter === 'R19' || circuitFilter === 'R20') && (
                <span className="mt-1 block text-xs text-violet-700">
                  Transile C16→Volcable: recorrido corto sin recepción Ricardone formal (carga C16 + descarga Volcable).
                </span>
              )}
              {(circuitFilter === 'R26' || circuitFilter === 'R27') && (
                <span className="mt-1 block text-xs text-violet-700">
                  Transile Ricardone↔San Lorenzo: tramos C16 y puente Ric↔SL se deducen con salto no consecutivo.
                  Puente <strong>balanza egreso Ric → ingreso SL</strong> (R26) o <strong>egreso SL → ingreso Ric</strong>{' '}
                  (R27) usa calado/salida Excel cuando falta cámara intermedia.
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={exportBusy || aggregatesWithData.length === 0}
              onClick={() => void exportCircuitRecorrido()}
              className="rounded-xl border border-violet-400 bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportBusy ? 'Exportando PNG…' : 'Exportar circuito (1 PNG)'}
            </button>
            </>}
          </div>

          {chartView === 'calada' ?
            <CaladaCamerasPanel
              csv={tr?.csv.calada_camera_events}
              checkedCircuits={effectiveChecked}
              filterActive={effectiveChecked.size < checklistOptions.length}
              periodLabel={periodLabel}
            />
          : chartView === 'sectores_ric' ?
            <RicardoneSectorScatterPanel
              scatterByDayAll={scatterByDayAll}
              segmentTiming={segmentTimingRaw ?? null}
              periodLabel={periodLabel}
            />
          : (
          <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  <th className="px-4 py-3">Tramo</th>
                  <th className="px-4 py-3 text-right">N</th>
                  <th className="px-4 py-3 text-right">Media</th>
                  <th className="px-4 py-3 text-right">Mín</th>
                  <th className="px-4 py-3 text-left">Patente mín</th>
                  <th className="px-4 py-3 text-right">Máx</th>
                  <th className="px-4 py-3 text-left">Patente máx</th>
                  <th className="px-4 py-3 text-right">Desvío σ</th>
                </tr>
              </thead>
              <tbody>
                {visibleAggregates.map((row) => {
                  const active = selectedAggregate?.transitionKey === row.transitionKey
                  const hasData = row.stats.count > 0
                  return (
                    <tr
                      key={`${row.circuitCode}-${row.transitionKey}`}
                      className={`border-b border-slate-100 transition cursor-pointer hover:bg-slate-50 ${
                        !hasData ? 'text-slate-500' : ''
                      } ${active ? 'bg-violet-50' : ''}`}
                      onClick={() => {
                        setSelectedKey(row.transitionKey)
                        const id = `kpi-tramo-${row.transitionKey.replace(/→/g, '-')}`
                        requestAnimationFrame(() => {
                          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        })
                      }}
                    >
                      <td className="px-4 py-2.5 font-medium">{row.label}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.stats.count || '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {hasData ? `${fmtMin(row.stats.mean)} min` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {hasData ? `${fmtMin(row.stats.min)} min` : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                        {row.minPlate || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {hasData ? `${fmtMin(row.stats.max)} min` : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-rose-700">
                        {row.maxPlate || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {hasData ? `${fmtMin(row.stats.std)} min` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {visibleAggregates.length === 0 ?
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              Sin tramos en este circuito.
            </p>
          : (
            <>
              {isExcelFirstKpi && slBalanzaComiteDiag && circuitFilter === 'R7' ?
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-950">
                  <p className="font-semibold">Embudo balanza ingreso → egreso (comité)</p>
                  <p className="mt-1 font-mono leading-relaxed">{slBalanzaComiteDiag.funnelLog}</p>
                  <p className="mt-1 font-mono leading-relaxed">{slBalanzaComiteDiag.detailLog}</p>
                  <p className="mt-2 text-amber-900">
                    Tramo balanza ingreso → egreso: operaciones R7/SL con inicio de balanza (cámara o inferido) y
                    salida Excel. Si la duración bruta supera 150 min se restan 2 h (desfase cámaras/descarga); no se
                    muestran las que superan{' '}
                    <span className="font-medium">240 min</span> corregidos ni las sin inicio (
                    <span className="font-medium">sin_inicio</span>).
                  </p>
                </div>
              : null}
              <div className="space-y-8">
                {visibleAggregates.map((agg) => (
                  <div
                    key={agg.transitionKey}
                    id={`kpi-tramo-${agg.transitionKey.replace(/→/g, '-')}`}
                    className={
                      selectedAggregate?.transitionKey === agg.transitionKey ?
                        'ring-2 ring-violet-300 ring-offset-2 rounded-2xl'
                      : ''
                    }
                  >
                    {chartView === 'ocupacion' ?
                      <SegmentOccupancyChartPanel
                        title={agg.label}
                        circuitCode={circuitFilter}
                        periodLabel={periodLabel}
                        scatterRows={scatterByDayForTramo(agg.label)}
                        periodFechas={periodFechas}
                      />
                    : <SegmentTimingChartPanel
                        title={agg.label}
                        circuitCode={circuitFilter}
                        periodLabel={periodLabel}
                        stats={agg.stats}
                        durationsMinutes={agg.durationsMinutes}
                        chartData={buildChartDataForAggregate(agg)}
                        scatterByDayRows={scatterByDayForTramo(agg.label)}
                        segmentLegs={legsForTramo(agg)}
                        scatterPoolHint={scatterPoolHint}
                      />
                    }
                  </div>
                ))}
              </div>

              <div
                ref={circuitExportRef}
                aria-hidden
                className="pointer-events-none fixed top-0 -left-[16000px] z-[-1] w-[900px] space-y-6 bg-white p-6"
              >
                <div className="rounded-2xl border border-violet-200 bg-violet-50/50 px-5 py-4">
                  <h3 className="text-xl font-bold text-slate-900">
                    {circuitFilter} · {EXECUTIVE_CIRCUIT_MATRIX[circuitFilter]?.label ?? circuitFilter}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Período: {periodLabel} · {aggregatesWithData.length} tramos con datos
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="font-semibold">Recorrido:</span> {circuitPathLabel}
                  </p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-4 py-3">Tramo</th>
                        <th className="px-4 py-3 text-right">N</th>
                        <th className="px-4 py-3 text-right">Media</th>
                        <th className="px-4 py-3 text-right">Mín</th>
                        <th className="px-4 py-3 text-left">Patente mín</th>
                        <th className="px-4 py-3 text-right">Máx</th>
                        <th className="px-4 py-3 text-left">Patente máx</th>
                        <th className="px-4 py-3 text-right">Desvío σ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAggregates.map((row) => {
                        const hasData = row.stats.count > 0
                        return (
                          <tr key={`export-${row.transitionKey}`} className="border-b border-slate-100">
                            <td className="px-4 py-2.5 font-medium">{row.label}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{row.stats.count || '—'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {hasData ? `${fmtMin(row.stats.mean)} min` : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {hasData ? `${fmtMin(row.stats.min)} min` : '—'}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs">{row.minPlate || '—'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {hasData ? `${fmtMin(row.stats.max)} min` : '—'}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs">{row.maxPlate || '—'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {hasData ? `${fmtMin(row.stats.std)} min` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {aggregatesWithData.map((agg) => (
                  <SegmentTimingChartPanel
                    key={`export-chart-${agg.transitionKey}`}
                    title={agg.label}
                    circuitCode={circuitFilter}
                    periodLabel={periodLabel}
                    stats={agg.stats}
                    durationsMinutes={agg.durationsMinutes}
                    chartData={buildChartDataForAggregate(agg)}
                    scatterByDayRows={scatterByDayForTramo(agg.label)}
                    segmentLegs={legsForTramo(agg)}
                  />
                ))}
              </div>
            </>
          )}
          </>
          )}
        </>
      )}
    </section>
  )
}
