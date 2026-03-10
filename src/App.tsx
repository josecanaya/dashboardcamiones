import { useState, useEffect, useRef } from 'react'
import { SiteProvider, useSite } from './context/SiteContext'
import { DataProvider } from './context/DataContext'
import { SimulatorVisitProvider, useSimulatorVisit } from './context/SimulatorVisitContext'
import { LogisticsOpsProvider, useLogisticsOps } from './context/LogisticsOpsContext'
import { VisitDetailModal } from './components/VisitDetailModal'
import { LoadingScreen } from './components/LoadingScreen'
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
  const { isLoading } = useLogisticsOps()
  const prevSiteIdRef = useRef<string | null>(null)
  const [tab, setTab] = useState<MainTab>('home')
  const [historyMode, setHistoryMode] = useState<'stats' | 'records'>('stats')
  const [alertsMode, setAlertsMode] = useState<'history' | 'notifications'>('notifications')
  const [detailVisit, setDetailVisit] = useState<ReconstructedVisit | null>(null)
  const [pendingPlateToOpen, setPendingPlateToOpen] = useState<string | null>(null)
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
      <LoadingScreen isLoading={isLoading} />
      <main className="flex min-h-[calc(100vh-24px)] items-stretch gap-3 pt-3 pr-3 pb-3 pl-0">
        <aside className="h-[calc(100vh-24px)] w-[280px] shrink-0 border-r border-violet-900 bg-[#1a1136] p-3 text-violet-100">
          <div className="mb-4 flex flex-col items-center gap-2">
            <img src="/logo_sinfondo.png" alt="Truckflow" className="h-12 w-auto max-w-[200px] object-contain" />
            <span className="text-lg font-bold tracking-tight text-violet-100">Truckflow</span>
          </div>

          <nav className="space-y-2">
            <button
              type="button"
              onClick={() => setTab('home')}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                tab === 'home' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/60'
              }`}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Home
            </button>

            <div className="rounded-lg bg-violet-900/30">
              <button
                type="button"
                onClick={() => setOpenMonitoring((prev) => !prev)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-violet-100 hover:bg-violet-800/40"
              >
                <span className="flex items-center gap-3">
                  <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Monitoreo
                </span>
                <svg className={`h-4 w-4 shrink-0 transition-transform ${openMonitoring ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openMonitoring && (
                <div className="space-y-0.5 border-t border-violet-400/20 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => { setSiteId('ricardone'); setTab('live') }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${siteId === 'ricardone' && tab === 'live' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/50'}`}
                  >
                    <span className="text-violet-400">●</span> Ricardone
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSiteId('san_lorenzo'); setTab('live') }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${siteId === 'san_lorenzo' && tab === 'live' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/50'}`}
                  >
                    <span className="text-violet-400">●</span> San Lorenzo
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSiteId('avellaneda'); setTab('live') }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${siteId === 'avellaneda' && tab === 'live' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/50'}`}
                  >
                    <span className="text-violet-400">●</span> Avellaneda
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-violet-900/30">
              <button
                type="button"
                onClick={() => setOpenHistory((prev) => !prev)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-violet-100 hover:bg-violet-800/40"
              >
                <span className="flex items-center gap-3">
                  <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Histórico
                </span>
                <svg className={`h-4 w-4 shrink-0 transition-transform ${openHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openHistory && (
                <div className="space-y-0.5 border-t border-violet-400/20 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => { setHistoryMode('stats'); setTab('history') }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${tab === 'history' && historyMode === 'stats' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/50'}`}
                  >
                    <span className="text-violet-400">●</span> Estadísticas
                  </button>
                  <button
                    type="button"
                    onClick={() => { setHistoryMode('records'); setTab('history') }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${tab === 'history' && historyMode === 'records' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/50'}`}
                  >
                    <span className="text-violet-400">●</span> Registro
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-violet-900/30">
              <button
                type="button"
                onClick={() => setOpenAlerts((prev) => !prev)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-violet-100 hover:bg-violet-800/40"
              >
                <span className="flex items-center gap-3">
                  <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0v-1a3 3 0 00-6 0v1" />
                  </svg>
                  Alertas
                </span>
                <svg className={`h-4 w-4 shrink-0 transition-transform ${openAlerts ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openAlerts && (
                <div className="space-y-0.5 border-t border-violet-400/20 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => { setAlertsMode('history'); setTab('alerts') }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${tab === 'alerts' && alertsMode === 'history' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/50'}`}
                  >
                    <span className="text-violet-400">●</span> Histórico
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAlertsMode('notifications'); setTab('alerts') }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${tab === 'alerts' && alertsMode === 'notifications' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/50'}`}
                  >
                    <span className="text-violet-400">●</span> Notificaciones
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setTab('planning')}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                tab === 'planning' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/60'
              }`}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              Planificación
            </button>
          </nav>

        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 self-stretch overflow-hidden">
          <section className="flex shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <button
              type="button"
              onClick={() => setTab('home')}
              className="focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 rounded-lg"
            >
              <img src="/logo.png" alt="Logo empresa" className="h-16 max-w-[280px] object-contain" />
            </button>
          </section>
          {tab === 'home' && (
            <HomePage
              siteId={siteId as SiteId}
              onChangeSite={(id) => setSiteId(id)}
              onNavigate={(nextTab) => setTab(nextTab)}
            />
          )}
          {tab === 'live' && (
            <LivePlantPage
              onOpenVisitDetail={openDetail}
              focusPlate={pendingPlateToOpen}
              onFocusPlateHandled={() => setPendingPlateToOpen(null)}
            />
          )}
          {tab === 'history' && (
            <HistoricalOperationalPage
              siteId={siteId as SiteId}
              onChangeSite={(id) => setSiteId(id)}
              mode={historyMode}
              onViewInModel={(plate) => {
                setPendingPlateToOpen(plate)
                setTab('live')
              }}
            />
          )}
          {tab === 'alerts' && (
            <OperationalAlertsPage
              siteId={siteId as SiteId}
              mode={alertsMode}
              onOpenTruck={(plate) => {
                setPendingPlateToOpen(plate)
                setTab('live')
              }}
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
