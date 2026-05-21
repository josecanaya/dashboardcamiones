/**
 * Página de Análisis - KPIs operativos ampliados.
 * NO reemplaza Histórico. Añade métricas de estadía, flujo, ingresos y saturación.
 */

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
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
import { ComitePage } from './ComitePage'
import Kpi5 from '../components/kpi5/Kpi5'
import { PlantOperationalSummary } from '../components/analytics/PlantOperationalSummary'
import { KpiCircuitFilterBar } from '../components/analytics/KpiCircuitFilterBar'
import type { KpiOperationKind } from '../config/kpiCircuitMatrix'
import {
  extraMatrixCodesFromTrips,
  filterTripsForKpiContext,
  operationsAvailableForPlant,
} from '../config/kpiCircuitMatrix'

interface AnalyticsPageProps {
  siteId: SiteId
  onChangeSite: (siteId: SiteId) => void
}

type PeriodPreset = 'last_day' | 'last_week' | 'last_month'

export function AnalyticsPage({ siteId, onChangeSite }: AnalyticsPageProps) {
  const { historicalTrips, trucksInPlant, operationalAlerts } = useLogisticsOps()
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('last_week')
  const [selectedDate] = useState('')
  const [openSections, setOpenSections] = useState(() => new Set(['estadia', 'turnos', 'flujo', 'saturacion', 'anomalias', 'cruces']))
  const [kpiOperation, setKpiOperation] = useState<KpiOperationKind>('recepcion')
  const [kpiMatrixCircuit, setKpiMatrixCircuit] = useState<string | null>(null)

  useEffect(() => {
    const ops = operationsAvailableForPlant(siteId)
    setKpiOperation(ops[0] ?? 'recepcion')
    setKpiMatrixCircuit(null)
  }, [siteId])

  const extraMatrixCodes = useMemo(
    () => extraMatrixCodesFromTrips(historicalTrips, siteId),
    [historicalTrips, siteId]
  )

  const historicalTripsFiltered = useMemo(
    () => filterTripsForKpiContext(historicalTrips, siteId, kpiOperation, kpiMatrixCircuit),
    [historicalTrips, siteId, kpiOperation, kpiMatrixCircuit]
  )

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const effectiveView = periodPreset === 'last_day' ? 'day' : periodPreset === 'last_week' ? 'week' : 'month'
  const { enrichedRows, effectiveDate, refData } = useHistoricalPageData({
    historicalTrips: historicalTripsFiltered,
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
  const shiftStats = useMemo(() => statsByShift(historicalTripsFiltered, siteId), [historicalTripsFiltered, siteId])
  const chartData = useMemo(() => histogramWithKde(durations, 10, 5), [durations])
  const kpi1PanelRef = useRef<HTMLDivElement>(null)
  const radarChartRef = useRef<HTMLDivElement>(null)
  const radarFormaChartRef = useRef<HTMLDivElement>(null)
  const crossCircuit = useMemo(
    () => crossDurationByPlantCircuit(historicalTripsFiltered).filter((c) => c.dimension1 === siteId),
    [historicalTripsFiltered, siteId]
  )

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

  const hasCircuitRanking = crossCircuit.length > 0

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <h1 className="text-sm font-semibold text-slate-800">Análisis operativo por planta</h1>
          <div className="flex flex-wrap items-center gap-3">
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
        </div>
      </section>

      <KpiCircuitFilterBar
        siteId={siteId}
        operation={kpiOperation}
        onOperationChange={setKpiOperation}
        matrixCircuit={kpiMatrixCircuit}
        onMatrixCircuitChange={setKpiMatrixCircuit}
        extraMatrixCodes={extraMatrixCodes}
      />

      <PlantOperationalSummary
        siteId={siteId}
        plantLabel={plantName}
        trucksInPlant={trucksInPlant}
        operationalAlerts={operationalAlerts}
        historicalTrips={historicalTrips}
        tripsInPeriod={enrichedRows.length}
        refDateLabel={`${effectiveView} · ${effectiveDate}`}
      />

      {/* 1 Tiempo de estadía — KPI 1 */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('estadia')}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          <span>1 · Tiempo de estadía en planta</span>
          <span className="text-xs font-normal text-slate-500">KPI 1</span>
          <span className="text-slate-400">{openSections.has('estadia') ? '▼' : '▶'}</span>
        </button>
        {openSections.has('estadia') && (
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

      {/* Turnos (mismo eje que estadía) */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('turnos')}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          <span>Estadía por turno operativo</span>
          <span className="text-slate-400">{openSections.has('turnos') ? '▼' : '▶'}</span>
        </button>
        {openSections.has('turnos') && (
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

      {/* Perfil radar — KPI 2 */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('radar')}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          <span>Perfil de desempeño y forma (radar)</span>
          <span className="text-xs font-normal text-slate-500">KPI 2</span>
          <span className="text-slate-400">{openSections.has('radar') ? '▼' : '▶'}</span>
        </button>
        {openSections.has('radar') && (
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
                      <>
                        El perfil de desempeño supera al de forma en{' '}
                        <strong>{Math.abs(scoreFinalDesempeno - scoreFinalForma).toFixed(0)} puntos</strong>.
                      </>
                    )}
                    {scoreFinalDesempeno < scoreFinalForma && (
                      <>
                        El perfil de forma supera al de desempeño en{' '}
                        <strong>{Math.abs(scoreFinalForma - scoreFinalDesempeno).toFixed(0)} puntos</strong>.
                      </>
                    )}
                    {scoreFinalDesempeno === scoreFinalForma && <>Ambos perfiles tienen el mismo score.</>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2 Flujo de camiones — KPI 3 */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('flujo')}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          <span>2 · Flujo e ingreso de camiones</span>
          <span className="text-xs font-normal text-slate-500">KPI 3</span>
          <span className="text-slate-400">{openSections.has('flujo') ? '▼' : '▶'}</span>
        </button>
        {openSections.has('flujo') && (
          <div className="border-t border-slate-200 p-6">
            <FlowSaturationKpi
              trips={historicalTripsFiltered}
              siteId={siteId}
              periodPreset={periodPreset}
              refFecha={refData.refFecha}
              plantName={plantName}
              effectiveDate={`${effectiveView} ${effectiveDate}`}
            />
          </div>
        )}
      </section>

      {/* Saturación — KPI 4 (vista SaturationPage) */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('saturacion')}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          <span>Saturación por sector</span>
          <span className="text-xs font-normal text-slate-500">KPI 4</span>
          <span className="text-slate-400">{openSections.has('saturacion') ? '▼' : '▶'}</span>
        </button>
        {openSections.has('saturacion') && (
          <div className="border-t border-slate-200 p-6">
            <SaturationPage siteId={siteId} onChangeSite={onChangeSite} hideSitePicker historicalTripsSubset={historicalTripsFiltered} />
          </div>
        )}
      </section>

      {/* 3 Anomalías y variaciones — KPI 5 */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('anomalias')}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          <span>3 · Anomalías y variaciones operativas</span>
          <span className="text-xs font-normal text-slate-500">KPI 5</span>
          <span className="text-slate-400">{openSections.has('anomalias') ? '▼' : '▶'}</span>
        </button>
        {openSections.has('anomalias') && (
          <div className="border-t border-slate-200 p-6">
            <Kpi5
              siteId={siteId}
              trips={enrichedRows}
              periodLabel={`${effectiveView} · ref. ${effectiveDate}`}
            />
          </div>
        )}
      </section>

      {/* 4 Lectura / ranking por circuito */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('cruces')}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          <span>4 · Lectura por circuito (duración promedio)</span>
          <span className="text-slate-400">{openSections.has('cruces') ? '▼' : '▶'}</span>
        </button>
        {openSections.has('cruces') && (
          <div className="border-t border-slate-200 p-3">
            {!hasCircuitRanking ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">
                No hay cruces con duración por circuito en este período para la planta seleccionada (mock).
              </p>
            ) : (
              <ChartExportButtons
                filenamePrefix="duracion_por_circuito"
                csvData={crossCircuit.map((c) => ({ circuito: c.dimension2, promedio_min: c.value.toFixed(1), n: c.count }))}
                meta={{ plant: plantName, period: `${effectiveView} ${effectiveDate}` }}
                title="Duración promedio por circuito"
              >
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={crossCircuit.slice(0, 12).map((c) => ({ name: c.dimension2, promedio: c.value / 60, n: c.count }))}
                      margin={{ top: 10, right: 20, bottom: 30, left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number | undefined) => [v != null ? v.toFixed(2) : '-', 'Promedio (h)']} />
                      <Bar dataKey="promedio" fill="#6366f1" radius={[4, 4, 0, 0]} name="Promedio (h)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartExportButtons>
            )}
          </div>
        )}
      </section>

      {/* Contenido vista Comité (embebido — misma lógica que ComitePage) */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('comite')}
          className="flex w-full items-center justify-between p-3 text-left font-semibold text-slate-700"
        >
          <span>Lectura ejecutiva (flujo horario, densidad y conclusiones)</span>
          <span className="text-xs font-normal text-slate-500">Vista comité</span>
          <span className="text-slate-400">{openSections.has('comite') ? '▼' : '▶'}</span>
        </button>
        {openSections.has('comite') && (
          <div className="border-t border-slate-200 p-4">
            <ComitePage siteId={siteId} onChangeSite={onChangeSite} embedded historicalTripsSubset={historicalTripsFiltered} />
          </div>
        )}
      </section>
    </div>
  )
}
