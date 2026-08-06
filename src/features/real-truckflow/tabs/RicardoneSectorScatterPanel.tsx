import { useMemo } from 'react'
import { histogramWithKde } from '../../../utils/stats'
import { SEGMENT_TIMING_HISTOGRAM_BIN_MIN } from '../etlWorkbench/etlSegmentTiming'
import {
  RICARDONE_CROSS_CIRCUIT_SECTORS,
  filterScatterByDayForSector,
  summarizeCrossCircuitSectorFromScatter,
  legsForCrossCircuitSector,
  type CrossCircuitSectorSummary,
} from '../etlWorkbench/etlRicardoneSectorScatter'
import type { SegmentScatterByDayRow } from '../etlWorkbench/etlSegmentScatterByDay'
import type { SegmentTimingIndex } from '../etlWorkbench/etlSegmentTiming'
import { PRODUCT_FILTER_ALL } from '../etlWorkbench/etlProductFilter'
import { SegmentTimingChartPanel } from './SegmentTimingChartPanel'

function buildChartData(durations: number[]) {
  if (!durations.length) return []
  return histogramWithKde(durations, SEGMENT_TIMING_HISTOGRAM_BIN_MIN, 5, { unit: 'min' })
}

function SectorBreakdownTable({ summary }: { summary: CrossCircuitSectorSummary }) {
  if (!summary.circuitBreakdown.length) return null
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <th className="px-4 py-2">Circuito</th>
            <th className="px-4 py-2 text-right">Operaciones con tramo</th>
          </tr>
        </thead>
        <tbody>
          {summary.circuitBreakdown.map((row) => (
            <tr key={row.circuito} className="border-b border-slate-100">
              <td className="px-4 py-2 font-mono text-xs">{row.circuito}</td>
              <td className="px-4 py-2 text-right tabular-nums">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function RicardoneSectorScatterPanel({
  scatterByDayAll,
  segmentTiming,
  productFilter,
  checkedCircuits,
  filterActive,
  periodLabel,
}: {
  scatterByDayAll: SegmentScatterByDayRow[]
  segmentTiming: SegmentTimingIndex | null
  /** Filtro de producto opcional; KPI Tiempos ya no lo usa (filtra por circuito). */
  productFilter?: string
  /** Circuitos ejecutivos tildados en el checklist. Se aplica solo si `filterActive`. */
  checkedCircuits?: Set<string>
  /** true cuando el checklist no está en «Todos» (hay un subconjunto elegido). */
  filterActive?: boolean
  periodLabel: string
}) {
  const productArg = !productFilter || productFilter === PRODUCT_FILTER_ALL ? undefined : productFilter

  // Clave por contenido: estable entre renders aunque el padre recree el Set.
  // `null` = sin filtro (todos); Set (posiblemente vacío) = filtro activo por circuito.
  const circuitsKey = filterActive ? [...(checkedCircuits ?? [])].sort().join('|') : null
  const allowedCircuits = useMemo(
    () => (circuitsKey === null ? null : new Set(circuitsKey ? circuitsKey.split('|') : [])),
    [circuitsKey]
  )

  const summaries = useMemo(
    () =>
      RICARDONE_CROSS_CIRCUIT_SECTORS.map((sector) =>
        summarizeCrossCircuitSectorFromScatter(scatterByDayAll, sector, productArg, allowedCircuits)
      ),
    [scatterByDayAll, productArg, allowedCircuits]
  )

  return (
    <div className="space-y-10">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950">
        <p className="font-semibold">
          Sectores Ricardone {allowedCircuits ? '(circuitos filtrados)' : '(todos los circuitos)'}
        </p>
        <p className="mt-1 text-emerald-900">
          Cada punto es una operación Excel-first (o journey Truckflow) con el tramo medido o reconstruido.
          Se agrupan los camiones que pasaron por el mismo sector físico (cámaras Truckflow + anclas Excel
          cuando el merge las usa).
          {allowedCircuits ?
            ` Filtrado a los circuitos tildados: ${[...allowedCircuits].sort().join(', ') || '(ninguno)'}.`
          : ' Sin filtro de circuito ejecutivo: entran todos.'}
        </p>
      </div>

      {summaries.map((summary) => {
        const scatterForChart = filterScatterByDayForSector(
          scatterByDayAll,
          summary.sector.fromCode,
          summary.sector.toCode,
          productArg,
          allowedCircuits
        )

        const legs = legsForCrossCircuitSector(
          segmentTiming,
          summary.sector.fromCode,
          summary.sector.toCode
        )

        return (
          <div key={summary.sector.id} className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">{summary.sector.label}</h3>
              <p className="mt-1 text-sm text-slate-600">{summary.sector.description}</p>
              <p className="mt-2 text-xs text-slate-500">
                {summary.operationCount} operaciones · {summary.uniquePatentes} patentes · media{' '}
                {summary.stats.count > 0 ? `${summary.stats.mean.toFixed(1)} min` : '—'}
              </p>
            </div>
            <SectorBreakdownTable summary={summary} />
            {summary.stats.count > 0 ?
              <SegmentTimingChartPanel
                title={`${summary.sector.label} (general)`}
                circuitCode="SECTORES_RIC"
                periodLabel={periodLabel}
                stats={summary.stats}
                durationsMinutes={summary.durationsMinutes}
                chartData={buildChartData(summary.durationsMinutes)}
                scatterByDayRows={scatterForChart}
                segmentLegs={legs}
              />
            : <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                Sin tramos en el período para este sector (reprocesá KPI tiempos tras el Transform).
              </p>
            }
          </div>
        )
      })}
    </div>
  )
}
