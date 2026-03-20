/**
 * Página de Análisis - KPIs operativos ampliados.
 * NO reemplaza Histórico. Añade métricas de estadía, flujo, ingresos y saturación.
 */

import { useState, useMemo, useRef } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import type { SiteId } from '../domain/sites'
import { SITES } from '../domain/sites'
import { useLogisticsOps } from '../context/LogisticsOpsContext'
import { useHistoricalPageData } from '../hooks/useHistoricalPageData'
import {
  computeStayTimeStats,
  statsByShift,
  crossDurationByPlantCircuit,
} from '../services/analyticsKpi'
import { histogramWithKde } from '../utils/stats'
import { clampDurationMinutes } from '../config/durationBounds'
import { ChartExportButtons } from '../components/charts/ChartExportButtons'
import { Kpi1EstadiaReport } from '../components/reports/Kpi1EstadiaReport'
import { EstadiaRadarChart } from '../components/estadia/EstadiaRadarChart'
import { EstadiaRadarChartForma } from '../components/estadia/EstadiaRadarChartForma'
import { buildIndicadoresForma } from '../lib/distribucionForma'
import { buildRadarDataset } from '../lib/estadiaRadarScore'
import { buildFormaRadarDataset } from '../lib/estadiaRadarFormaScore'
import { FlowSaturationKpi } from '../components/flow/FlowSaturationKpi'
import { SaturationPage } from './SaturationPage'

interface AnalyticsPageProps {
  siteId: SiteId
  onChangeSite: (siteId: SiteId) => void
}

type PeriodPreset = 'last_day' | 'last_week' | 'last_month'

