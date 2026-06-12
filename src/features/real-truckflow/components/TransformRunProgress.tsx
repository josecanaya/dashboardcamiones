import { useEffect, useState } from 'react'
import type { TransformTramoId } from '../etlWorkbench/etlTransformPhaseRunner'
import type { ContractFirstProgressEvent } from '../etlWorkbench/etlContractFirstProgress'

const TRAMO_LABEL: Record<TransformTramoId, string> = {
  1: 'Paso 1 — Journeys y calidad',
  2: 'Paso 2 — Circuitos y comité',
  3: 'Paso 3 — Movimientos por contrato',
}

type Props = {
  active: boolean
  activeTramo: TransformTramoId | null
  runAll: boolean
  contractFirst?: ContractFirstProgressEvent | null
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m > 0) return `${m} min ${rs} s`
  return `${rs} s`
}

export function TransformRunProgress({ active, activeTramo, runAll, contractFirst }: Props) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (active) {
      setStartedAt((t) => t ?? Date.now())
      const id = window.setInterval(() => setTick((n) => n + 1), 1000)
      return () => clearInterval(id)
    }
    setStartedAt(null)
    setTick(0)
    return undefined
  }, [active])

  if (!active) return null

  const elapsed = startedAt ? formatElapsed(Date.now() - startedAt) : '—'
  void tick

  const stepLabel =
    activeTramo ? TRAMO_LABEL[activeTramo]
    : runAll ? 'Procesando pasos 1→2→3'
    : 'Procesando…'

  const showPaso3Detail = Boolean(contractFirst && activeTramo === 3)
  const progressPct =
    contractFirst && contractFirst.total > 0 ?
      Math.min(100, Math.round((contractFirst.current / contractFirst.total) * 100))
    : null
  const longMsg =
    contractFirst?.details?.longRunning ?
      String(contractFirst.details.message ?? '')
    : null

  return (
    <div
      className="rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-sm text-amber-950"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{stepLabel}</p>
        <span className="font-mono text-xs text-amber-800">Tiempo: {elapsed}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
        Podés seguir en esta página. No hace falta cambiar de pestaña; cuando termine cada paso verás el resumen
        abajo. Si el navegador tarda en responder, es normal en pasos largos.
      </p>
      {showPaso3Detail && contractFirst ?
        <div className="mt-3 rounded-lg border border-amber-400/60 bg-white/70 px-3 py-2 text-xs text-slate-800">
          <div className="grid gap-1 sm:grid-cols-2">
            <div>
              <span className="font-semibold text-slate-600">Última acción: </span>
              {contractFirst.label}
            </div>
            <div>
              <span className="font-semibold text-slate-600">Tiempo corrida: </span>
              <span className="font-mono">{formatElapsed(contractFirst.elapsedMs)}</span>
            </div>
            {progressPct !== null ?
              <div>
                <span className="font-semibold text-slate-600">Progreso: </span>
                {contractFirst.current.toLocaleString()} / {contractFirst.total.toLocaleString()} (
                {progressPct}%)
              </div>
            : null}
            {contractFirst.details?.match_exact !== undefined ?
              <div>
                <span className="font-semibold text-slate-600">Matches (resumen): </span>
                exactos {String(contractFirst.details.match_exact)}, fuzzy patente{' '}
                {String(contractFirst.details.match_fuzzy_plate ?? '—')}
              </div>
            : null}
          </div>
          {longMsg ?
            <p className="mt-2 font-medium text-amber-900">{longMsg}</p>
          : null}
        </div>
      : null}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/80">
        {progressPct !== null && showPaso3Detail ?
          <div
            className="h-full rounded-full bg-amber-600 transition-all duration-300"
            style={{ width: `${Math.max(4, progressPct)}%` }}
          />
        : <div className="h-full w-1/3 animate-pulse rounded-full bg-amber-600" />}
      </div>
    </div>
  )
}
