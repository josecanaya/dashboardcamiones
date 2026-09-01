import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EXECUTIVE_CIRCUIT_MATRIX } from '../etlWorkbench/finalCircuitScoring'
import { pelletUnifiedCircuitLabel } from '../../../etl-core/reports/transileExternoCiclo'
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
import { CircuitFicha, type FichaTramo, type FichaBand, type FichaDayBar } from './CircuitFicha'
import { CIRCUIT_CATALOG } from '../../../etl-core/domain/circuitCatalog'
import { CircuitChecklistFilter } from '../components/CircuitChecklistFilter'
import { exportChartAsPng, safeExportFilename } from '../../../utils/chartExport'
import { histogramWithKde, mean as meanOf, std as stdOf, min as minOf, max as maxOf } from '../../../utils/stats'
import { SegmentTimingChartPanel } from './SegmentTimingChartPanel'
import { RicardoneSectorScatterPanel } from './RicardoneSectorScatterPanel'
import { SegmentOccupancyChartPanel } from './SegmentOccupancyChartPanel'
import { CaladaCamerasPanel } from './CaladaCamerasPanel'
import { parseSegmentScatterByDayCsv } from '../etlWorkbench/etlSegmentScatterByDay'
import { isWithinSegmentScatterDisplayMax } from '../etlWorkbench/etlSegmentScatterByDay'
import {
  FRANJA_HORARIA_COLORS,
  FRANJA_HORARIA_ORDER,
  SCATTER_DAY_FILTER_ALL,
  buildQuarterCircuitSummary,
  type FranjaHoraria,
  type QuarterCircuitOpInput,
} from '../etlWorkbench/etlSegmentScatterByDay'
import { turnoLabel } from '../etlWorkbench/operationalTurno'
import { parseCsvToRecords } from '../etlWorkbench/etlCsvParse'
import { legsForAggregate } from '../etlWorkbench/etlSegmentSlowTail'

function fmtMin(v: number): string {
  return v.toFixed(1)
}

/**
 * Día operativo (YYYY-MM-DD) de un ISO, con la misma regla que las bandas/conteos:
 * un inicio ≥ 22:00 pertenece al día siguiente (arranque de Q1 22–04). Devuelve '' si no parsea.
 */
