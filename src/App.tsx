import { Navigate, Route, Routes } from 'react-router-dom'

import { SiteProvider } from './context/SiteContext'
import { EtlWorkbenchProvider } from './features/real-truckflow/etlWorkbench/EtlWorkbenchContext'
import { AppShell } from './app/AppShell'
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
import { InicioTab } from './features/real-truckflow/tabs/InicioTab'
import { ProductoTransformTab } from './features/real-truckflow/tabs/ProductoTransformTab'
import { SeguridadTab } from './features/real-truckflow/tabs/SeguridadTab'

/**
 * Navegación por dominio (URL como fuente de verdad). Los providers envuelven al
 * router para que el pipeline ETL sobreviva al cambio de ruta. Cada sector monta
 * su componente autónomo directo; el monolito de diagnóstico histórico se retiró.
 */
function App() {
  return (
    <SiteProvider>
      <EtlWorkbenchProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/inicio" replace />} />
            <Route path="inicio" element={<InicioTab />} />
            <Route path="producto/:id" element={<ProductoTransformTab />} />
            <Route path="extraccion" element={<ExtraccionRoute />} />
            <Route path="analisis-local" element={<AnalisisLocalRoute />} />
            <Route path="transform" element={<TransformEtlTab />} />
            <Route path="kpi/tiempos" element={<KpiTiemposTab />} />
            <Route path="kpi/calada" element={<CaladaTab />} />
            <Route path="kpi/descargas" element={<DescargasTab />} />
            <Route path="seguridad" element={<SeguridadTab />} />
            <Route path="calibracion" element={<CalibracionCamarasRoute />} />
            <Route path="liquidos" element={<LiquidosRoute />} />
            <Route path="transile-interno" element={<TransileInternoRoute />} />
            <Route path="transile-externo" element={<TransileExternoRoute />} />
            <Route path="base-datos" element={<BaseDatosVisitasRoute />} />
            <Route path="*" element={<Navigate to="/inicio" replace />} />
          </Route>
        </Routes>
      </EtlWorkbenchProvider>
    </SiteProvider>
  )
}

export default App
