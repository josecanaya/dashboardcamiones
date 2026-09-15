import { useCallback, useEffect, useState } from 'react'
import { requestLiveCameraStream } from '../../services/live/liveCameraStreamApi'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; playerUrl: string }

/** Grilla según cuántas cámaras tenga el grupo: 1 grande, 2 en fila, 4+ en 2/3 columnas. */
function gridClassFor(count: number): string {
  if (count <= 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2'
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2'
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
}

/** Un recuadro por cámara: cada uno pide su propio stream y falla por separado. */
function CameraTile({ deviceCode }: { deviceCode: string }) {
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [retryTick, setRetryTick] = useState(0)

  const retry = useCallback(() => setRetryTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setState({ phase: 'loading' })
    requestLiveCameraStream(deviceCode)
      .then((stream) => {
        if (!cancelled) setState({ phase: 'ready', playerUrl: stream.playerUrl })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [deviceCode, retryTick])

  return (
    <figure className="m-0 space-y-1">
      <figcaption className="flex items-center justify-between gap-2 px-0.5">
        <span className="font-mono text-[11px] font-bold text-cyan-300">{deviceCode}</span>
        {state.phase === 'ready' ? (
          <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-400 ring-1 ring-rose-500/40">
            En vivo
          </span>
        ) : null}
      </figcaption>
      {state.phase === 'loading' && (
        <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 text-[11px] text-slate-400">
          Conectando…
        </div>
      )}
      {state.phase === 'error' && (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-slate-900/60 px-3 text-center">
          <p className="text-[11px] leading-snug text-amber-200">{state.message}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold text-cyan-100"
          >
            Reintentar
          </button>
        </div>
      )}
      {state.phase === 'ready' && (
        <iframe
          src={state.playerUrl}
          title={`Cámara en vivo ${deviceCode}`}
          className="aspect-video w-full rounded-xl border border-slate-800 bg-black"
          allow="autoplay; fullscreen"
        />
      )}
    </figure>
  )
}

/**
 * Modal con el video en vivo de una o varias cámaras (DSS → go2rtc → iframe local).
 * Al cerrar se desmontan los iframes y go2rtc suelta los RTSP al quedar sin consumidores.
 */
export function LiveCameraPlayerModal({
  open,
  devices,
  title,
  onClose,
}: {
  open: boolean
  devices: string[] | null
  title?: string
  onClose: () => void
}) {
  const list = devices ?? []
  if (!open || list.length === 0) return null

  const wide = list.length > 1

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} aria-hidden />
      <div
        className={`fixed left-1/2 top-1/2 z-50 max-h-[92vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl ${
          wide ? 'w-[min(96vw,1200px)]' : 'w-[min(92vw,780px)]'
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {list.length > 1 ? `Cámaras en vivo · ${list.length}` : 'Cámara en vivo'}
            </p>
            <p className="font-mono text-sm font-bold text-cyan-300">{title ?? list.join(' · ')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-sm font-bold text-slate-200 hover:border-slate-500"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className={`grid gap-3 p-3 ${gridClassFor(list.length)}`}>
          {list.map((deviceCode) => (
            <CameraTile key={deviceCode} deviceCode={deviceCode} />
          ))}
        </div>
      </div>
    </>
  )
}
