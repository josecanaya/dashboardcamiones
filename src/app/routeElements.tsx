import { useNavigate } from 'react-router-dom'
import { ExtraccionDatosTab } from '../features/real-truckflow/tabs/ExtraccionDatosTab'
import { AnalisisLocalTab } from '../features/real-truckflow/tabs/AnalisisLocalTab'

/**
 * Adaptadores legacy conservados (R08): los CTAs internos ahora apuntan a la pantalla
 * Datos unificada con `?vista=` para abrir el Disclosure correspondiente. Los ancianos
 * routes `/estadisticas/datos/extraccion` y `/estadisticas/datos/analisis-local` ya no
 * están registrados en App.tsx; las URLs viejas caen en LEGACY_ROUTE_REDIRECTS.
 */
export function ExtraccionRoute() {
  const navigate = useNavigate()
  return <ExtraccionDatosTab onGoToAnalysis={() => navigate('/estadisticas/datos?vista=analisis-avanzado')} />
}

export function AnalisisLocalRoute() {
  const navigate = useNavigate()
  return <AnalisisLocalTab onOpenTransformTab={() => navigate('/estadisticas/reportes/resumen')} />
}
