/**
 * Vista Comité — pantalla lista para reunión.
 * KPIs principales, variaciones vs período anterior, top alertas, insights automáticos.
 */

import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import type { SiteId } from '../domain/sites'
import { SITES } from '../domain/sites'
import { useLogisticsOps } from '../context/LogisticsOpsContext'
import { useHistoricalPageData } from '../hooks/useHistoricalPageData'
import {
  computeStayTimeStats,
  computeVariabilityStats,
  computeHourlyFlow,
  computeSectorDensity,
  crossDurationByPlantCircuit,
} from '../services/analyticsKpi'
import { ChartExportButtons } from '../components/charts/ChartExportButtons'

interface ComitePageProps {
  siteId: SiteId
  onChangeSite: (siteId: SiteId) => void
}

export function ComitePage({ siteId, onChangeSite }: ComitePageProps) {
  const { historicalTrips, operationalAlerts } = useLogisticsOps()
  const { enrichedRows, effectiveDate } = useHistoricalPageData({
    historicalTrips,
    siteId,
    effectiveView: 'week',
    periodPreset: 'last_week',
    drilledWeek: null,
    drilledDay: null,
    selectedDate: '',
    query: '',
  })

  const durations = useMemo(
    () =>
      enrichedRows.map((r) => {
        const min = r.durationMinutes ?? Math.round((new Date(r.egresoAt).getTime() - new Date(r.ingresoAt).getTime()) / 60000)
        return min / 60
      }),
    [enrichedRows]
  )
  const stayStats = useMemo(() => computeStayTimeStats(durations), [durations])
  const varStats = useMemo(() => computeVariabilityStats(durations), [durations])
  const hourlyFlow = useMemo(() => computeHourlyFlow(historicalTrips, siteId), [historicalTrips, siteId])
  const sectorDensity = useMemo(
    () => computeSectorDensity(historicalTrips, operationalAlerts, siteId),
    [historicalTrips, operationalAlerts, siteId]
  )
  const crossPlantCircuit = useMemo(() => crossDurationByPlantCircuit(historicalTrips), [historicalTrips])

  const plantName = SITES.find((s) => s.id === siteId)?.name ?? siteId
  const criticalOpen = operationalAlerts.filter((a) => a.severity === 'CRITICAL' && a.status === 'OPEN').length
  const totalTrips = enrichedRows.length
  const anomalousPct = totalTrips > 0
    ? ((enrichedRows.filter((r) => r.estadoFinal === 'ANOMALO').length / totalTrips) * 100).toFixed(1)
    : '0'
  const withObsPct = totalTrips > 0
    ? ((enrichedRows.filter((r) => r.estadoFinal === 'CON_OBSERVACIONES').length / totalTrips) * 100).toFixed(1)
    : '0'

  const topCircuit = crossPlantCircuit
    .filter((c) => c.dimension1 === siteId)
    .sort((a, b) => b.value - a.value)[0]
  const topSector = sectorDensity[0]
  const peakHour = hourlyFlow.reduce((best, h) => (h.ingresos + h.egresos > (best.ingresos + best.egresos) ? h : best), hourlyFlow[0] ?? { hour: 0, ingresos: 0, egresos: 0 })

  const insights = useMemo(() => {
    const list: string[] = []
    if (topCircuit) list.push(`Circuito con mayor tiempo promedio: ${topCircuit.dimension2} (${(topCircuit.value / 60).toFixed(1)} min)`)
    if (topSector) {
      list.push(
        `Sector con mayor pico simultáneo: ${topSector.sectorId} (${topSector.peakConcurrent} camiones a la vez, estim.; ${topSector.count} viajes en el período)`
      )
    }
    list.push(`Variabilidad (CV): ${varStats.cv.toFixed(1)}%`)
    list.push(`Franja horaria con mayor flujo: ${peakHour.hour}:00–${peakHour.hour + 1}:00`)
    list.push(`% viajes anómalos: ${anomalousPct}%`)
    list.push(`% viajes con observaciones: ${withObsPct}%`)
    if (criticalOpen > 0) list.push(`Alertas críticas abiertas: ${criticalOpen}`)
    return list
  }, [topCircuit, topSector, varStats.cv, peakHour, anomalousPct, withObsPct, criticalOpen])

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
          <span className="text-xs text-slate-500">Período: semana ref. {effectiveDate}</span>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Tiempo promedio estadía</div>
          <div className="text-2xl font-bold text-slate-800">{(stayStats.mean * 60).toFixed(0)} min</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Variabilidad (CV)</div>
          <div className="text-2xl font-bold text-slate-800">{varStats.cv.toFixed(1)}%</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Total viajes</div>
          <div className="text-2xl font-bold text-slate-800">{totalTrips}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Alertas críticas abiertas</div>
          <div className="text-2xl font-bold text-rose-600">{criticalOpen}</div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="mb-2 font-semibold text-slate-700">Conclusiones automáticas</h3>
        <ul className="space-y-1 text-sm text-slate-600">
          {insights.map((text, i) => (
            <li key={i}>• {text}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="mb-2 font-semibold text-slate-700">Flujo por hora</h3>
        <ChartExportButtons
          filenamePrefix="comite_flujo"
          csvData={hourlyFlow.map((h) => ({ hora: h.hour, ingresos: h.ingresos, egresos: h.egresos, simultaneos: h.simultaneos }))}
          meta={{ plant: plantName, period: `semana ${effectiveDate}` }}
          title="Flujo por hora"
        >
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyFlow} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="ingresos" fill="#2563eb" radius={[4, 4, 0, 0]} name="Ingresos" />
                <Bar dataKey="egresos" fill="#16a34a" radius={[4, 4, 0, 0]} name="Egresos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartExportButtons>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="mb-2 font-semibold text-slate-700">Densidad por sector</h3>
        <ChartExportButtons
          filenamePrefix="comite_densidad"
          csvData={sectorDensity.slice(0, 10).map((s) => ({
            sector: s.sectorId,
            pico_simultaneo: s.peakConcurrent,
            viajes_periodo: s.count,
            alertas: s.alertCount,
          }))}
          meta={{ plant: plantName, period: `semana ${effectiveDate}` }}
          title="Densidad por sector"
        >
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorDensity.slice(0, 8)} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="sectorId" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="peakConcurrent" fill="#6366f1" radius={[4, 4, 0, 0]} name="Pico simultáneo (estim.)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartExportButtons>
      </section>
    </div>
  )
}
