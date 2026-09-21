import { type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { StatusChip } from '../../../components/ui/Interface'
import { useEtlWorkbench } from '../etlWorkbench/EtlWorkbenchContext'

const PAGE_TITLES: Record<string, [string, string]> = {
  tiempos: ['Tiempos de recorrido', 'Compará tramos y revisá su dispersión.'],
  calada: ['Calada', 'Actividad por sede, cámara y hora.'],
  descargas: ['Descargas', 'Actividad por plataforma y sede.'],
  anomalias: ['Anomalías', 'Priorizá los patrones y abrí la evidencia de cada recorrido.'],
  calibracion: ['Calibración', 'Contraste de movimientos según Excel y lecturas de cámara.'],
  liquidos: ['Líquidos S10', 'Movimientos y evidencia de mercadería líquida.'],
  'transile-interno': ['Transile interno', 'Seguimiento de movimientos dentro de planta.'],
  'transile-externo': ['Transile externo', 'Seguimiento entre Ricardone y San Lorenzo.'],
  'base-datos': ['Base de datos', 'Consultá y guardá las visitas preparadas.'],
  extraccion: ['Extracción', 'Descargá las fuentes que necesita el período.'],
  'analisis-local': ['Preparación de datos', 'Herramientas de carga, procesamiento y diagnóstico.'],
  resumen: ['Resumen ejecutivo', 'Circuitos, cobertura y evidencia para comité.'],
  'resumen-detalle': ['Informe detallado', 'Clasificación completa, conciliación y CSV de comité (diagnóstico).'],
  datos: ['Datos', 'Prepará un período para todos los indicadores y reportes.'],
  'editor-plano': ['Editor del plano', 'Definí sectores y cámaras sobre la vista cenital de la planta.'],
}

/**
 * Wrapper del shell: renderiza el h1 de la ruta y, fuera de la pantalla Datos,
 * una barra compacta con el período activo + limitaciones + link a Datos para cambiarlo.
 * En `/estadisticas/datos` no muestra la barra: `DataWorkspace` es el único editor (R06).
 */
export function HistoricalWorkspace({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const wb = useEtlWorkbench()
  if (pathname === '/' || pathname === '/en-vivo') return <>{children}</>

  const [title, description] = PAGE_TITLES[pathname.split('/').pop() ?? ''] ?? ['Ficha de producto', 'Detalle del período histórico activo.']
  const isDataPage = pathname === '/estadisticas/datos'

  const dp = wb.dataPreparation
  const active = dp.state.active
    ?? (wb.diskPeriod ? { from: wb.diskPeriod.startDate, to: wb.diskPeriod.endDate } : null)
  const limitations = dp.state.limitations
  const phase = dp.state.phase

  return (
    <div className="tf-ui space-y-4">
      <header>
        <p className="ui-label mb-1">Estadísticas</p>
        <h1 className="ui-title">{title}</h1>
        <p className="ui-muted mt-1">{description}</p>
      </header>

      {!isDataPage ? (
        <section className="ui-panel ui-period" aria-label="Período activo compartido">
          <div className="ui-period-summary">
            <span className="ui-label">Período activo</span>
            <strong>{active ? `${active.from} → ${active.to}` : 'Sin período cargado'}</strong>
            <StatusChip tone={
              phase === 'ready' ? 'success' :
              phase === 'failed' ? 'danger' :
              phase === 'interrupted' ? 'warning' :
              limitations.length ? 'warning' : 'neutral'
            }>
              {phase === 'ready' ? 'Listo' :
               phase === 'checking' ? 'Revisando…' :
               phase === 'downloading' ? 'Descargando…' :
               phase === 'processing' ? 'Procesando…' :
               phase === 'loading' ? 'Cargando…' :
               phase === 'failed' ? 'Con error' :
               phase === 'interrupted' ? 'Interrumpido' :
               active ? 'Cargado' : 'Sin dato'}
            </StatusChip>
            <Link className="ui-button" to="/estadisticas/datos">Cambiar período</Link>
          </div>
          {limitations.length ? (
            <ul className="mt-2" style={{ listStyle: 'disc', paddingLeft: 20, color: 'var(--ui-warning)', fontSize: 13 }}>
              {limitations.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          ) : null}
        </section>
      ) : null}

      <fieldset disabled={wb.periodBusy} className="min-w-0 border-0 p-0 m-0" aria-busy={wb.periodBusy}>
        {children}
      </fieldset>
    </div>
  )
}
