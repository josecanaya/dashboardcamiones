import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button, StatusChip } from '../../../components/ui/Interface'
import { useEtlWorkbench } from '../etlWorkbench/EtlWorkbenchContext'
import { historicalWeeks, validHistoricalRange } from '../etlWorkbench/historicalPeriodLoader'
import { previousCalendarWeekRange } from '../utils/weekDateRange'

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
}

/** Se monta una sola vez en el shell; el contexto permanece al cambiar de pantalla. */
export function HistoricalWorkspace({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const wb = useEtlWorkbench()
  const active = wb.cachedWindow ? { startDate: wb.cachedWindow.from, endDate: wb.cachedWindow.to }
    : wb.composedRange ? { startDate: wb.composedRange.from, endDate: wb.composedRange.to } : wb.diskPeriod
  const defaults = previousCalendarWeekRange()
  const [from, setFrom] = useState(wb.diskPeriod?.startDate ?? defaults.startDate)
  const [to, setTo] = useState(wb.diskPeriod?.endDate ?? defaults.endDate)
  useEffect(() => {
    if (active) { setFrom(active.startDate); setTo(active.endDate) }
  }, [active?.startDate, active?.endDate])
  if (pathname === '/' || pathname === '/en-vivo') return <>{children}</>
  const busy = wb.periodBusy || wb.transformBusy || wb.busyLoad || wb.kpiTiemposBusy || wb.savedWindowsLoading
  const range = { from, to }
  const valid = validHistoricalRange(range)
  const inspection = wb.periodInspection
  const matches = inspection?.range.from === from && inspection.range.to === to
  const missing = matches ? inspection.coverage.missingDays : []
  const pendingWeeks = valid ? historicalWeeks(range).filter(w => missing.some(d => d >= w.from && d <= w.to)) : []
  const [title, description] = PAGE_TITLES[pathname.split('/').pop() ?? ''] ?? ['Ficha de producto', 'Detalle del período histórico activo.']
  return <div className="tf-ui space-y-4">
    <header><p className="ui-label mb-1">Estadísticas</p><h1 className="ui-title">{title}</h1><p className="ui-muted mt-1">{description}</p></header>
    <section className="ui-panel ui-period" aria-label="Período histórico compartido" aria-busy={wb.periodBusy}>
      <div className="ui-period-summary">
        <span className="ui-label">Período activo en todas las pantallas</span>
        <strong>{active ? `${active.startDate} → ${active.endDate}` : 'Sin período cargado'}</strong>
        <StatusChip tone={wb.cachedWindow?.stale ? 'warning' : wb.transformResult ? 'success' : 'neutral'}>
          {wb.periodBusy ? 'Cargando…' : wb.composedRange?.missingDays.length ? 'Cobertura parcial' : wb.cachedWindow?.stale ? 'Reglas desactualizadas' : wb.transformResult ? 'Listo' : 'Sin dato'}
        </StatusChip>
      </div>
      {wb.composedRange ? <p className="ui-label mt-2">Compuesto desde {wb.composedRange.usedRunIds.length} corridas. Los tiempos sin fecha por tramo abarcan las corridas completas; los conteos con fecha se acotan al rango.</p> : null}
      {wb.composedRange?.missingDays.length ? <p className="ui-message ui-message--warning mt-2">Días no incluidos: {wb.composedRange.missingDays.join(', ')}. Los resultados corresponden solo a la cobertura disponible.</p> : null}
      <details className="ui-period-editor" open={!active || undefined}>
        <summary>Cambiar período o revisar disponibilidad</summary>
        <form className="ui-period-form" onSubmit={e => { e.preventDefault(); if (valid && !busy) void wb.activateHistoricalPeriod(range) }}>
          <label><span className="ui-label">Desde</span><input className="ui-input" type="date" required value={from} onChange={e => setFrom(e.target.value)} disabled={busy} /></label>
          <label><span className="ui-label">Hasta</span><input className="ui-input" type="date" required min={from} value={to} onChange={e => setTo(e.target.value)} disabled={busy} /></label>
          <Button primary type="submit" disabled={!valid || busy}>Usar período</Button>
          <Button disabled={busy} onClick={() => { const w = previousCalendarWeekRange(); setFrom(w.startDate); setTo(w.endDate); void wb.activateHistoricalPeriod({ from: w.startDate, to: w.endDate }) }}>Semana anterior</Button>
        </form>
        {missing.length ? <div className="ui-message ui-message--warning mt-3" role="status">
          <strong>{inspection?.staleWindows.length ? 'Hay semanas desactualizadas' : 'Faltan días procesados'}: {missing.length} día(s) sin cobertura vigente.</strong>
          <p>El período activo de arriba se conserva hasta completar la carga.</p>
          <details className="mt-2"><summary>Días y semanas que requieren preparación</summary><p>{missing.join(', ')}</p><p>Se procesará por semanas: {pendingWeeks.map(w => `${w.from} → ${w.to}`).join(' · ')}</p></details>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void wb.activateHistoricalPeriod(range, true)}>Procesar semanas necesarias</Button>
            <Link className="ui-button" to="/estadisticas/datos/extraccion">Extraer fuentes faltantes</Link>
          </div>
        </div> : null}
        <details className="mt-3"><summary>Semanas guardadas ({wb.savedWindows.length})</summary>
          <p className="ui-label mt-2">Se verifica su vigencia al abrir. Las semanas calendario van de lunes a domingo.</p>
          <div className="ui-period-runs">{wb.savedWindows.map(w => <Button key={w.runId} disabled={busy} onClick={() => { setFrom(w.from); setTo(w.to); void wb.activateHistoricalPeriod({ from: w.from, to: w.to }) }}>
            <span>{w.from} → {w.to}</span><StatusChip tone={w.stale ? 'warning' : 'neutral'}>{w.stale ? 'Requiere proceso' : 'Guardado'}</StatusChip>
          </Button>)}</div>
        </details>
      </details>
      {wb.periodProgress ? <p className="ui-message mt-3" role="status">{wb.periodProgress}</p> : null}
      {wb.periodError ? <div className="ui-message ui-message--error mt-3" role="alert"><strong>No se pudo cambiar el período.</strong> {wb.periodError}<p>Los datos activos se conservan. Podés volver a intentar.</p></div> : null}
    </section>
    <fieldset disabled={wb.periodBusy} className="min-w-0 border-0 p-0 m-0" aria-busy={wb.periodBusy}>{children}</fieldset>
  </div>
}