export function AnalyticsPage({ siteId, onChangeSite }: AnalyticsPageProps) {
  const { historicalTrips } = useLogisticsOps()
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('last_week')
  const [selectedDate] = useState('')
  const [expandedSection, setExpandedSection] = useState<string | null>('estadia')

  const effectiveView = periodPreset === 'last_day' ? 'day' : periodPreset === 'last_week' ? 'week' : 'month'
  const { enrichedRows, effectiveDate, refData } = useHistoricalPageData({
    historicalTrips,
    siteId,
    effectiveView,
    periodPreset,
    drilledWeek: null,
    drilledDay: null,
    selectedDate,
    query: '',
  })

  const durations = useMemo(
    () =>
      enrichedRows.map((r) => {
        const minRaw = r.durationMinutes ?? Math.round((new Date(r.egresoAt).getTime() - new Date(r.ingresoAt).getTime()) / 60000)
        return clampDurationMinutes(minRaw) / 60
      }),
    [enrichedRows]
  )
  const stayStats = useMemo(() => computeStayTimeStats(durations), [durations])
  const shiftStats = useMemo(() => statsByShift(historicalTrips, siteId), [historicalTrips, siteId])
  const chartData = useMemo(() => histogramWithKde(durations, 10, 5), [durations])
  const kpi1PanelRef = useRef<HTMLDivElement>(null)
  const radarChartRef = useRef<HTMLDivElement>(null)
  const radarFormaChartRef = useRef<HTMLDivElement>(null)
  const crossCircuit = useMemo(() => crossDurationByPlantCircuit(historicalTrips).filter((c) => c.dimension1 === siteId), [historicalTrips, siteId])

  const plantName = SITES.find((s) => s.id === siteId)?.name ?? siteId

  const radarStats = useMemo(() => {
    const modeBinIdx = chartData.reduce((best, d, i) => (d.count > (chartData[best]?.count ?? 0) ? i : best), 0)
    const mode = chartData[modeBinIdx]?.x ?? stayStats.mode ?? stayStats.median
    return {
      mode,
      median: stayStats.median,
      p90: stayStats.p90,
      iqr: stayStats.iqr,
      std: stayStats.std ?? 0,
    }
  }, [chartData, stayStats])

  const indicadoresForma = useMemo(() => {
    if (durations.length === 0 || stayStats.q1 == null || stayStats.q3 == null) return null
    const maxCount = Math.max(0, ...chartData.map((d) => d.count))
    return buildIndicadoresForma(
      stayStats.mean,
      stayStats.std,
      stayStats.q1,
      stayStats.q3,
      stayStats.p90,
      durations,
      maxCount,
      'media_std',
      'media_std'
    )
  }, [durations, stayStats, chartData])

  const radarCsvData = useMemo(
    () =>
      buildRadarDataset(radarStats).map((d) => ({
        metrica: d.subject,
        valor_real: d.unidad === '%' ? `${d.valorReal.toFixed(1)}%` : d.valorReal.toFixed(2),
        unidad: d.unidad,
        score: d.score.toFixed(1),
      })),
    [radarStats]
  )
  const formaCsvData = useMemo(
    () =>
      indicadoresForma
        ? buildFormaRadarDataset(indicadoresForma).map((d) => ({
            metrica: d.subject,
            valor_real: d.valorCamiones != null ? `${d.valorCamiones} camiones (${d.valorReal.toFixed(0)}%)` : `${d.valorReal.toFixed(1)}%`,
            score: d.score.toFixed(1),
          }))
        : [],
    [indicadoresForma]
  )

  const scoreFinalDesempeno = useMemo(() => {
    const data = buildRadarDataset(radarStats)
    if (data.length === 0) return 0
    return data.reduce((sum, d) => sum + d.score, 0) / data.length
  }, [radarStats])

  const scoreFinalForma = useMemo(() => {
    if (!indicadoresForma) return null
    const data = buildFormaRadarDataset(indicadoresForma)
    if (data.length === 0) return 0
    return data.reduce((sum, d) => sum + d.score, 0) / data.length
  }, [indicadoresForma])

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-slate-100/80 p-1">
            {SITES.map((site) => (
              <button
                key={site.id}
                type="button"
                onClick={() => onChangeSite(site.id)}
                className={`rounded-md px-4 py-2 text-base font-bold transition ${
                  site.id === siteId ? 'bg-violet-600 text-white shadow-md' : 'bg-transparent text-slate-500 hover:bg-slate-200/80'
                }`}
              >
                {site.name}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
            {(['last_day', 'last_week', 'last_month'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodPreset(p)}
                className={`rounded-md px-2.5 py-1 ${periodPreset === p ? 'bg-blue-100 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {p === 'last_day' ? 'Día' : p === 'last_week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500">Fecha ref: {effectiveDate}</span>
        </div>
      </section>

      {/* KPI 1 - Tiempo de estadía ampliado */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setExpandedSection((s) => (s === 'estadia' ? null : 'estadia'))}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          KPI 1 — Tiempo de estadía en planta
          <span className="text-slate-400">{expandedSection === 'estadia' ? '▼' : '▶'}</span>
        </button>
        {expandedSection === 'estadia' && (
          <div className="border-t border-slate-200 bg-white p-6" ref={kpi1PanelRef} style={{ minWidth: 600 }}>
            <Kpi1EstadiaReport
              stayStats={stayStats}
              chartData={chartData}
              durations={durations}
              plantName={plantName}
              periodLabel={`${effectiveView} ${effectiveDate}`}
              panelRef={kpi1PanelRef}
            />
          </div>
        )}
      </section>

      {/* KPI 2 - Perfil de desempeño operativo (radar) */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setExpandedSection((s) => (s === 'radar' ? null : 'radar'))}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          KPI 2 — Perfil general de desempeño operativo
          <span className="text-slate-400">{expandedSection === 'radar' ? '▼' : '▶'}</span>
        </button>
        {expandedSection === 'radar' && (
          <div className="border-t border-slate-200 p-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartExportButtons
                chartRef={radarChartRef}
                filenamePrefix="perfil_desempeno_operativo"
                csvData={radarCsvData}
                meta={{ plant: plantName, period: `${effectiveView} ${effectiveDate}` }}
                title="Perfil general de desempeño operativo"
                className={!indicadoresForma ? 'lg:col-span-2' : ''}
              >
                <div ref={radarChartRef} className="rounded-lg border border-slate-200 bg-white p-4">
                  <EstadiaRadarChart stayStats={radarStats} />
                </div>
              </ChartExportButtons>
              {indicadoresForma && (
                <ChartExportButtons
                  chartRef={radarFormaChartRef}
                  filenamePrefix="perfil_forma_distribucion"
                  csvData={formaCsvData}
                  meta={{ plant: plantName, period: `${effectiveView} ${effectiveDate}` }}
                  title="Perfil de forma de la distribución"
                >
                  <div ref={radarFormaChartRef} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                    <EstadiaRadarChartForma indicadores={indicadoresForma} />
                  </div>
                </ChartExportButtons>
              )}
            </div>

            {/* Score final comparativo */}
            <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-violet-200 bg-violet-50/50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Score final comparativo
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">Perfil desempeño:</span>
                  <span className="rounded-lg bg-white px-3 py-1 font-bold text-violet-700 shadow-sm">
                    {scoreFinalDesempeno.toFixed(0)}/100
                  </span>
                </div>
                {scoreFinalForma != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">Perfil forma:</span>
                    <span className="rounded-lg bg-white px-3 py-1 font-bold text-violet-700 shadow-sm">
                      {scoreFinalForma.toFixed(0)}/100
                    </span>
                  </div>
                )}
                {scoreFinalForma != null && (
                  <div className="border-l border-slate-300 pl-4 text-sm text-slate-700">
                    {scoreFinalDesempeno > scoreFinalForma && (
                      <>El perfil de desempeño supera al de forma en <strong>{Math.abs(scoreFinalDesempeno - scoreFinalForma).toFixed(0)} puntos</strong>.</>
                    )}
                    {scoreFinalDesempeno < scoreFinalForma && (
                      <>El perfil de forma supera al de desempeño en <strong>{Math.abs(scoreFinalForma - scoreFinalDesempeno).toFixed(0)} puntos</strong>.</>
                    )}
                    {scoreFinalDesempeno === scoreFinalForma && (
                      <>Ambos perfiles tienen el mismo score.</>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* KPI 3 - Flujo e ingreso de camiones */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setExpandedSection((s) => (s === 'flujo' ? null : 'flujo'))}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          KPI 3 — Flujo e ingreso de camiones
          <span className="text-slate-400">{expandedSection === 'flujo' ? '▼' : '▶'}</span>
        </button>
        {expandedSection === 'flujo' && (
          <div className="border-t border-slate-200 p-6">
            <FlowSaturationKpi
              trips={historicalTrips}
              siteId={siteId}
              periodPreset={periodPreset}
              refFecha={refData.refFecha}
              plantName={plantName}
              effectiveDate={`${effectiveView} ${effectiveDate}`}
            />
          </div>
        )}
      </section>

      {/* KPI 4 - Saturación por sector */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setExpandedSection((s) => (s === 'saturacion' ? null : 'saturacion'))}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          KPI 4 — Saturación por sector
          <span className="text-slate-400">{expandedSection === 'saturacion' ? '▼' : '▶'}</span>
        </button>
        {expandedSection === 'saturacion' && (
          <div className="border-t border-slate-200 p-6">
            <SaturationPage siteId={siteId} onChangeSite={onChangeSite} />
          </div>
        )}
      </section>

      {/* Estadísticas por turno */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setExpandedSection((s) => (s === 'turnos' ? null : 'turnos'))}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          Estadísticas por turno operativo
          <span className="text-slate-400">{expandedSection === 'turnos' ? '▼' : '▶'}</span>
        </button>
        {expandedSection === 'turnos' && (
          <div className="border-t border-slate-200 p-3">
            <ChartExportButtons
              filenamePrefix="estadia_por_turno"
              csvData={shiftStats.map((s) => ({ turno: s.shiftLabel, n: s.stats.count, promedio_h: s.stats.mean.toFixed(2), sigma: s.stats.std.toFixed(2) }))}
              meta={{ plant: plantName, period: `${effectiveView} ${effectiveDate}` }}
              title="Estadía por turno"
            >
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={shiftStats.map((s) => ({ name: s.shiftLabel, promedio: s.stats.mean / 60, n: s.stats.count }))} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="promedio" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Promedio (h)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            </ChartExportButtons>
          </div>
        )}
      </section>

      {/* Cruces analíticos */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setExpandedSection((s) => (s === 'cruces' ? null : 'cruces'))}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          Cruces analíticos — Duración por circuito
          <span className="text-slate-400">{expandedSection === 'cruces' ? '▼' : '▶'}</span>
        </button>
        {expandedSection === 'cruces' && (
          <div className="border-t border-slate-200 p-3">
            <ChartExportButtons
              filenamePrefix="duracion_por_circuito"
              csvData={crossCircuit.map((c) => ({ circuito: c.dimension2, promedio_min: c.value.toFixed(1), n: c.count }))}
              meta={{ plant: plantName, period: `${effectiveView} ${effectiveDate}` }}
              title="Duración promedio por circuito"
            >
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={crossCircuit.slice(0, 12).map((c) => ({ name: c.dimension2, promedio: c.value / 60, n: c.count }))} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number | undefined) => [v != null ? v.toFixed(2) : '-', 'Promedio (h)']} />
                    <Bar dataKey="promedio" fill="#6366f1" radius={[4, 4, 0, 0]} name="Promedio (h)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartExportButtons>
          </div>
        )}
      </section>
    </div>
  )
}
