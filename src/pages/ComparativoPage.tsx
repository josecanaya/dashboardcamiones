/**
 * Vista Comparativo — Ricardone vs San Lorenzo vs Avellaneda.
 * Comparativas de tiempo promedio, variabilidad, flujo, alertas.
 */

import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import type { SiteId } from '../domain/sites'
import { SITES } from '../domain/sites'
import { useLogisticsOps } from '../context/LogisticsOpsContext'
import {
  computeStayTimeStats,
  computeVariabilityStats,
  computeHourlyFlow,
  computeSectorDensity,
} from '../services/analyticsKpi'
import { ChartExportButtons } from '../components/charts/ChartExportButtons'

const SITE_IDS: SiteId[] = ['ricardone', 'san_lorenzo', 'avellaneda']

export function ComparativoPage() {
  const { historicalTrips, operationalAlerts } = useLogisticsOps()

  const byPlant = useMemo(() => {
    return SITE_IDS.map((siteId) => {
      const trips = historicalTrips.filter((t) => t.siteId === siteId)
      const durations = trips.map((t) => (t.durationMinutes ?? 0) / 60)
      const stayStats = computeStayTimeStats(durations)
      const varStats = computeVariabilityStats(durations)
      const sectorDensity = computeSectorDensity(trips, operationalAlerts, siteId)
      const alerts = operationalAlerts.filter((a) => a.siteId === siteId)
      const criticalOpen = alerts.filter((a) => a.severity === 'CRITICAL' && a.status === 'OPEN').length
      const anomalousCount = trips.filter((t) => t.estadoFinal === 'ANOMALO').length
      const anomalousPct = trips.length > 0 ? (anomalousCount / trips.length) * 100 : 0

      return {
        siteId,
        siteName: SITES.find((s) => s.id === siteId)?.name ?? siteId,
        tripCount: trips.length,
        avgStayMinutes: stayStats.mean * 60,
        cv: varStats.cv,
        topSector: sectorDensity[0]?.sectorId ?? 'N/A',
        topSectorCount: sectorDensity[0]?.peakConcurrent ?? 0,
        criticalOpen,
        anomalousPct,
      }
    })
  }, [historicalTrips, operationalAlerts])

  const flowByPlant = useMemo(() => {
    return SITE_IDS.map((siteId) => {
      const flow = computeHourlyFlow(historicalTrips, siteId)
      const totalIngresos = flow.reduce((s, h) => s + h.ingresos, 0)
      const totalEgresos = flow.reduce((s, h) => s + h.egresos, 0)
      const maxSimult = flow.reduce((m, h) => Math.max(m, h.simultaneos), 0)
      return {
        siteId,
        siteName: SITES.find((s) => s.id === siteId)?.name ?? siteId,
        ingresos: totalIngresos,
        egresos: totalEgresos,
        maxSimultaneos: maxSimult,
      }
    })
  }, [historicalTrips])

  const barData = useMemo(
    () =>
      byPlant.map((p) => ({
        planta: p.siteName,
        tiempoPromedio: p.avgStayMinutes,
        cv: p.cv,
        viajes: p.tripCount,
        alertasCriticas: p.criticalOpen,
        anomalosPct: p.anomalousPct,
      })),
    [byPlant]
  )

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">Comparativo multi-planta</h2>
        <p className="text-sm text-slate-500">Ricardone vs San Lorenzo vs Avellaneda</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="mb-2 font-semibold text-slate-700">Tiempo promedio de estadía (min)</h3>
        <ChartExportButtons
          filenamePrefix="comparativo_tiempo"
          csvData={barData.map((d) => ({ planta: d.planta, tiempoPromedio: d.tiempoPromedio, viajes: d.viajes }))}
          meta={{ generatedAt: new Date().toLocaleString('es-AR') }}
          title="Tiempo promedio por planta"
        >
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="planta" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="tiempoPromedio" fill="#6366f1" radius={[4, 4, 0, 0]} name="Promedio (min)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartExportButtons>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="mb-2 font-semibold text-slate-700">Variabilidad (CV)</h3>
        <ChartExportButtons
          filenamePrefix="comparativo_cv"
          csvData={barData.map((d) => ({ planta: d.planta, cv: d.cv }))}
          meta={{ generatedAt: new Date().toLocaleString('es-AR') }}
          title="Coeficiente de variación por planta"
        >
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="planta" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="cv" fill="#f59e0b" radius={[4, 4, 0, 0]} name="CV (%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartExportButtons>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="mb-2 font-semibold text-slate-700">Flujo total (ingresos / egresos)</h3>
        <ChartExportButtons
          filenamePrefix="comparativo_flujo"
          csvData={flowByPlant.map((d) => ({ planta: d.siteName, ingresos: d.ingresos, egresos: d.egresos, maxSimultaneos: d.maxSimultaneos }))}
          meta={{ generatedAt: new Date().toLocaleString('es-AR') }}
          title="Flujo por planta"
        >
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowByPlant.map((p) => ({ planta: p.siteName, ingresos: p.ingresos, egresos: p.egresos }))} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="planta" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="ingresos" fill="#2563eb" radius={[4, 4, 0, 0]} name="Ingresos" />
                <Bar dataKey="egresos" fill="#16a34a" radius={[4, 4, 0, 0]} name="Egresos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartExportButtons>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="mb-2 font-semibold text-slate-700">Tabla resumen comparativa</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-2 text-left font-semibold">Planta</th>
                <th className="px-3 py-2 text-right font-semibold">Viajes</th>
                <th className="px-3 py-2 text-right font-semibold">Prom. (min)</th>
                <th className="px-3 py-2 text-right font-semibold">CV (%)</th>
                <th className="px-3 py-2 text-right font-semibold">% Anómalos</th>
                <th className="px-3 py-2 text-right font-semibold">Alertas críticas</th>
                <th className="px-3 py-2 text-left font-semibold">Sector (pico simultáneo estim.)</th>
              </tr>
            </thead>
            <tbody>
              {byPlant.map((p) => (
                <tr key={p.siteId} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium">{p.siteName}</td>
                  <td className="px-3 py-2 text-right">{p.tripCount}</td>
                  <td className="px-3 py-2 text-right">{p.avgStayMinutes.toFixed(0)}</td>
                  <td className="px-3 py-2 text-right">{p.cv.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">{p.anomalousPct.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">{p.criticalOpen}</td>
                  <td className="px-3 py-2">{p.topSector} ({p.topSectorCount} a la vez)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
