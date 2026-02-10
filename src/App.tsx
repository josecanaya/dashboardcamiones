import { useState, useEffect, useRef } from 'react'
import { SiteProvider, useSite } from './context/SiteContext'
import { DataProvider, useData } from './context/DataContext'
import { SimulatorVisitProvider, useSimulatorVisit } from './context/SimulatorVisitContext'
import { SiteSelector } from './components/SiteSelector'
import { ImportModal } from './components/import/ImportModal'
import { AnalyticsPage } from './pages/AnalyticsPage'
import TruckRouteSimulator from './components/TruckRouteSimulator'
import { VisitDetailModal } from './components/VisitDetailModal'
import type { ReconstructedVisit } from './domain/events'

type MainTab = 'analytics' | 'simulator'

function AppContent() {
  const { siteId } = useSite()
  const { setVisitToSimulate } = useSimulatorVisit()
  const { lastLoadedFileName } = useData()
  const prevSiteIdRef = useRef<string | null>(null)
  const [tab, setTab] = useState<MainTab>('analytics')
  const [detailVisit, setDetailVisit] = useState<ReconstructedVisit | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)

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
      <header className="border-b border-surface-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Trazabilidad de Camiones</h1>
            <p className="text-sm text-slate-500">Analítica · Simulador</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {lastLoadedFileName ? 'Cambiar archivo' : 'Cargar archivo'}
            </button>
            <span className="text-xs text-slate-500 max-w-[220px] truncate" title={lastLoadedFileName ?? ''}>
              {lastLoadedFileName ? `Archivo cargado: ${lastLoadedFileName}` : 'Sin archivo cargado'}
            </span>
            <SiteSelector />
          </div>
        </div>
        <nav className="flex gap-2 mt-3 border-t border-slate-100 pt-3 flex-wrap">
          {(['analytics', 'simulator'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); if (t !== 'analytics') setDetailVisit(null) }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === t ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t === 'analytics' ? 'Analítica' : 'Simulador'}
            </button>
          ))}
        </nav>
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
