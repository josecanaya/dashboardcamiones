import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EXECUTIVE_CIRCUIT_MATRIX } from '../etlWorkbench/finalCircuitScoring'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'
import {
  getCircuitSegmentTemplate,
  listCircuitSegmentAggregates,
  logicalPointLabel,
  SEGMENT_TIMING_HISTOGRAM_BIN_MIN,
  type SegmentTimingAggregate,
} from '../etlWorkbench/etlSegmentTiming'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { exportChartAsPng, safeExportFilename } from '../../../utils/chartExport'
import { histogramWithKde } from '../../../utils/stats'
import { SegmentTimingChartPanel } from './SegmentTimingChartPanel'

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
  const segmentTiming = tr?.stats.segmentTiming

  const periodLabel = useMemo(() => {
    if (!wb?.loadSummary?.daysDetected.length) return '—'
    const d = wb.loadSummary.daysDetected
    return d.length === 1 ? d[0] : `${d[0]} → ${d[d.length - 1]}`
  }, [wb?.loadSummary])

  const circuitOptions = useMemo(() => {
    const codes = segmentTiming?.circuitCodes ?? []
    return codes.map((c) => ({
      id: c,
      label: `${c} · ${EXECUTIVE_CIRCUIT_MATRIX[c]?.label ?? c}`,
    }))
  }, [segmentTiming?.circuitCodes])

  const [circuitFilter, setCircuitFilter] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!circuitFilter && circuitOptions[0]?.id) {
      setCircuitFilter(circuitOptions[0].id)
    }
  }, [circuitFilter, circuitOptions])

  const visibleAggregates = useMemo((): SegmentTimingAggregate[] => {
    if (!segmentTiming || !circuitFilter) return []
    return listCircuitSegmentAggregates(segmentTiming, circuitFilter)
  }, [segmentTiming, circuitFilter])

  const aggregatesWithData = useMemo(
    () => visibleAggregates.filter((a) => a.stats.count > 0),
    [visibleAggregates]
  )

  const circuitExportRef = useRef<HTMLDivElement | null>(null)
  const [exportBusy, setExportBusy] = useState(false)

  const selectedAggregate = useMemo(() => {
    if (!aggregatesWithData.length) return null
    if (selectedKey) {
      const hit = aggregatesWithData.find((a) => a.transitionKey === selectedKey)
      if (hit) return hit
    }
    return aggregatesWithData[0] ?? null
  }, [aggregatesWithData, selectedKey])

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
          source: 'Truckflow ETL',
        },
        2,
        { excludeExportHide: true }
      )
    } finally {
      setExportBusy(false)
    }
  }, [aggregatesWithData.length, circuitFilter, exportBusy, periodLabel])

  const circuitPathLabel = useMemo(() => {
    const template = getCircuitSegmentTemplate(circuitFilter)
    if (!template.length) return '—'
    return template.map(logicalPointLabel).join(' → ')
  }, [circuitFilter])

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
              Tiempos reales entre los tramos operativos del circuito (solo journeys <strong>COMPLETOS</strong>).
              Cada circuito muestra únicamente su secuencia definida: ingreso → preingreso → calada → balanza →
              destino → balanza salida.
            </p>
            <p className="mt-2 font-mono text-xs text-slate-500">
              Período: {periodLabel} · Reglas: {tr?.rulesVersion ?? '—'} · Journeys COMPLETOS:{' '}
              {segmentTiming?.journeyCount ?? '—'} · Unidad: minutos
            </p>
          </div>
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
        </div>
      </div>

      {!segmentTiming ?
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          Sin transform. Andá a <strong>Análisis local</strong> → Cargar período → <strong>Procesar Transform</strong>.
        </p>
      : circuitOptions.length === 0 ?
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
          Transform ejecutado, pero no hay tramos agregados para journeys COMPLETOS con circuito ejecutivo asignado.
        </p>
      : (
        <>
          <div className="flex flex-wrap items-end gap-4">
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
            </div>
            <button
              type="button"
              disabled={exportBusy || aggregatesWithData.length === 0}
              onClick={() => void exportCircuitRecorrido()}
              className="rounded-xl border border-violet-400 bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportBusy ? 'Exportando PNG…' : 'Exportar circuito (1 PNG)'}
            </button>
          </div>

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
                      className={`border-b border-slate-100 transition ${
                        hasData ? 'cursor-pointer hover:bg-slate-50' : 'text-slate-400'
                      } ${active ? 'bg-violet-50' : ''}`}
                      onClick={() => hasData && setSelectedKey(row.transitionKey)}
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

          {aggregatesWithData.length === 0 ?
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              Sin tramos con datos en este circuito.
            </p>
          : (
            <>
              {selectedAggregate ?
                <SegmentTimingChartPanel
                  title={selectedAggregate.label}
                  circuitCode={circuitFilter}
                  periodLabel={periodLabel}
                  stats={selectedAggregate.stats}
                  durationsMinutes={selectedAggregate.durationsMinutes}
                  chartData={buildChartDataForAggregate(selectedAggregate)}
                />
              : null}

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
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
