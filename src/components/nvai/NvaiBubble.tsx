import { useEffect, useRef, useState } from 'react'
import { NvaiPanel } from './NvaiPanel'
import type { NvaiFocus } from './nvaiApi'

export type NvaiBubbleProps = {
  site?: string
  focus?: NvaiFocus | string | null
}

/**
 * Burbuja global 56px abajo-derecha. Al abrir: panel 400px pegado a la derecha,
 * sin oscurecer ni tapar el fondo.
 */
export function NvaiBubble({ site = 'ricardone', focus = null }: NvaiBubbleProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(() => {
    const fallback = { x: Math.max(8, window.innerWidth - 104), y: Math.max(8, window.innerHeight - 104) }
    try {
      const saved = sessionStorage.getItem('truckflow.nvai.position')
      if (!saved) return fallback
      const parsed = JSON.parse(saved) as { x?: number; y?: number }
      return typeof parsed.x === 'number' && typeof parsed.y === 'number' ? { x: parsed.x, y: parsed.y } : fallback
    } catch {
      return fallback
    }
  })
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const suppressClick = useRef(false)

  const clamp = (x: number, y: number) => ({
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - 84)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - 84)),
  })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const current = drag.current
      if (!current || event.pointerId !== current.pointerId) return
      const dx = event.clientX - current.startX
      const dy = event.clientY - current.startY
      if (Math.abs(dx) + Math.abs(dy) > 4) suppressClick.current = true
      setPosition(clamp(current.originX + dx, current.originY + dy))
    }
    const onUp = (event: PointerEvent) => {
      if (!drag.current || event.pointerId !== drag.current.pointerId) return
      drag.current = null
      setPosition((current) => {
        sessionStorage.setItem('truckflow.nvai.position', JSON.stringify(current))
        return current
      })
    }
    const onResize = () => setPosition((current) => clamp(current.x, current.y))
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <>
      {open ? (
        <aside
          className="fixed top-0 right-0 z-40 flex h-screen w-[400px] max-w-[100vw] flex-col bg-white"
          role="dialog"
          aria-label="NVAi"
        >
          <NvaiPanel site={site} focus={focus} onClose={() => setOpen(false)} />
        </aside>
      ) : null}

      <button
        type="button"
        onPointerDown={(event) => {
          drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y }
          suppressClick.current = false
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          setOpen((v) => !v)
        }}
        className="group fixed z-50 flex h-[76px] w-[76px] touch-none cursor-grab items-center justify-center rounded-full border-4 border-white bg-[#0b5b40] text-white shadow-[0_12px_30px_rgba(11,91,64,.35)] transition-[transform,background-color] duration-200 hover:-translate-y-1 hover:scale-105 hover:bg-[#084c36] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
        style={{ left: position.x, top: position.y }}
        aria-label={open ? 'Cerrar NVAi' : 'Abrir NVAi'}
        aria-expanded={open}
        title="Arrastrá para mover · clic para abrir"
      >
        <span className={`pointer-events-none absolute top-1/2 w-max -translate-y-1/2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-left text-slate-800 opacity-0 shadow-lg transition duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 ${position.x > window.innerWidth / 2 ? 'right-[86px] translate-x-2 group-hover:translate-x-0' : 'left-[86px] -translate-x-2 group-hover:translate-x-0'}`}>
          <strong className="block text-sm text-[#0b5b40]">Hola, soy NVAi</strong>
          <small className="block text-[11px] text-slate-500">Tu asistente de operación</small>
        </span>
        {open ? (
          <svg width="18" height="18" viewBox="0 0 13 13" aria-hidden>
            <path d="M1 1l11 11M12 1L1 12" stroke="#fff" strokeWidth="1.6" />
          </svg>
        ) : <span className="text-[19px] font-black tracking-[-.04em]">NVA</span>}
      </button>
    </>
  )
}
