import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

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
        onClick={() => setOpen((v) => !v)}
        className="group fixed right-7 bottom-7 z-50 flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-white bg-[#0b5b40] text-white shadow-[0_12px_30px_rgba(11,91,64,.35)] transition duration-200 hover:-translate-y-1 hover:scale-105 hover:bg-[#084c36] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
        aria-label={open ? 'Cerrar NVAi' : 'Abrir NVAi'}
        aria-expanded={open}
      >
        <span className="pointer-events-none absolute right-[86px] top-1/2 w-max -translate-y-1/2 translate-x-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-left text-slate-800 opacity-0 shadow-lg transition duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
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
