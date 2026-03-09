import { useState, useEffect, useRef } from 'react'
import { SiteProvider, useSite } from './context/SiteContext'
import { DataProvider } from './context/DataContext'
import { SimulatorVisitProvider, useSimulatorVisit } from './context/SimulatorVisitContext'
import { LogisticsOpsProvider } from './context/LogisticsOpsContext'
import { VisitDetailModal } from './components/VisitDetailModal'
import type { ReconstructedVisit } from './domain/events'
import { LivePlantPage } from './pages/LivePlantPage'
import { HomePage } from './pages/HomePage'
import { HistoricalOperationalPage } from './pages/HistoricalOperationalPage'
import { OperationalAlertsPage } from './pages/OperationalAlertsPage'
import { PlanningDemandPage } from './pages/PlanningDemandPage'
import type { SiteId } from './domain/sites'

type MainTab = 'home' | 'live' | 'history' | 'alerts' | 'planning'

function AppContent() {
  const { siteId, setSiteId } = useSite()
  const { setVisitToSimulate } = useSimulatorVisit()
  const prevSiteIdRef = useRef<string | null>(null)
  const [tab, setTab] = useState<MainTab>('home')
  const [historyMode, setHistoryMode] = useState<'stats' | 'records'>('stats')
  const [alertsMode, setAlertsMode] = useState<'history' | 'notifications'>('notifications')
  const [detailVisit, setDetailVisit] = useState<ReconstructedVisit | null>(null)
  const [openMonitoring, setOpenMonitoring] = useState(true)
  const [openHistory, setOpenHistory] = useState(false)
  const [openAlerts, setOpenAlerts] = useState(false)

  useEffect(() => {
    if (prevSiteIdRef.current !== null && prevSiteIdRef.current !== siteId) {
      setDetailVisit(null)
    }
    prevSiteIdRef.current = siteId
  }, [siteId])

  const openDetail = (v: ReconstructedVisit) => setDetailVisit(v)
  const goToSimulator = (v: ReconstructedVisit) => {
    setVisitToSimulate(v)
    setDetailVisit(null)
    setTab('live')
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <main className="flex min-h-[calc(100vh-24px)] items-stretch gap-3 p-3">
        <aside className="h-[calc(100vh-24px)] w-[280px] shrink-0 rounded-xl border border-violet-900 bg-[#1a1136] p-3 text-violet-100 shadow-sm">
          <h1 className="mb-4 text-sm font-bold uppercase tracking-wide text-violet-100">Trazabilidad de camiones</h1>

          <button
            type="button"
            onClick={() => setTab('home')}
            className={`mb-2 w-full rounded-md border px-3 py-2 text-sm font-semibold text-left transition ${
              tab === 'home' ? 'border-violet-200 bg-violet-200 text-violet-950' : 'border-violet-300/25 bg-violet-900/40 hover:bg-violet-800/60'
            }`}
          >
            Home
          </button>

          <div className="space-y-2">
            <div className="rounded-md border border-violet-300/20 bg-violet-900/35">
              <button
                type="button"
                onClick={() => {
                  setTab('live')
                  setOpenMonitoring((prev) => !prev)
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold ${
                  tab === 'live' ? 'text-violet-100' : 'text-violet-100/90'
                }`}
              >
                <span>Monitoreo</span>
                <span>{openMonitoring ? '▾' : '▸'}</span>
              </button>
              {openMonitoring && (
                <div className="space-y-1 border-t border-violet-300/20 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSiteId('ricardone')
                      setTab('live')
                    }}
                    className={`w-full rounded px-2.5 py-1.5 text-left text-xs ${siteId === 'ricardone' ? 'bg-violet-200 text-violet-950' : 'hover:bg-violet-800/70'}`}
                  >
                    Ricardone
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSiteId('san_lorenzo')
                      setTab('live')
                    }}
                    className={`w-full rounded px-2.5 py-1.5 text-left text-xs ${siteId === 'san_lorenzo' ? 'bg-violet-200 text-violet-950' : 'hover:bg-violet-800/70'}`}
                  >
                    San Lorenzo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSiteId('avellaneda')
                      setTab('live')
                    }}
                    className={`w-full rounded px-2.5 py-1.5 text-left text-xs ${siteId === 'avellaneda' ? 'bg-violet-200 text-violet-950' : 'hover:bg-violet-800/70'}`}
                  >
                    Avellaneda
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-md border border-violet-300/20 bg-violet-900/35">
              <button
                type="button"
                onClick={() => setOpenHistory((prev) => !prev)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold"
              >
                <span>Histórico</span>
                <span>{openHistory ? '▾' : '▸'}</span>
              </button>
              {openHistory && (
                <div className="space-y-1 border-t border-violet-300/20 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryMode('stats')
                      setTab('history')
                    }}
                    className={`w-full rounded px-2.5 py-1.5 text-left text-xs ${tab === 'history' && historyMode === 'stats' ? 'bg-violet-200 text-violet-950' : 'hover:bg-violet-800/70'}`}
                  >
                    Estadísticas
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryMode('records')
                      setTab('history')
                    }}
                    className={`w-full rounded px-2.5 py-1.5 text-left text-xs ${tab === 'history' && historyMode === 'records' ? 'bg-violet-200 text-violet-950' : 'hover:bg-violet-800/70'}`}
                  >
                    Registro
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-md border border-violet-300/20 bg-violet-900/35">
              <button
                type="button"
                onClick={() => setOpenAlerts((prev) => !prev)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold"
              >
                <span>Alertas</span>
                <span>{openAlerts ? '▾' : '▸'}</span>
              </button>
              {openAlerts && (
                <div className="space-y-1 border-t border-violet-300/20 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAlertsMode('history')
                      setTab('alerts')
                    }}
                    className={`w-full rounded px-2.5 py-1.5 text-left text-xs ${tab === 'alerts' && alertsMode === 'history' ? 'bg-violet-200 text-violet-950' : 'hover:bg-violet-800/70'}`}
                  >
                    Histórico
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAlertsMode('notifications')
                      setTab('alerts')
                    }}
                    className={`w-full rounded px-2.5 py-1.5 text-left text-xs ${tab === 'alerts' && alertsMode === 'notifications' ? 'bg-violet-200 text-violet-950' : 'hover:bg-violet-800/70'}`}
                  >
                    Notificaciones
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setTab('planning')}
              className={`w-full rounded-md border px-3 py-2 text-sm font-semibold text-left ${
                tab === 'planning' ? 'border-violet-200 bg-violet-200 text-violet-950' : 'border-violet-300/25 bg-violet-900/40 hover:bg-violet-800/60'
              }`}
            >
              Planificación
            </button>
          </div>

        </aside>

        <div className="min-w-0 flex-1 self-stretch">
          {tab === 'home' && (
            <HomePage
              siteId={siteId as SiteId}
              onChangeSite={(id) => setSiteId(id)}
              onNavigate={(nextTab) => setTab(nextTab)}
            />
          )}
          {tab === 'live' && <LivePlantPage onOpenVisitDetail={openDetail} />}
          {tab === 'history' && (
            <HistoricalOperationalPage
              siteId={siteId as SiteId}
              onChangeSite={(id) => setSiteId(id)}
              mode={historyMode}
              onViewInModel={() => setTab('live')}
            />
          )}
          {tab === 'alerts' && (
            <OperationalAlertsPage
              siteId={siteId as SiteId}
              mode={alertsMode}
              onOpenTruck={() => setTab('live')}
            />
          )}
          {tab === 'planning' && <PlanningDemandPage />}
        </div>
      </main>

      {detailVisit && (
        <VisitDetailModal
          visit={detailVisit}
          onClose={() => setDetailVisit(null)}
          onSimulate={goToSimulator}
        />
      )}
    </div>
  )
}

function App() {
  return (
    <SiteProvider>
      <DataProvider>
        <LogisticsOpsProvider>
          <SimulatorVisitProvider>
            <AppContent />
          </SimulatorVisitProvider>
        </LogisticsOpsProvider>
      </DataProvider>
    </SiteProvider>
  )
}

export default App
