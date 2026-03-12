import { useMemo, useState, useEffect } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from 'recharts'
import { useLogisticsOps } from '../context/LogisticsOpsContext'
import type { SiteId } from '../domain/sites'
import { IfcLoadingOverlay } from '../components/IfcLoadingOverlay'

type DashboardTab = 'live' | 'history' | 'alerts' | 'planning'
type PeriodPreset = 'last_day' | 'last_week' | 'last_month'

interface HomePageProps {
  siteId: SiteId
  onChangeSite: (siteId: SiteId) => void
  onNavigate: (tab: DashboardTab) => void
}

export function HomePage({ siteId, onChangeSite, onNavigate }: HomePageProps) {
  const { trucksInPlant, operationalAlerts, historicalTrips, isLoading, sourceMeta } = useLogisticsOps()
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('last_week')
  const [enterLoading, setEnterLoading] = useState(true)

  useEffect(() => {
    setEnterLoading(true)
    const t = setTimeout(() => setEnterLoading(false), 1200)
    return () => clearTimeout(t)
  }, [])

  const handlePeriodChange = (preset: PeriodPreset) => {
    setPeriodPreset(preset)
  }

  const maxEgresoRef = useMemo(() => {
    if (sourceMeta?.simulatedGeneratedAt) return new Date(sourceMeta.simulatedGeneratedAt).getTime()
    if (historicalTrips.length === 0) return Date.now()
    return Math.max(...historicalTrips.map((t) => new Date(t.egresoAt).getTime()))
  }, [historicalTrips, sourceMeta?.simulatedGeneratedAt])

  const summaryBySite = useMemo(() => {
    const ids: SiteId[] = ['ricardone', 'san_lorenzo', 'avellaneda']
    const refDate = new Date(maxEgresoRef)
    const fechaRef = `${refDate.getUTCFullYear()}-${String(refDate.getUTCMonth() + 1).padStart(2, '0')}-${String(refDate.getUTCDate()).padStart(2, '0')}`
    return ids.map((id) => {
      const activosEnPlanta = trucksInPlant.filter((t) => t.siteId === id)
      const activos = activosEnPlanta.length
      const camionIdsEnPlanta = new Set(activosEnPlanta.map((t) => t.camionId))
      const alertas = operationalAlerts.filter(
        (a) => a.siteId === id && a.status !== 'RESOLVED' && camionIdsEnPlanta.has(a.camionId)
      ).length
      const cerradosHoy = historicalTrips.filter((h) => {
        if (h.siteId !== id) return false
        const fecha = h.fecha ?? `${new Date(h.egresoAt).getUTCFullYear()}-${String(new Date(h.egresoAt).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(h.egresoAt).getUTCDate()).padStart(2, '0')}`
        return fecha === fechaRef
      }).length
      return { id, trucks: activos, activeAlerts: alertas, closedToday: cerradosHoy }
    })
  }, [trucksInPlant, operationalAlerts, historicalTrips, maxEgresoRef])

  const precomputedCharts = useMemo(() => {
    const refDate = new Date(maxEgresoRef)
    const refFecha = `${refDate.getUTCFullYear()}-${String(refDate.getUTCMonth() + 1).padStart(2, '0')}-${String(refDate.getUTCDate()).padStart(2, '0')}`
    const refDateMs = new Date(refFecha + 'T12:00:00Z').getTime()
    const dayMs = 24 * 60 * 60 * 1000
    const siteNames: Record<SiteId, string> = { ricardone: 'Ricardone', san_lorenzo: 'San Lorenzo', avellaneda: 'Avellaneda' }

    const activityDay: Array<{ hour: string; Ricardone: number; 'San Lorenzo': number; Avellaneda: number }> = []
    const byHourSite: Record<number, Record<string, number>> = {}
    for (let h = 0; h < 24; h++) byHourSite[h] = { Ricardone: 0, 'San Lorenzo': 0, Avellaneda: 0 }
    for (const trip of historicalTrips) {
      const tripFecha = trip.fecha ?? `${new Date(trip.egresoAt).getUTCFullYear()}-${String(new Date(trip.egresoAt).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(trip.egresoAt).getUTCDate()).padStart(2, '0')}`
      if (tripFecha !== refFecha) continue
      const h = new Date(trip.egresoAt).getUTCHours()
      const name = siteNames[trip.siteId]
      if (byHourSite[h] && name) byHourSite[h][name] = (byHourSite[h][name] ?? 0) + 1
    }
    for (let h = 0; h < 24; h++) {
      activityDay.push({
        hour: String(h).padStart(2, '0'),
        Ricardone: byHourSite[h]?.Ricardone ?? 0,
        'San Lorenzo': byHourSite[h]?.['San Lorenzo'] ?? 0,
        Avellaneda: byHourSite[h]?.Avellaneda ?? 0,
      })
    }

    const byDaySite: Record<number, Record<string, number>> = {}
    for (let d = 0; d < 7; d++) byDaySite[d] = { Ricardone: 0, 'San Lorenzo': 0, Avellaneda: 0 }
    for (const trip of historicalTrips) {
      const fecha = trip.fecha ?? `${new Date(trip.egresoAt).getUTCFullYear()}-${String(new Date(trip.egresoAt).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(trip.egresoAt).getUTCDate()).padStart(2, '0')}`
      const tripDateMs = new Date(fecha + 'T12:00:00Z').getTime()
      const daysDiff = (refDateMs - tripDateMs) / dayMs
      if (daysDiff < 0 || daysDiff > 6) continue
      const d = Math.floor(6 - daysDiff) // D7=today (d=6), D1=6 días atrás (d=0)
      const name = siteNames[trip.siteId]
      if (byDaySite[d] && name) byDaySite[d][name] = (byDaySite[d][name] ?? 0) + 1
    }
    const activityWeek = Array.from({ length: 7 }).map((_, d) => ({
      hour: `D${d + 1}`,
      Ricardone: byDaySite[d]?.Ricardone ?? 0,
      'San Lorenzo': byDaySite[d]?.['San Lorenzo'] ?? 0,
      Avellaneda: byDaySite[d]?.Avellaneda ?? 0,
    }))

    const byWeekSite: Record<number, Record<string, number>> = {}
    for (let w = 0; w < 4; w++) byWeekSite[w] = { Ricardone: 0, 'San Lorenzo': 0, Avellaneda: 0 }
    for (const trip of historicalTrips) {
      const fecha = trip.fecha ?? `${new Date(trip.egresoAt).getUTCFullYear()}-${String(new Date(trip.egresoAt).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(trip.egresoAt).getUTCDate()).padStart(2, '0')}`
      const tripDateMs = new Date(fecha + 'T12:00:00Z').getTime()
      const daysDiff = (refDateMs - tripDateMs) / dayMs
      if (daysDiff < 0 || daysDiff > 30) continue
      const w = Math.min(3, Math.floor(daysDiff / 7))
      const weekIdx = 3 - w
      const name = siteNames[trip.siteId]
      if (byWeekSite[weekIdx] && name) byWeekSite[weekIdx][name] = (byWeekSite[weekIdx][name] ?? 0) + 1
    }
    const activityMonth = Array.from({ length: 4 }).map((_, w) => ({
      hour: `S${w + 1}`,
      Ricardone: byWeekSite[w]?.Ricardone ?? 0,
      'San Lorenzo': byWeekSite[w]?.['San Lorenzo'] ?? 0,
      Avellaneda: byWeekSite[w]?.Avellaneda ?? 0,
    }))

    const buildClassification = (maxDays: number) =>
      (['ricardone', 'san_lorenzo', 'avellaneda'] as SiteId[]).map((id) => {
        const trips = historicalTrips.filter((t) => {
          if (t.siteId !== id) return false
          const fecha = t.fecha ?? `${new Date(t.egresoAt).getUTCFullYear()}-${String(new Date(t.egresoAt).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(t.egresoAt).getUTCDate()).padStart(2, '0')}`
          if (maxDays === 0) return fecha === refFecha
          const tripDateMs = new Date(fecha + 'T12:00:00Z').getTime()
          const daysDiff = (refDateMs - tripDateMs) / dayMs
          return daysDiff >= 0 && daysDiff <= maxDays
        })
        return {
          planta: siteNames[id],
          'Circuitos completos': trips.filter((t) => t.estadoFinal === 'VALIDADO').length,
          'Variaciones operativas': trips.filter((t) => t.estadoFinal === 'CON_OBSERVACIONES').length,
          Anómalos: trips.filter((t) => t.estadoFinal === 'ANOMALO').length,
        }
      })

    const classificationDay = buildClassification(0)
    const classificationWeek = buildClassification(7)
    const classificationMonth = buildClassification(30)

    const buildAlerts = (cutoffMs: number) =>
      (['ricardone', 'san_lorenzo', 'avellaneda'] as SiteId[]).map((id) => {
        const alerts = operationalAlerts.filter((a) => {
          if (a.siteId !== id || a.status === 'RESOLVED') return false
          const alertMs = new Date(a.createdAt ?? a.updatedAt ?? 0).getTime()
          return alertMs >= cutoffMs
        })
        return {
          planta: siteNames[id],
          Críticas: alerts.filter((a) => a.severity === 'CRITICAL').length,
          Altas: alerts.filter((a) => a.severity === 'HIGH').length,
          Medias: alerts.filter((a) => a.severity === 'MEDIUM').length,
        }
      })

    const refDateMsFull = new Date(maxEgresoRef).getTime()
    const alertDay = buildAlerts(refDateMsFull - dayMs)
    const alertWeek = buildAlerts(refDateMsFull - 7 * dayMs)
    const alertMonth = buildAlerts(refDateMsFull - 30 * dayMs)

    return {
      last_day: { activity: activityDay, classification: classificationDay, alerts: alertDay },
      last_week: { activity: activityWeek, classification: classificationWeek, alerts: alertWeek },
      last_month: { activity: activityMonth, classification: classificationMonth, alerts: alertMonth },
    }
  }, [historicalTrips, operationalAlerts, maxEgresoRef])

  const hourlyActivityComparative = precomputedCharts[periodPreset].activity
  const classificationComparative = precomputedCharts[periodPreset].classification
  const alertSeverityComparative = precomputedCharts[periodPreset].alerts

  const periodLabel = periodPreset === 'last_day' ? 'Último día' : periodPreset === 'last_week' ? 'Última semana' : 'Último mes'

  const dateContext = useMemo(() => {
    const ref = new Date(maxEgresoRef)
    const d = ref.getUTCDate()
    const m = ref.getUTCMonth()
    const y = ref.getUTCFullYear()
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    const monthNamesFull = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    const monthShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    if (periodPreset === 'last_day') {
      return `${dayNames[ref.getUTCDay()]} ${d} de ${monthNamesFull[m]} ${y}`
    }
    if (periodPreset === 'last_week') {
      const start = new Date(ref)
      start.setUTCDate(start.getUTCDate() - 6)
      return `${start.getUTCDate()}–${d} ${monthShort[m]} ${y}`
    }
    return `${monthNamesFull[m]} ${y}`
  }, [maxEgresoRef, periodPreset])

  if (enterLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <IfcLoadingOverlay
          variant="inline"
          loadingStage="Preparando dashboard..."
        />
      </div>
    )
  }

  return (
    <div className="relative min-h-[400px]">
      <div className="space-y-4">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {summaryBySite.map((plant) => {
          const title =
            plant.id === 'ricardone'
              ? 'Ricardone'
              : plant.id === 'san_lorenzo'
                ? 'San Lorenzo'
                : 'Avellaneda'
          const iconSrc =
            plant.id === 'ricardone'
              ? '/Ricardone_icono.png'
              : plant.id === 'san_lorenzo'
                ? '/san_lorenzo_icono.png'
                : '/Avellaneda_icono.png'
          const isSelected = siteId === plant.id
          return (
            <button
              key={plant.id}
              type="button"
              onClick={() => {
                onChangeSite(plant.id)
                onNavigate('live')
              }}
              className={`group overflow-hidden rounded-2xl border text-left shadow-md transition ${
                isSelected ? 'border-blue-300 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-200'
              }`}
            >
              <div className="relative h-44 overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-blue-100">
                <img
                  src={iconSrc}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-90"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <div className="relative z-10 flex h-full flex-col justify-between p-5">
                  <div className="text-xl font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8),0_2px_6px_rgba(0,0,0,0.5)]">
                    {title}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                      Entrar a tablero de operación
                    </div>
                    <div className="mt-2 inline-flex rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-md">
                      {isSelected ? 'Planta activa' : 'Seleccionar planta'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 border-t border-slate-200 bg-white px-4 py-3 text-center">
                <div>
                  <div className="text-lg font-bold text-slate-900">{plant.trucks}</div>
                  <div className="text-sm font-medium text-slate-600">Activos</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-900">{plant.activeAlerts}</div>
                  <div className="text-sm font-medium text-slate-600">Alertas</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-900">{plant.closedToday}</div>
                  <div className="text-sm font-medium text-slate-600">Cerrados hoy</div>
                </div>
              </div>
            </button>
          )
        })}
      </section>

      <section className="relative space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => handlePeriodChange('last_day')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${periodPreset === 'last_day' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Día
            </button>
            <button
              type="button"
              onClick={() => handlePeriodChange('last_week')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${periodPreset === 'last_week' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => handlePeriodChange('last_month')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${periodPreset === 'last_month' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Mes
            </button>
          </div>
          <span className="text-[11px] text-slate-500">
            {periodLabel} · <strong className="text-slate-700">{dateContext}</strong>
          </span>
        </div>
        <div className="relative min-h-[240px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {(isLoading || enterLoading) && (
            <IfcLoadingOverlay
              variant="inline"
              loadingStage={isLoading ? "Cargando datos..." : "Preparando dashboard..."}
            />
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <article className="rounded-xl border border-slate-100 bg-slate-50/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            {dateContext}
            <span className="ml-1 block text-xs font-normal text-slate-500">
              Actividad · {periodPreset === 'last_day' ? 'Horas (0–24h)' : periodPreset === 'last_week' ? 'Días (D1–D7)' : 'Semanas (S1–S4)'}
            </span>
          </h3>
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyActivityComparative}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="Ricardone" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="San Lorenzo" stroke="#16a34a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Avellaneda" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-xl border border-slate-100 bg-slate-50/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            {dateContext}
            <span className="ml-1 block text-xs font-normal text-slate-500">Circuitos por planta</span>
          </h3>
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classificationComparative}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="planta" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Circuitos completos" fill="#2563eb" />
                <Bar dataKey="Variaciones operativas" fill="#7c3aed" />
                <Bar dataKey="Anómalos" fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-xl border border-slate-100 bg-slate-50/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            {dateContext}
            <span className="ml-1 block text-xs font-normal text-slate-500">Alertas por severidad</span>
          </h3>
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={alertSeverityComparative}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="planta" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Críticas" stackId="a" fill="#ef4444" />
                <Bar dataKey="Altas" stackId="a" fill="#f59e0b" />
                <Bar dataKey="Medias" stackId="a" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
          </div>
        </div>
      </section>
      </div>
    </div>
  )
}
