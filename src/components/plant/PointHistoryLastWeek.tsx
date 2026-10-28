import { useEffect, useState } from 'react'
import { CaladaCamerasPanel, type CameraActivityLabels } from '../../features/real-truckflow/tabs/CaladaCamerasPanel'
import { loadPointHistory, type RangeCoverage } from '../../features/real-truckflow/public/analysis'
import { dayOf } from './PointHistoryModal'

export type History = { table: string; labels: CameraActivityLabels }

/** Últimos 7 días (hasta ayer) desde las corridas semanales guardadas, con el panel estándar por calle/cámara. */
export function LastWeek({ history }: { history: History | null }) {
  const to = dayOf(Date.now() - 86_400_000)
  const from = dayOf(Date.now() - 7 * 86_400_000)
  const [state, setState] = useState<{ phase: 'loading' } | { phase: 'ok'; csv?: string; coverage: RangeCoverage } | { phase: 'error'; msg: string }>({ phase: 'loading' })
  useEffect(() => {
    if (!history) return
    let alive = true
    ;(async () => {
      try {
        const { csv, coverage } = await loadPointHistory(history.table, from, to)
        if (alive) setState({ phase: 'ok', csv, coverage })
      } catch (e) {
        if (alive) setState({ phase: 'error', msg: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => { alive = false }
  }, [history, from, to])
  if (!history) return (
    <div className="ph-empty">
      <p>Este punto no tiene un panel por cámara en las corridas guardadas.</p>
    </div>
  )
  if (state.phase === 'loading') return <p className="ph-empty">Armando {from} → {to} desde las corridas guardadas…</p>
  if (state.phase === 'error') return <p className="ph-empty">No se pudo cargar el histórico: {state.msg}</p>
  const missing = state.coverage.missingDays
  return (
    <div>
      {missing.length ? <p className="ph-warn">Sin corrida guardada para {missing.length} día(s): {missing.join(', ')}. Procesá esa semana en «Datos» para completarlos.</p> : null}
      {state.csv
        ? <CaladaCamerasPanel csv={state.csv} checkedCircuits={new Set()} filterActive={false} periodLabel={`${from} → ${to}`} labels={history.labels} />
        : <p className="ph-empty">Las corridas de este período no tienen la tabla {history.table}.</p>}
    </div>
  )
}
