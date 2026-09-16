import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Interface'
import { useEtlWorkbench } from '../etlWorkbench/EtlWorkbenchContext'
import { getMovimientosBackupCoverage } from '../api/movimientosBackupApi'
import type { MovimientosBackupDay } from '../api/movimientosBackupApi'
import { PeriodEditor } from './PeriodEditor'
import { SourceCoverageCards } from './SourceCoverageCards'
import { PreparationProgress } from './PreparationProgress'
import { AdvancedDataTools } from './AdvancedDataTools'
import type { PreparationInspection } from './preparationRunner'
import { useLocation } from 'react-router-dom'

/**
 * Pantalla única de preparación de datos (R06). Ensambla:
 *   1. PeriodEditor — el único formulario Desde/Hasta de la app.
 *   2. SourceCoverageCards — disponibilidad legible de cámaras/Excel/proceso.
 *   3. PreparationProgress — plan del runner, progreso, error, limitaciones.
 *   4. CTA principal única según el contrato §5.
 * En estado `ready` muestra enlaces a las pantallas que consumen el período.
 *
 * `dataPreparation` viene del provider (instancia única, R05). Ninguna acción
 * dispara POSTs de descarga/proceso hasta que el usuario apriete la CTA.
 */
export function DataWorkspace(): JSX.Element {
  const wb = useEtlWorkbench()
  const dp = wb.dataPreparation
  const { state } = dp
  const location = useLocation()
  const vista = new URLSearchParams(location.search).get('vista')
  const initialSection: 'extraccion' | 'analisis' | null =
    vista === 'extraccion-avanzada' ? 'extraccion' :
    vista === 'analisis-avanzado' ? 'analisis' : null

  const [inspection, setInspection] = useState<PreparationInspection | null>(null)
  const [excelDays, setExcelDays] = useState<MovimientosBackupDay[]>([])
  const [excelAck, setExcelAck] = useState(false)
  const [inspectError, setInspectError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const cov = await getMovimientosBackupCoverage()
        setExcelDays(cov.days ?? [])
      } catch {
        setExcelDays([])
      }
    })()
  }, [])

  const runInspect = useCallback(async () => {
    setInspectError(null)
    try {
      const plan = await dp.inspect({ excelIncompleteAcknowledged: excelAck })
      setInspection(plan)
    } catch (e) {
      setInspectError(e instanceof Error ? e.message : String(e))
    }
  }, [dp, excelAck])

  const runExecute = useCallback(async () => {
    if (!inspection) return
    try {
      await dp.execute(inspection)
    } catch (e) {
      setInspectError(e instanceof Error ? e.message : String(e))
    }
  }, [dp, inspection])

  const isBusy = ['checking', 'downloading', 'processing', 'loading'].includes(state.phase)
  const activeSummary = state.active ? `${state.active.from} → ${state.active.to}` : null

  const requiresExcelDecision = inspection?.requiresExcelDecision ?? false
  const cta = pickCta(state.phase, inspection, requiresExcelDecision)

  return (
    <div className="tf-ui space-y-4">
      <PeriodEditor
        draft={state.draft}
        onChange={dp.setDraft}
        onInspect={runInspect}
        busy={isBusy}
        activeSummary={activeSummary}
      />

      {inspectError ? (
        <div className="ui-message ui-message--error" role="alert">
          <strong>No se pudo comprobar disponibilidad.</strong> {inspectError}
        </div>
      ) : null}

      <SourceCoverageCards
        state={state}
        excelCoverage={excelDays}
        hasActiveRun={Boolean(inspection?.usesFullyCachedCoverage)}
      />

      {requiresExcelDecision ? (
        <div className="ui-message ui-message--warning" role="status">
          <p><strong>Cobertura Excel incompleta</strong> — {state.missingExcelDays.length} día(s) sin filas en el backup.</p>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <input
              type="checkbox"
              checked={excelAck}
              onChange={e => setExcelAck(e.target.checked)}
              disabled={isBusy}
            />
            <span>Continuar con cobertura Excel incompleta (queda registrado como limitación de la sesión).</span>
          </label>
        </div>
      ) : null}

      {inspection ? (
        <PreparationProgress state={state} onStop={dp.requestStop} />
      ) : null}

      <section className="ui-panel" aria-label="Acción principal">
        <p className="ui-label mb-2">Próximo paso</p>
        <div className="flex flex-wrap gap-2" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {cta.kind === 'inspect' ? (
            <Button primary disabled={isBusy || !isValidDraft(state.draft)} onClick={runInspect}>
              Revisar disponibilidad
            </Button>
          ) : cta.kind === 'openData' ? (
            <Button primary disabled={isBusy} onClick={runExecute}>
              Abrir datos
            </Button>
          ) : cta.kind === 'prepare' ? (
            <Button primary disabled={isBusy || requiresExcelDecision} onClick={runExecute}>
              Preparar datos
            </Button>
          ) : cta.kind === 'downloadAndPrepare' ? (
            <Button primary disabled={isBusy || requiresExcelDecision} onClick={runExecute}>
              Descargar y preparar
            </Button>
          ) : cta.kind === 'retry' ? (
            <Button primary disabled={isBusy} onClick={() => void dp.retry()}>
              Reintentar pendientes
            </Button>
          ) : null}
          {cta.message ? <p className="ui-muted" style={{ fontSize: 13 }}>{cta.message}</p> : null}
        </div>

        {state.phase === 'ready' ? (
          <div className="mt-3" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link className="ui-button" to="/estadisticas/indicadores/tiempos">Ver tiempos</Link>
            <Link className="ui-button" to="/estadisticas/reportes/resumen">Ver resumen ejecutivo</Link>
            <Link className="ui-button" to="/estadisticas/indicadores/anomalias">Ver anomalías</Link>
          </div>
        ) : null}
      </section>

      <AdvancedDataTools
        initialSection={initialSection}
        onExcelIngested={() => { void runInspect() }}
      />
    </div>
  )
}

function isValidDraft(range: { from: string; to: string }): boolean {
  return Boolean(range.from) && Boolean(range.to) && range.from <= range.to
}

type Cta =
  | { kind: 'inspect'; message: string }
  | { kind: 'openData'; message: string }
  | { kind: 'prepare'; message: string }
  | { kind: 'downloadAndPrepare'; message: string }
  | { kind: 'retry'; message: string }
  | { kind: 'none'; message: string }

function pickCta(
  phase: string,
  inspection: PreparationInspection | null,
  requiresExcelDecision: boolean
): Cta {
  if (!inspection) return { kind: 'inspect', message: 'Elegí un rango y revisá qué falta antes de descargar o procesar.' }
  if (requiresExcelDecision) return { kind: 'none', message: 'Decidí qué hacer con los días de Excel faltantes antes de continuar.' }
  if (phase === 'ready') return { kind: 'none', message: 'Datos listos: abrí un indicador o reporte para verlos.' }
  if (phase === 'failed' || phase === 'interrupted') {
    return { kind: 'retry', message: 'La operación anterior no terminó. Revisá el detalle y reintentá los pendientes.' }
  }
  if (inspection.usesFullyCachedCoverage) {
    return { kind: 'openData', message: 'Hay una corrida vigente que cubre el rango. Abrir carga las tablas sin reprocesar.' }
  }
  const hasDownloads = inspection.steps.some(s => s.kind === 'download')
  if (hasDownloads) return { kind: 'downloadAndPrepare', message: 'Faltan fuentes por descargar; se procesa y carga a continuación.' }
  return { kind: 'prepare', message: 'Fuentes disponibles; falta procesar el rango y cargar las tablas.' }
}
