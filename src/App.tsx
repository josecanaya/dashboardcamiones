import { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { SiteProvider, useSite } from './context/SiteContext'
import { DataProvider } from './context/DataContext'
import { SimulatorVisitProvider, useSimulatorVisit } from './context/SimulatorVisitContext'
import {
  LogisticsOpsProvider,
  LogisticsOpsDeferredProvider,
  useLogisticsOps,
} from './context/LogisticsOpsContext'
import { VisitDetailModal } from './components/VisitDetailModal'
import { LoadingScreen } from './components/LoadingScreen'
import type { ReconstructedVisit } from './domain/events'
import { RealJourneyDiagnosticsPage } from './pages/RealJourneyDiagnosticsPage'
import type { SiteId } from './domain/sites'
import { COMMITTEE_ETL_LITE_MODE } from './config/committeeEtlLite'

const LivePlantPageLazy = lazy(() =>
  import('./pages/LivePlantPage').then((m) => ({ default: m.LivePlantPage }))
)
const HistoricalOperationalPageLazy = lazy(() =>
  import('./pages/HistoricalOperationalPage').then((m) => ({ default: m.HistoricalOperationalPage }))
)
const AnalyticsPageLazy = lazy(() =>
  import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
)

function RoutedTabSuspenseFallback() {
  return (
    <div className="flex min-h-[200px] flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">
      Cargando vista…
    </div>
  )
}

type MainTab = 'analytics' | 'history' | 'live' | 'realdata'

function AppContent() {
  const { siteId, setSiteId } = useSite()
  const { setVisitToSimulate } = useSimulatorVisit()
  const { isLoading, scenario, setScenario } = useLogisticsOps()
  const prevSiteIdRef = useRef<string | null>(null)
  const [tab, setTab] = useState<MainTab>(COMMITTEE_ETL_LITE_MODE ? 'realdata' : 'analytics')
  const [detailVisit, setDetailVisit] = useState<ReconstructedVisit | null>(null)
  const [pendingPlateToOpen, setPendingPlateToOpen] = useState<string | null>(null)
  const [openPlantas, setOpenPlantas] = useState(!COMMITTEE_ETL_LITE_MODE)

  useEffect(() => {
    if (prevSiteIdRef.current !== null && prevSiteIdRef.current !== siteId) {
      setDetailVisit(null)
    }
    prevSiteIdRef.current = siteId
  }, [siteId])

  const openDetail = (v: ReconstructedVisit) => setDetailVisit(v)
  const goToSimulator = (v: ReconstructedVisit) => {
    if (COMMITTEE_ETL_LITE_MODE) return
    setVisitToSimulate(v)
    setDetailVisit(null)
    setTab('live')
  }

  if (COMMITTEE_ETL_LITE_MODE) {
    return (
      <div className="min-h-screen bg-surface-50">
        <main className="flex min-h-[calc(100vh-24px)] items-stretch gap-3 pt-3 pr-3 pb-3 pl-0">
          <aside className="h-[calc(100vh-24px)] w-[248px] shrink-0 border-r border-violet-900 bg-[#1a1136] p-3 text-violet-100">
            <div className="mb-4 flex flex-col items-center gap-2">
              <img src="/logo_sinfondo.png" alt="Truckflow" className="h-12 w-auto max-w-[200px] object-contain" />
              <span className="text-lg font-bold tracking-tight text-violet-100">Truckflow</span>
            </div>
            <div className="rounded-lg border border-violet-700/40 bg-violet-900/35 p-3 text-[11px] leading-relaxed text-violet-200/95">
              <p className="font-semibold text-violet-100">Modo comité · ETL</p>
              <p className="mt-2 text-violet-300/90">Solo datos Truckflow desde la API. IFC, simulador y KPIs demo no se cargan.</p>
              <p className="mt-2 text-[10px] text-violet-400/95">
                Restaurar UI completa: <span className="font-mono">VITE_COMMITTEE_ETL_LITE=false</span>
              </p>
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 self-stretch overflow-hidden">
            <section className="flex shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <img src="/logo.png" alt="Logo empresa" className="h-14 max-w-[260px] object-contain" />
            </section>
            <RealJourneyDiagnosticsPage />
          </div>
        </main>
      </div>
    )
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

          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-violet-300">Escenario de datos</label>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="w-full rounded-lg border border-violet-700/50 bg-violet-900/50 px-3 py-2 text-sm text-violet-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="live">Live (simulador)</option>
              <optgroup label="Marzo 2026 completo">
                <option value="march_full">March full (baseline)</option>
                <option value="march_full_ordered">March full ordenado (tiempos uniformes)</option>
                <option value="march_full_chaos">March full desordenado (alta variación)</option>
              </optgroup>
              <option value="normal">Normal</option>
            </select>
          </div>

          <nav className="space-y-2">
            <div className="rounded-lg bg-violet-900/30">
              <button
                type="button"
                onClick={() => setOpenPlantas((prev) => !prev)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-violet-100 hover:bg-violet-800/40"
              >
                <span className="flex items-center gap-3">
                  <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Plantas
                </span>
                <svg className={`h-4 w-4 shrink-0 transition-transform ${openPlantas ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openPlantas && (
                <div className="space-y-0.5 border-t border-violet-400/20 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSiteId('ricardone')
                      setTab('analytics')
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${siteId === 'ricardone' && tab === 'analytics' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/50'}`}
                  >
                    <span className="text-violet-400">●</span> Ricardone
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSiteId('san_lorenzo')
                      setTab('analytics')
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${siteId === 'san_lorenzo' && tab === 'analytics' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/50'}`}
                  >
                    <span className="text-violet-400">●</span> San Lorenzo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSiteId('avellaneda')
                      setTab('analytics')
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${siteId === 'avellaneda' && tab === 'analytics' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/50'}`}
                  >
                    <span className="text-violet-400">●</span> Avellaneda
                  </button>
                  <div className="my-2 border-t border-violet-500/25 pt-1">
                    <button
                      type="button"
                      onClick={() => setTab('live')}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${tab === 'live' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/50'}`}
                    >
                      <span className="text-violet-400">◎</span> Visor IFC / simulador
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setTab('history')}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                tab === 'history' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/60'
              }`}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Histórico · Registros
            </button>

            <button
              type="button"
              onClick={() => setTab('analytics')}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                tab === 'analytics' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/60'
              }`}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Análisis · KPIs
            </button>

            <button
              type="button"
              onClick={() => setTab('realdata')}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                tab === 'realdata' ? 'bg-violet-200/90 text-violet-950' : 'text-violet-100 hover:bg-violet-800/60'
              }`}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Datos reales
            </button>
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 self-stretch overflow-hidden">
          <section className="flex shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <button
              type="button"
              onClick={() => setTab('analytics')}
              className="rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
            >
              <img src="/logo.png" alt="Logo empresa" className="h-16 max-w-[280px] object-contain" />
            </button>
          </section>
          {tab === 'live' && (
            <Suspense fallback={<RoutedTabSuspenseFallback />}>
              <LivePlantPageLazy
                onOpenVisitDetail={openDetail}
                focusPlate={pendingPlateToOpen}
                onFocusPlateHandled={() => setPendingPlateToOpen(null)}
              />
            </Suspense>
          )}
          {tab === 'history' && (
            <Suspense fallback={<RoutedTabSuspenseFallback />}>
              <HistoricalOperationalPageLazy
                siteId={siteId as SiteId}
                onChangeSite={(id: SiteId) => setSiteId(id)}
                mode="records"
                recordsOnly
                onViewInModel={(plate: string) => {
                  setPendingPlateToOpen(plate)
                  setTab('live')
                }}
              />
            </Suspense>
          )}
          {tab === 'analytics' && (
            <Suspense fallback={<RoutedTabSuspenseFallback />}>
              <AnalyticsPageLazy siteId={siteId as SiteId} onChangeSite={(id: SiteId) => setSiteId(id)} />
            </Suspense>
          )}
          {tab === 'realdata' && <RealJourneyDiagnosticsPage />}
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

function AppProviders() {
  const logistics = COMMITTEE_ETL_LITE_MODE ? LogisticsOpsDeferredProvider : LogisticsOpsProvider
  const LogisticsCmp = logistics
  return (
    <SiteProvider>
      <DataProvider>
        <LogisticsCmp>
          <SimulatorVisitProvider>
            <AppContent />
          </SimulatorVisitProvider>
        </LogisticsCmp>
      </DataProvider>
    </SiteProvider>
  )
}

function App() {
  return <AppProviders />
}

export default App
