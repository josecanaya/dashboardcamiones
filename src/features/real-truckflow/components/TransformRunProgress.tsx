import { useEffect, useState } from 'react'
import type { TransformTramoId } from '../etlWorkbench/etlTransformPhaseRunner'

const TRAMO_LABEL: Record<TransformTramoId, string> = {
  1: 'Paso 1 — Journeys y calidad',
  2: 'Paso 2 — Circuitos y comité',
  3: 'Paso 3 — Movimientos por contrato',
}

type Props = {
  active: boolean
  activeTramo: TransformTramoId | null
  runAll: boolean
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m > 0) return `${m} min ${rs} s`
  return `${rs} s`
}

export function TransformRunProgress({ active, activeTramo, runAll }: Props) {
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
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/80">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-amber-600" />
      </div>
    </div>
  )
}