function operationalDayOfIso(iso: string): string {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})/)
  if (!m) return ''
  const hour = Number(m[4])
  if (hour >= 22) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1))
    return d.toISOString().slice(0, 10)
  }
  return `${m[1]}-${m[2]}-${m[3]}`
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
   * Recalcular funciona con el insumo en memoria (tras un Transform) O re-agregando
   * desde los `segment_timing_legs` persistidos en la corrida/rango compuesto.
   */
  const hasPersistedLegs = Boolean(
    (tr?.tables as Record<string, { rows?: unknown[] }> | undefined)?.segment_timing_legs?.rows?.length
  )
  const canRunKpi = (wb?.kpiTiemposPrepared ?? false) || hasPersistedLegs
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
  const [chartView, setChartView] = useState<'tiempos' | 'ocupacion' | 'calada' | 'volcable_sl'>('tiempos')

  // Filtro general (día / banda horaria) compartido por TODOS los gráficos de KPI tiempos.
  const [selectedDay, setSelectedDay] = useState(SCATTER_DAY_FILTER_ALL)
  const [franjaFilter, setFranjaFilter] = useState<FranjaHoraria | null>(null)

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
        label: `${c} · ${pelletUnifiedCircuitLabel(c) ?? EXECUTIVE_CIRCUIT_MATRIX[c]?.label ?? c}`,
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
      label: `${c} · ${pelletUnifiedCircuitLabel(c) ?? EXECUTIVE_CIRCUIT_MATRIX[c]?.label ?? c}`,
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

  /**
   * Mapa journey_id → día operativo, tomado de `circuit_timing_journeys` (start_time). Es la única
   * fuente con fecha que cubre TODOS los circuitos (los legs no llevan fecha; la dispersión por día
   * solo trae algunos circuitos en rangos compuestos). Sirve para recalcular la barra de tiempos
   * medios del día elegido filtrando los legs por el día de su journey.
   */
  const journeyDayById = useMemo(() => {
    const csv = tr?.csv.circuit_timing_journeys
    const map = new Map<string, string>()
    if (!csv?.trim()) return map
    const { rows } = parseCsvToRecords(csv)
    for (const r of rows) {
      const id = String(r.journey_id ?? '').trim()
      if (!id) continue
      const day = operationalDayOfIso(String(r.start_time ?? ''))
      if (day) map.set(id, day)
    }
    return map
  }, [tr?.csv.circuit_timing_journeys])

  const periodFechas = useMemo(() => {
    const fromDisk = [...(wb?.loadSummary?.daysDetected ?? [])]
    const fromScatter = scatterByDayAll.map((r) => r.fecha_tramo).filter(Boolean)
    return [...new Set([...fromDisk, ...fromScatter])].sort()
  }, [wb?.loadSummary?.daysDetected, scatterByDayAll])

  // Si el día elegido en el filtro general ya no existe en el período, volver a "todos".
  useEffect(() => {
    if (selectedDay !== SCATTER_DAY_FILTER_ALL && !periodFechas.includes(selectedDay)) {
      setSelectedDay(SCATTER_DAY_FILTER_ALL)
    }
  }, [periodFechas, selectedDay])

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
    // Un tramo cuyos camiones son todos DEMORADOS (stats.count 0) igual debe listarse:
    // el panel muestra las patentes demoradas aunque no queden datos para el KPI.
    () => visibleAggregates.filter((a) => a.stats.count > 0 || (a.demorados?.length ?? 0) > 0),
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

  /**
   * Resumen por cuarto del día para el circuito seleccionado:
   * - camiones = operaciones distintas cuyo tramo de PREINGRESO/INGRESO cae en el cuarto.
   * - tiempoMedioMin = tiempo medido puerta→última cámara por operación (span del recorrido en
   *   el scatter; para R7 ya incluye la salida Excel), promediado por cuarto.
   * El cuarto se asigna por el ingreso/preingreso de cada operación.
   */
  /** Operaciones Excel del período (universo canónico de camiones por circuito). */
  const excelOperationRows = useMemo(() => {
    const csv = tr?.csv.excel_operations_with_truckflow
    if (!csv?.trim()) return [] as Record<string, string>[]
    return parseCsvToRecords(csv).rows
  }, [tr?.csv.excel_operations_with_truckflow])

  /** Operaciones distintas del circuito (insumo compartido: resumen por cuarto + día por día de la ficha). */
  const circuitOps = useMemo(() => {
    if (!circuitFilter) return [] as QuarterCircuitOpInput[]
    const codes = new Set(kpiCircuitCodesForScatterFilter(circuitFilter))
    const seen = new Set<string>()
    const ops: QuarterCircuitOpInput[] = []
    for (const r of excelOperationRows) {
      if (!codes.has(String(r.resolved_executive_circuit_code ?? '').trim())) continue
      const id = String(r.external_operation_id ?? '').trim()
      if (id) {
        if (seen.has(id)) continue
        seen.add(id)
      }
      ops.push({
        ingresoCameraAt: r.truckflow_first_seen_at,
        ingresoExcelAt: r.external_ingreso_at,
        salidaExcelAt: r.external_salida_at,
      })
    }
    return ops
  }, [excelOperationRows, circuitFilter])

  const quarterCircuitSummary = useMemo(
    () => buildQuarterCircuitSummary(circuitOps, { periodStartDay: periodFechas[0], selectedDay }),
    [circuitOps, periodFechas, selectedDay]
  )

  // —— Insumos de la ficha del circuito (CircuitFicha) ——
  const dayIsAll = selectedDay === SCATTER_DAY_FILTER_ALL

  /**
   * Tramos de la ficha:
   * - «General»: medias del período (KPI agregado ya calculado).
   * - Un día concreto: recalcula media/N/mín/máx/σ de cada tramo filtrando los legs del tramo por el
   *   día operativo de su journey ({@link journeyDayById}). Así la barra de tiempos medios cambia con
   *   el día. Si el circuito no tiene cobertura de mapeo (p. ej. la vista unificada R5+R6, cuyos legs
   *   se reconstruyen con otro id de journey), se mantienen las medias del período para no vaciar la
   *   barra.
   */
  const fichaTramos = useMemo<FichaTramo[]>(() => {
    const periodTramo = (a: SegmentTimingAggregate): FichaTramo => ({
      key: a.transitionKey,
      label: a.label,
      mean: a.stats.mean,
      count: a.stats.count,
      min: a.stats.min,
      max: a.stats.max,
      std: a.stats.std,
    })
    if (dayIsAll || !segmentTiming || journeyDayById.size === 0) {
      return visibleAggregates.map(periodTramo)
    }
    const perTramoLegs = visibleAggregates.map((a) => ({
      a,
      legs: legsForAggregate(segmentTiming, circuitFilter, a.fromCode, a.toCode),
    }))
    // Cobertura del mapa journey→día para este circuito: si es baja, no se puede filtrar por día.
    let total = 0
    let mapped = 0
    for (const { legs } of perTramoLegs) {
      for (const lg of legs) {
        total += 1
        if (journeyDayById.has(lg.journeyId)) mapped += 1
      }
    }
    if (!total || mapped / total < 0.5) {
      return visibleAggregates.map(periodTramo)
    }
    return perTramoLegs.map(({ a, legs }) => {
      const durs = legs
        .filter((lg) => journeyDayById.get(lg.journeyId) === selectedDay)
        .map((lg) => lg.durationMinutes)
        .filter((d) => Number.isFinite(d) && d > 0)
      return {
        key: a.transitionKey,
        label: a.label,
        mean: durs.length ? meanOf(durs) : 0,
        count: durs.length,
        min: durs.length ? minOf(durs) : 0,
        max: durs.length ? maxOf(durs) : 0,
        std: stdOf(durs),
      }
    })
  }, [visibleAggregates, dayIsAll, selectedDay, segmentTiming, circuitFilter, journeyDayById])
  const fichaTotalMin = useMemo(
    () => fichaTramos.reduce((s, t) => s + (t.count > 0 ? t.mean : 0), 0),
    [fichaTramos]
  )
  const fichaBands = useMemo<FichaBand[]>(
    () =>
      FRANJA_HORARIA_ORDER.map((q) => ({
        q,
        camiones: quarterCircuitSummary.porCuarto[q].camiones,
        mean: quarterCircuitSummary.porCuarto[q].tiempoMedioMin,
      })),
    [quarterCircuitSummary]
  )
  const fichaDayBars = useMemo<FichaDayBar[]>(() => {
    const WD = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']
    return periodFechas.map((fecha) => {
      // Número del día = camiones ubicables en ese día = suma de los 4 cuartos (Q1–Q4).
      const s = buildQuarterCircuitSummary(circuitOps, { periodStartDay: periodFechas[0], selectedDay: fecha })
      const wd = WD[new Date(`${fecha}T00:00:00`).getDay()] ?? ''
      return { fecha, label: fecha.slice(-2), weekday: wd, total: s.total }
    })
  }, [circuitOps, periodFechas])

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

  /**
   * Clic en un tramo de la ficha: si el tramo toca una cámara de CALADA o de VOLCABLE, abre el panel
   * de cámaras correspondiente; en cualquier otro sector, lleva a los gráficos de dispersión del tramo.
   */
  const handleSelectTramo = useCallback(
    (tramoKey: string) => {
      const agg = visibleAggregates.find((a) => a.transitionKey === tramoKey)
      const codes = [agg?.fromCode, agg?.toCode].map((c) => String(c ?? '').toUpperCase())
      if (codes.some((c) => c === 'CALADA' || c === 'SL_CALADA')) {
        setChartView('calada')
        return
      }
      if (codes.some((c) => c === 'VOLCABLE' || c === 'SL_VOLCABLE')) {
        setChartView('volcable_sl')
        return
      }
      setChartView('tiempos')
      setSelectedKey(tramoKey)
      const id = `kpi-tramo-${tramoKey.replace(/→/g, '-')}`
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    },
    [visibleAggregates]
  )

  if (!wb) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Workbench ETL no disponible.
      </p>
    )
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          // Recalcula desde el insumo en memoria o re-agregando los legs persistidos.
          disabled={!tr || !canRunKpi || wb?.transformBusy || wb?.kpiTiemposBusy}
          title={
            !canRunKpi ?
              'No hay tramos (segment_timing_legs) para recalcular. Cargá el período en «Análisis local» y corré Transform.'
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
                  onClick={() => setChartView('calada')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    chartView === 'calada' ? 'bg-white text-violet-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Cámaras calada
                </button>
                <button
                  type="button"
                  onClick={() => setChartView('volcable_sl')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    chartView === 'volcable_sl' ? 'bg-white text-violet-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Calles volcable SL
                </button>
              </div>
            </div>
            <CircuitChecklistFilter
              options={checklistOptions}
              checked={effectiveChecked}
              onChange={setCheckedCircuits}
            />
            {chartView === 'calada' || chartView === 'volcable_sl' ?
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
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          : chartView === 'volcable_sl' ?
            <CaladaCamerasPanel
              csv={tr?.csv.san_lorenzo_volcable_events}
              checkedCircuits={effectiveChecked}
              filterActive={effectiveChecked.size < checklistOptions.length}
              periodLabel={periodLabel}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              labels={{
                entitySingular: 'calle del volcable SL',
                entityPlural: 'calles del volcable SL',
                columnHeader: 'Calle volcable SL',
                trucksMetric: 'Camiones en volcable SL',
                activityMetric: 'Calles con actividad',
                exportName: 'volcable_sl_calles',
                tableName: 'san_lorenzo_volcable_events',
                splitExcelVsCamera: true,
              }}
            />
          : (
          <>
          {chartView === 'tiempos' ?
            <CircuitFicha
              circuitCode={circuitFilter}
              circuitLabel={pelletUnifiedCircuitLabel(circuitFilter) ?? EXECUTIVE_CIRCUIT_MATRIX[circuitFilter]?.label ?? circuitFilter}
              product={CIRCUIT_CATALOG[circuitFilter]?.product}
              groupLabel={CIRCUIT_CATALOG[circuitFilter]?.kind ?? ''}
              pathLabel={circuitPathLabel}
              tramos={fichaTramos}
              totalMin={fichaTotalMin}
              totalTrucks={quarterCircuitSummary.total}
              bands={fichaBands}
              dayBars={fichaDayBars}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              franjaFilter={franjaFilter}
              onFranjaFilter={setFranjaFilter}
              periodLabel={periodLabel}
              onSelectTramo={handleSelectTramo}
            />
          : null}
          {chartView !== 'tiempos' ?
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
          : null}

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
              {chartView === 'tiempos' && (circuitScatterUniqueOps > 0 || quarterCircuitSummary.total > 0) ?
                <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-violet-200 bg-violet-50/95 px-5 py-3 shadow-sm backdrop-blur">
                  <span className="text-xs font-bold uppercase tracking-wide text-violet-800">
                    Filtro general · todos los gráficos
                  </span>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-slate-700">Vista</span>
                    <select
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(e.target.value)}
                      className="min-w-[13rem] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                    >
                      <option value={SCATTER_DAY_FILTER_ALL}>Todos los días (general)</option>
                      {periodFechas.map((d) => (
                        <option key={d} value={d}>
                          Día {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Banda:
                    </span>
                    {FRANJA_HORARIA_ORDER.map((f) => {
                      const active = franjaFilter === f
                      const dimmed = franjaFilter != null && !active
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFranjaFilter(active ? null : f)}
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                            active ?
                              'border-violet-400 bg-violet-100 font-semibold text-violet-950 ring-2 ring-violet-300'
                            : dimmed ?
                              'border-transparent text-slate-400 opacity-60 hover:opacity-90'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span
                            className="inline-block rounded-full"
                            style={{ width: 10, height: 10, backgroundColor: FRANJA_HORARIA_COLORS[f] }}
                          />
                          {turnoLabel(f)}
                        </button>
                      )
                    })}
                    {franjaFilter ?
                      <button
                        type="button"
                        onClick={() => setFranjaFilter(null)}
                        className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Ver todas
                      </button>
                    : null}
                  </div>
                </div>
              : null}
              {/* Bandas por cuarto (Q1–Q4): ahora en la ficha del circuito (CircuitFicha). */}
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
                        demoraThresholdMinutes={agg.demoraThresholdMinutes}
                        scatterPoolHint={scatterPoolHint}
                        selectedDay={selectedDay}
                        onSelectedDayChange={setSelectedDay}
                        franjaFilter={franjaFilter}
                        onFranjaFilterChange={setFranjaFilter}
                        dayOptions={periodFechas}
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
                    demoraThresholdMinutes={agg.demoraThresholdMinutes}
                    selectedDay={selectedDay}
                    onSelectedDayChange={setSelectedDay}
                    franjaFilter={franjaFilter}
                    onFranjaFilterChange={setFranjaFilter}
                    dayOptions={periodFechas}
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
