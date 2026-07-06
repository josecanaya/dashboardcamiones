import type { TransformTramoId, TransformTramoStatus } from '../etlWorkbench/etlTransformPhaseRunner'

const TRAMO_META: { id: TransformTramoId; title: string; hint: string }[] = [
  {
    id: 1,
    title: 'Limpieza Excel',
    hint: 'Solo XLSX: patente, producto, plataforma, horarios. Sin Truckflow.',
  },
  {
    id: 2,
    title: 'Buscar en Truckflow',
    hint: 'Cruce por las patentes del Excel (JSON API). Ignora journeys irrelevantes.',
  },
  {
    id: 3,
    title: 'Circuitos y comité',
    hint: 'Matriz y tramos sobre el merge ya hecho.',
  },
]

function statusLabel(status: TransformTramoStatus, active: boolean): string {
  if (active) return 'En curso…'
  if (status === 'done') return 'Listo'
  if (status === 'error') return 'Error'
  if (status === 'running') return 'En curso…'
  return 'Pendiente'
}

function cardBorder(
  status: TransformTramoStatus,
  active: boolean,
  isNext: boolean
): string {
  if (active || status === 'running') return 'border-amber-400 ring-2 ring-amber-200/80'
  if (status === 'done') return 'border-emerald-400 bg-emerald-50/40'
  if (status === 'error') return 'border-rose-400 bg-rose-50/40'
  if (isNext) return 'border-sky-300 bg-sky-50/30'
  return 'border-slate-200 bg-slate-50/80'
}

type Props = {
  tramoStatus: Record<TransformTramoId, TransformTramoStatus>
  activeTramo: TransformTramoId | null
  tramoCompleted: 0 | 1 | 2 | 3
  hasXlsx: boolean
  disabled: boolean
  runAllInProgress: boolean
  onRunTramo: (tramo: TransformTramoId) => void
  onRunAll: () => void
}

export function TransformPhaseStepper({
  tramoStatus,
  activeTramo,
  tramoCompleted,
  hasXlsx,
  disabled,
  runAllInProgress,
  onRunTramo,
  onRunAll,
}: Props) {
  const canRun1 = hasXlsx
  const canRun2 = hasXlsx ? tramoCompleted >= 1 : true
  const canRun3 = tramoCompleted >= 2

  const nextSuggested: TransformTramoId | null =
    hasXlsx ?
      tramoCompleted < 1 ? 1
      : tramoCompleted < 2 ? 2
      : tramoCompleted < 3 ? 3
      : null
    : tramoCompleted < 2 ? 2
    : tramoCompleted < 3 ? 3
    : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">
          Ejecutá en orden o usá <strong>Procesar todo</strong>. Excel → journeys → circuitos.
        </p>
        <button
          type="button"
          disabled={disabled || runAllInProgress}
          onClick={onRunAll}
          className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {runAllInProgress ?
            hasXlsx ?
              'Procesando 1→2→3…'
            : 'Procesando 2→3…'
          : hasXlsx ?
            'Procesar todo (1→2→3)'
          : 'Procesar todo (2→3)'}
        </button>
      </div>

      <ol className="relative space-y-0">
        {TRAMO_META.map((t, idx) => {
          const st = tramoStatus[t.id]
          const active = activeTramo === t.id || (runAllInProgress && st === 'running')
          const isNext = nextSuggested === t.id && !disabled && !active
          const runDisabled =
            disabled ||
            active ||
            runAllInProgress ||
            (t.id === 1 && !canRun1) ||
            (t.id === 2 && !canRun2) ||
            (t.id === 3 && !canRun3)

          return (
            <li key={t.id} className="relative flex gap-4 pb-6 last:pb-0">
              {idx < TRAMO_META.length - 1 ?
                <span
                  className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-slate-200"
                  aria-hidden
                />
              : null}
              <div
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  st === 'done' ? 'bg-emerald-600 text-white'
                  : active ? 'bg-amber-500 text-white'
                  : 'bg-slate-200 text-slate-700'
                }`}
              >
                {t.id}
              </div>
              <div
                className={`min-w-0 flex-1 rounded-xl border p-3 ${cardBorder(st, active, isNext)}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{t.title}</h4>
                    <p className="mt-0.5 text-[11px] text-slate-600">{t.hint}</p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {statusLabel(st, active)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={runDisabled}
                    onClick={() => onRunTramo(t.id)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {active ? 'Procesando…' : `Ejecutar paso ${t.id}`}
                  </button>
                  {isNext && !active ?
                    <span className="self-center text-[11px] font-medium text-sky-800">
                      Siguiente recomendado
                    </span>
                  : null}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
