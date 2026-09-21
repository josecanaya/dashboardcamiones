import { Navigate, Route, Routes } from 'react-router-dom'

import { SiteProvider } from './context/SiteContext'
import { EtlWorkbenchProvider } from './features/real-truckflow/etlWorkbench/EtlWorkbenchContext'
import { AppShell } from './app/AppShell'
import { LEGACY_ROUTE_REDIRECTS } from './app/sectors'
import {
  BaseDatosVisitasRoute,
  CalibracionCamarasRoute,
  LiquidosRoute,
  TransileExternoRoute,
  TransileInternoRoute,
} from './app/postTransformRoutes'
import { ExecutiveSummaryTab } from './features/real-truckflow/tabs/ExecutiveSummaryTab'
import { InicioTab } from './features/real-truckflow/tabs/InicioTab'
import { KpiTiemposTab } from './features/real-truckflow/tabs/KpiTiemposTab'
import { CaladaTab } from './features/real-truckflow/tabs/CaladaTab'
import { DescargasTab } from './features/real-truckflow/tabs/DescargasTab'
import { ProductoTransformTab } from './features/real-truckflow/tabs/ProductoTransformTab'
import { SeguridadTab } from './features/real-truckflow/tabs/SeguridadTab'
import { PlantHome } from './pages/PlantHome'
import { PlantLayoutEditorPage } from './pages/PlantLayoutEditorPage'
import { HomeUxPrototype } from './pages/HomeUxPrototype'
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
            {/* Herramienta de configuración del plano (ubicar puntos clickeando la imagen). */}
            <Route path="herramientas/editor-plano" element={<PlantLayoutEditorPage />} />
            <Route path="herramientas/prototipo-home" element={<HomeUxPrototype />} />

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
            <Route path="estadisticas/reportes/resumen" element={<InicioTab />} />
            {/* Informe detallado del Transform (donuts, conciliación, CSV DEV de comité). */}
            {/* Sin entrada en el sidebar: acceso directo por URL para diagnóstico/exportes. */}
            <Route path="estadisticas/reportes/resumen-detalle" element={<ExecutiveSummaryTab />} />

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
