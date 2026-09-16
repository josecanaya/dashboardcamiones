import { useNavigate } from 'react-router-dom'
import { ExtraccionDatosTab } from '../features/real-truckflow/tabs/ExtraccionDatosTab'
import { AnalisisLocalTab } from '../features/real-truckflow/tabs/AnalisisLocalTab'

/** Extracción de datos: navega a Análisis local desde su CTA. */
export function ExtraccionRoute() {
  const navigate = useNavigate()
  return <ExtraccionDatosTab onGoToAnalysis={() => navigate('/analisis-local')} />
}

/** Análisis local: abre el informe ejecutivo desde su CTA. */
export function AnalisisLocalRoute() {
  const navigate = useNavigate()
  return <AnalisisLocalTab onOpenTransformTab={() => navigate('/estadisticas/reportes/resumen')} />
}
