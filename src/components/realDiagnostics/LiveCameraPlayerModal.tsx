import { useCallback, useEffect, useState } from 'react'
import { requestLiveCameraStream } from '../../services/live/liveCameraStreamApi'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; playerUrl: string }

/**
 * Modal con el video en vivo de una cámara (DSS → go2rtc → iframe local).
 * Al cerrar se desmonta el iframe y go2rtc suelta el RTSP al quedar sin consumidores.
 */
export function LiveCameraPlayerModal({
  open,
  deviceCode,
  onClose,
}: {
  open: boolean
  deviceCode: string | null
  onClose: () => void
}) {
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [retryTick, setRetryTick] = useState(0)

  const retry = useCallback(() => setRetryTick((t) => t + 1), [])

  useEffect(() => {
    if (!open || !deviceCode) return
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
  }, [open, deviceCode, retryTick])

  if (!open || !deviceCode) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} aria-hidden />
      <div className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,780px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cámara en vivo</p>
            <p className="font-mono text-sm font-bold text-cyan-300">{deviceCode}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-400 ring-1 ring-rose-500/40">
              En vivo
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-sm font-bold text-slate-200 hover:border-slate-500"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="p-3">
          {state.phase === 'loading' && (
            <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 text-sm text-slate-400">
              Conectando con la cámara…
            </div>
          )}
          {state.phase === 'error' && (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border border-amber-500/30 bg-slate-900/60 px-6 text-center">
              <p className="text-sm text-amber-200">{state.message}</p>
              <button
                type="button"
                onClick={retry}
                className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-bold text-cyan-100"
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
        </div>
      </div>
    </>
  )
}
