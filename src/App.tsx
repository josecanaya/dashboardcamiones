import { useState, useEffect, useRef } from 'react'

import { SiteProvider } from './context/SiteContext'

import { DataProvider } from './context/DataContext'

import { SimulatorVisitProvider } from './context/SimulatorVisitContext'

import { LogisticsOpsDeferredProvider } from './context/LogisticsOpsContext'

import { RealJourneyDiagnosticsPage } from './pages/RealJourneyDiagnosticsPage'



function AppContent() {

  const prevSiteIdRef = useRef<string | null>(null)



  useEffect(() => {

    prevSiteIdRef.current = null

  }, [])



  return (

    <div className="min-h-screen bg-surface-50">

      <main className="flex min-h-[calc(100vh-24px)] items-stretch gap-3 pt-3 pr-3 pb-3 pl-0">

        <aside className="h-[calc(100vh-24px)] w-[248px] shrink-0 border-r border-violet-900 bg-[#1a1136] p-3 text-violet-100">

          <div className="mb-4 flex flex-col items-center gap-2">

            <img src="/logo_sinfondo.png" alt="Truckflow" className="h-12 w-auto max-w-[200px] object-contain" />

            <span className="text-lg font-bold tracking-tight text-violet-100">Truckflow</span>

          </div>

          <div className="rounded-lg border border-violet-700/40 bg-violet-900/35 p-3 text-[11px] leading-relaxed text-violet-200/95">

            <p className="font-semibold text-violet-100">Datos reales</p>

            <p className="mt-2 text-violet-300/90">

              Consola en vivo + pipeline ETL desde la API Truckflow. Sin mock ni simulador IFC.

            </p>

          </div>

        </aside>



        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 self-stretch overflow-auto">

          <section className="flex shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">

            <img src="/logo.png" alt="Logo empresa" className="h-14 max-w-[260px] object-contain" />

          </section>

          <RealJourneyDiagnosticsPage />

        </div>

      </main>

    </div>

  )

}



function AppProviders() {

  return (

    <SiteProvider>

      <DataProvider>

        <LogisticsOpsDeferredProvider>

          <SimulatorVisitProvider>

            <AppContent />

          </SimulatorVisitProvider>

        </LogisticsOpsDeferredProvider>

      </DataProvider>

    </SiteProvider>

  )

}



function App() {

  return <AppProviders />

}



export default App

