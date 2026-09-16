import { Navigate, Route, Routes } from 'react-router-dom'

import { SiteProvider } from './context/SiteContext'
import { EtlWorkbenchProvider } from './features/real-truckflow/etlWorkbench/EtlWorkbenchContext'
import { AppShell } from './app/AppShell'
import { LEGACY_ROUTE_REDIRECTS } from './app/sectors'
import { AnalisisLocalRoute, ExtraccionRoute } from './app/routeElements'
import {
  BaseDatosVisitasRoute,
  CalibracionCamarasRoute,
  LiquidosRoute,
  TransileExternoRoute,
  TransileInternoRoute,
} from './app/postTransformRoutes'
import { TransformEtlTab } from './features/real-truckflow/tabs/TransformEtlTab'
import { KpiTiemposTab } from './features/real-truckflow/tabs/KpiTiemposTab'
import { CaladaTab } from './features/real-truckflow/tabs/CaladaTab'
import { DescargasTab } from './features/real-truckflow/tabs/DescargasTab'
import { ProductoTransformTab } from './features/real-truckflow/tabs/ProductoTransformTab'
import { SeguridadTab } from './features/real-truckflow/tabs/SeguridadTab'
import { PlantHome } from './pages/PlantHome'
import { DataWorkspace } from './features/real-truckflow/dataPreparation/DataWorkspace'

/**
 * Navegación por dominio (URL como fuente de verdad). Los providers envuelven al
 * router para que el pipeline ETL sobreviva al cambio de ruta. Las pantallas
 * analíticas viven bajo /estadisticas/*; PlantHome es el index.
 */
function App() {
  return (
    <SiteProvider>
      <EtlWorkbenchProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<PlantHome />} />
            <Route path="en-vivo" element={<PlantHome />} />
            <Route path="producto/:id" element={<ProductoTransformTab />} />

            <Route path="estadisticas/indicadores/tiempos" element={<KpiTiemposTab />} />
            <Route path="estadisticas/indicadores/calada" element={<CaladaTab />} />
            <Route path="estadisticas/indicadores/descargas" element={<DescargasTab />} />
            <Route path="estadisticas/indicadores/anomalias" element={<SeguridadTab />} />

            <Route path="estadisticas/reportes/calibracion" element={<CalibracionCamarasRoute />} />
            <Route path="estadisticas/reportes/liquidos" element={<LiquidosRoute />} />
            <Route path="estadisticas/reportes/transile-interno" element={<TransileInternoRoute />} />
            <Route path="estadisticas/reportes/transile-externo" element={<TransileExternoRoute />} />
            <Route path="estadisticas/reportes/base-datos" element={<BaseDatosVisitasRoute />} />

            <Route path="estadisticas/datos" element={<DataWorkspace />} />
            <Route path="estadisticas/datos/extraccion" element={<ExtraccionRoute />} />
            <Route path="estadisticas/datos/analisis-local" element={<AnalisisLocalRoute />} />
            <Route path="estadisticas/reportes/resumen" element={<TransformEtlTab />} />

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
      </EtlWorkbenchProvider>
    </SiteProvider>
  )
}

export default App
