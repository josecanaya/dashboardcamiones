import { useState, useEffect, useRef } from 'react'
import { SiteProvider, useSite } from './context/SiteContext'
import { DataProvider, useData } from './context/DataContext'
import { SimulatorVisitProvider, useSimulatorVisit } from './context/SimulatorVisitContext'
import { ImportModal } from './components/import/ImportModal'
import { AnalyticsPage } from './pages/AnalyticsPage'
import TruckRouteSimulator from './components/TruckRouteSimulator'
import { VisitDetailModal } from './components/VisitDetailModal'
import type { ReconstructedVisit } from './domain/events'
import { SITES, type SiteId } from './domain/sites'

type MainTab = 'analytics' | 'simulator'

function AppContent() {
  const { siteId, setSiteId } = useSite()
  const { setVisitToSimulate } = useSimulatorVisit()
  const { lastLoadedFileName } = useData()
  const prevSiteIdRef = useRef<string | null>(null)
  const [tab, setTab] = useState<MainTab>('analytics')
  const [detailVisit, setDetailVisit] = useState<ReconstructedVisit | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [topMenuOpen, setTopMenuOpen] = useState(false)

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
    setTab('simulator')
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="border-b border-violet-950 bg-[#1a1136] px-6 py-4 shadow-lg">
        <div className="relative flex min-h-[52px] items-center justify-center">
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            <button
              type="button"
              onClick={() => setTopMenuOpen((prev) => !prev)}
              className="rounded-lg border border-violet-300/35 bg-violet-900/45 px-3 py-1.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-800/70"
            >
              Menu
            </button>
            {topMenuOpen && (
              <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[290px] rounded-xl border border-violet-300/30 bg-[#22134a] p-3 shadow-2xl">
                <div className="space-y-3">
                  <div>
                    <label htmlFor="menu-vista" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-violet-200">
                      Vista
                    </label>
                    <select
                      id="menu-vista"
                      value={tab}
                      onChange={(e) => {
                        const next = e.target.value as MainTab
                        setTab(next)
                        if (next !== 'analytics') setDetailVisit(null)
                      }}
                      className="w-full rounded-lg border border-violet-300/30 bg-violet-950/55 px-3 py-1.5 text-sm font-medium text-violet-50 outline-none ring-violet-300/30 focus:ring-2"
                    >
                      <option value="analytics">Analítica</option>
                      <option value="simulator">Simulador</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="menu-planta" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-violet-200">
                      Planta
                    </label>
                    <select
                      id="menu-planta"
                      value={siteId}
                      onChange={(e) => setSiteId(e.target.value as SiteId)}
                      className="w-full rounded-lg border border-violet-300/30 bg-violet-950/55 px-3 py-1.5 text-sm font-medium text-violet-50 outline-none ring-violet-300/30 focus:ring-2"
                    >
                      {SITES.filter((s) => s.enabled).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setImportModalOpen(true)
                      setTopMenuOpen(false)
                    }}
                    className="w-full rounded-lg border border-violet-300/35 bg-violet-900/55 px-3 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-800/80"
                  >
                    {lastLoadedFileName ? 'Cambiar archivo' : 'Cargar archivo'}
                  </button>
                  <div className="text-[11px] text-violet-200/90">
                    <span className="font-semibold text-violet-100">Archivo:</span>{' '}
                    <span className="inline-block max-w-[220px] truncate align-bottom" title={lastLoadedFileName ?? ''}>
                      {lastLoadedFileName ?? 'Sin archivo cargado'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <h1 className="text-lg font-semibold tracking-wide text-violet-50">TRAZABILIDAD DE CAMIONES</h1>
        </div>
      </header>
      <main className="p-4">
        {tab === 'analytics' && (
          <AnalyticsPage
            onOpenDetail={openDetail}
            onSimulate={goToSimulator}
          />
        )}
        {tab === 'simulator' && <TruckRouteSimulator onOpenVisitDetail={openDetail} />}
      </main>

      {detailVisit && (
        <VisitDetailModal
          visit={detailVisit}
          onClose={() => setDetailVisit(null)}
          onSimulate={goToSimulator}
        />
      )}
      <ImportModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
    </div>
  )
}

function App() {
  return (
    <SiteProvider>
      <DataProvider>
        <SimulatorVisitProvider>
          <AppContent />
        </SimulatorVisitProvider>
      </DataProvider>
    </SiteProvider>
  )
}

export default App
