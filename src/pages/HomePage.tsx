import { useMemo } from 'react'
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

type DashboardTab = 'live' | 'history' | 'alerts' | 'planning'

interface HomePageProps {
  siteId: SiteId
  onChangeSite: (siteId: SiteId) => void
  onNavigate: (tab: DashboardTab) => void
}

export function HomePage({ siteId, onChangeSite, onNavigate }: HomePageProps) {
  const { trucksInPlant, operationalAlerts, historicalTrips, cameraEvents } = useLogisticsOps()

  const summaryBySite = useMemo(() => {
    const ids: SiteId[] = ['ricardone', 'san_lorenzo', 'avellaneda']
    return ids.map((id) => {
      const trucks = trucksInPlant.filter((t) => t.siteId === id).length
      const activeAlerts = operationalAlerts.filter((a) => a.siteId === id && a.status !== 'RESOLVED').length
      const today = new Date().toDateString()
      const closedToday = historicalTrips.filter((h) => h.siteId === id && new Date(h.egresoAt).toDateString() === today).length
      return { id, trucks, activeAlerts, closedToday }
    })
  }, [trucksInPlant, operationalAlerts, historicalTrips])

  const lastUpdate = cameraEvents[0]?.timestamp ?? new Date().toISOString()
  const sites: SiteId[] = ['ricardone', 'san_lorenzo', 'avellaneda']
  const siteLabel: Record<SiteId, string> = {
    ricardone: 'Ricardone',
    san_lorenzo: 'San Lorenzo',
    avellaneda: 'Avellaneda',
  }

  const hourlyActivityComparative = useMemo(() => {
    // Mock significativo: perfil por hora para visualizar comportamiento operativo.
    const ricardone = [2, 1, 1, 1, 2, 4, 8, 14, 19, 23, 27, 31, 34, 39, 46, 52, 48, 37, 29, 22, 16, 10, 6, 3]
    const sanLorenzo = [1, 1, 1, 1, 1, 3, 6, 10, 14, 18, 22, 26, 28, 31, 36, 40, 38, 30, 24, 18, 13, 9, 5, 2]
    const avellaneda = [1, 1, 1, 1, 2, 4, 7, 12, 17, 20, 24, 29, 33, 37, 42, 47, 44, 35, 27, 20, 15, 11, 7, 3]
    return Array.from({ length: 24 }).map((_, h) => ({
      hour: String(h).padStart(2, '0'),
      Ricardone: ricardone[h],
      'San Lorenzo': sanLorenzo[h],
      Avellaneda: avellaneda[h],
    }))
  }, [])

  const truckStateComparative = useMemo(
    () => [
      { planta: 'Ricardone', 'En espera': 18, 'En circulación': 34, Detenido: 9 },
      { planta: 'San Lorenzo', 'En espera': 12, 'En circulación': 21, Detenido: 6 },
      { planta: 'Avellaneda', 'En espera': 15, 'En circulación': 27, Detenido: 8 },
    ],
    []
  )

  const alertSeverityComparative = useMemo(
    () => [
      { planta: 'Ricardone', Críticas: 4, Altas: 7, Medias: 11 },
      { planta: 'San Lorenzo', Críticas: 2, Altas: 4, Medias: 6 },
      { planta: 'Avellaneda', Críticas: 3, Altas: 5, Medias: 8 },
    ],
    []
  )

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Dashboard operativo</h2>
        <p className="text-sm text-slate-500">Elegí una planta para entrar al tablero de operación.</p>
        <div className="mt-2 text-xs text-slate-500">
          Última actualización: {new Date(lastUpdate).toLocaleTimeString('es-AR')}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {summaryBySite.map((plant) => {
          const title =
            plant.id === 'ricardone'
              ? 'Ricardone'
              : plant.id === 'san_lorenzo'
                ? 'San Lorenzo'
                : 'Avellaneda'
          const isSelected = siteId === plant.id
          return (
            <button
              key={plant.id}
              type="button"
              onClick={() => {
                onChangeSite(plant.id)
                onNavigate('live')
              }}
              className={`group overflow-hidden rounded-2xl border text-left shadow-sm transition ${
                isSelected ? 'border-blue-300 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-200'
              }`}
            >
              <div className="h-36 bg-gradient-to-br from-slate-100 via-slate-50 to-blue-100 p-4">
                <div className="text-lg font-bold text-slate-900">{title}</div>
                <div className="mt-1 text-xs text-slate-600">Entrar a tablero de operación</div>
                <div className="mt-6 inline-flex rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold text-slate-700">
                  {isSelected ? 'Planta activa' : 'Seleccionar planta'}
                </div>
              </div>
              <div className="grid grid-cols-3 border-t border-slate-200 bg-white px-3 py-2 text-center text-[11px]">
                <div>
                  <div className="font-semibold text-slate-900">{plant.trucks}</div>
                  <div className="text-slate-500">Camiones</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{plant.activeAlerts}</div>
                  <div className="text-slate-500">Alertas</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{plant.closedToday}</div>
                  <div className="text-slate-500">Cerrados hoy</div>
                </div>
              </div>
            </button>
          )
        })}
      </section>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
        Visualización con datos mock operativos para validar comparativa entre plantas.
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Actividad horaria (3 plantas)</h3>
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

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Estado camiones (comparativa)</h3>
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={truckStateComparative}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="planta" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="En espera" fill="#3b82f6" />
                <Bar dataKey="En circulación" fill="#22c55e" />
                <Bar dataKey="Detenido" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Alertas por severidad (comparativa)</h3>
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
      </section>
    </div>
  )
}
