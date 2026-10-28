import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AnalysisProvider } from './context/AnalysisContext'
import { AppShell } from './app/AppShell'
import { LEGACY_ROUTE_REDIRECTS } from './app/sectors'
import { LiveMonitorPage } from './pages/LiveMonitorPage'

// Fuera de En vivo todo se carga al entrar: abrir la app baja solo el monitoreo.
const PlantHome = lazy(() => import('./pages/PlantHome').then(m => ({ default: m.PlantHome })))
const SimulacionPage = lazy(() => import('./pages/SimulacionPage').then(m => ({ default: m.SimulacionPage })))
const DatosPage = lazy(() => import('./pages/DatosPage').then(m => ({ default: m.DatosPage })))

/** Navegación por dominio (URL como fuente de verdad): En vivo, Simulación y Datos. */
function App() {
  return (
    <AnalysisProvider>
      <Suspense fallback={null}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<LiveMonitorPage />} />
            <Route path="en-vivo" element={<LiveMonitorPage />} />
            <Route path="en-vivo/detalle" element={<PlantHome />} />
            <Route path="simulacion" element={<SimulacionPage />} />
            <Route path="datos" element={<DatosPage />} />

            {LEGACY_ROUTE_REDIRECTS.map(({ from, to }) => (
              <Route
                key={from}
                path={from.replace(/^\//, '')}
                element={<Navigate to={to} replace />}
              />
            ))}

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </AnalysisProvider>
  )
}

export default App
