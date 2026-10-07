import { useCallback, useEffect, useRef, useState } from 'react'
import { requestLiveCameraStream } from '../../services/live/liveCameraStreamApi'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; playerUrl: string; loaded: boolean }

/** Grilla según cuántas cámaras tenga el grupo: 1 grande, 2 en fila, 4+ en 2/3 columnas. */
function gridClassFor(count: number): string {
  if (count <= 1) return 'grid-cols-1'
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
        if (!cancelled) setState({ phase: 'ready', playerUrl: stream.playerUrl, loaded: false })
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
        <span className="font-mono text-xs font-bold text-cyan-300">{deviceCode}</span>
        {state.phase === 'ready' ? (
          // EV-29: abrir el reproductor no prueba que lleguen cuadros (iframe de otro origen).
          <span className="rounded-full bg-slate-500/15 px-1.5 py-0.5 text-xs font-bold text-slate-300 ring-1 ring-slate-500/40" title="El reproductor está abierto. Si la imagen no avanza, usá Reconectar.">
            {state.loaded ? 'Reproductor abierto' : 'Conectando reproductor…'}
          </span>
        ) : null}
      </figcaption>
      {state.phase === 'loading' && (
        <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 text-xs text-slate-400">
          Conectando…
        </div>
      )}
      {state.phase === 'error' && (
        // EV-30: mensaje operativo; el detalle técnico queda plegado para soporte.
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-slate-900/60 px-3 text-center">
          <p className="text-sm font-semibold text-amber-200">Cámara {deviceCode} no disponible</p>
          <p className="text-xs text-slate-300">Este punto queda sin video en vivo. Las demás cámaras siguen funcionando. Si persiste, reportalo a soporte.</p>
          <button type="button" onClick={retry} className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-xs font-bold text-cyan-100">
            Reintentar
          </button>
          <details className="max-w-full text-left text-[11px] text-slate-500">
            <summary className="cursor-pointer">Detalle para soporte</summary>
            <code className="select-all break-words">{deviceCode}: {state.message}</code>
          </details>
        </div>
      )}
      {state.phase === 'ready' && (
        <>
          <iframe
            src={state.playerUrl}
            title={`Cámara en vivo ${deviceCode}`}
            className="aspect-video w-full rounded-xl border border-slate-800 bg-black"
            allow="autoplay; fullscreen"
            onLoad={() => setState((s) => (s.phase === 'ready' ? { ...s, loaded: true } : s))}
          />
          <button type="button" onClick={retry} className="text-[11px] text-slate-400 underline">
            Reconectar si la imagen está congelada
          </button>
        </>
      )}
    </figure>
  )
}

/**
 * Modal con el video en vivo de una o varias cámaras (DSS → go2rtc → iframe local).
 * Al cerrar se desmontan los iframes y go2rtc suelta los RTSP al quedar sin consumidores.
 * <dialog> nativo (EV-31): foco contenido, fondo inerte, Escape y retorno del foco a quien lo abrió.
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
  return <CameraDialog list={list} title={title} onClose={onClose} />
}

function CameraDialog({ list, title, onClose }: { list: string[]; title?: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const el = ref.current
    el?.showModal()
    return () => {
      el?.close()
      opener?.focus?.()
    }
  }, [])
  const wide = list.length > 1
  return (
    <dialog
      ref={ref}
      aria-label={title ?? 'Cámaras en vivo'}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={`max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-0 shadow-2xl backdrop:bg-black/60 ${
        wide ? 'w-[min(96vw,1200px)]' : 'w-[min(92vw,780px)]'
      }`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{list.length > 1 ? `Cámaras en vivo · ${list.length}` : 'Cámara en vivo'}</p>
          <p className="font-mono text-sm font-bold text-cyan-300">{title ?? list.join(' · ')}</p>
        </div>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-sm font-bold text-slate-200 hover:border-slate-500"
        >
          Cerrar
        </button>
      </div>
      <div className={`grid gap-3 p-3 ${gridClassFor(list.length)}`}>
        {list.map((deviceCode) => (
          <CameraTile key={deviceCode} deviceCode={deviceCode} />
        ))}
      </div>
    </dialog>
  )
}
