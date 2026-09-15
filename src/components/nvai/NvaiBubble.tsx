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
        className="fixed right-5 bottom-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-[0_6px_16px_rgba(37,99,235,.28)] transition hover:bg-sky-700"
        aria-label={open ? 'Cerrar NVAi' : 'Abrir NVAi'}
        aria-expanded={open}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 13 13" aria-hidden>
            <path d="M1 1l11 11M12 1L1 12" stroke="#fff" strokeWidth="1.6" />
          </svg>
        ) : (
          <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden>
            <rect x="3" y="4.5" width="18" height="13" rx="3.5" stroke="#fff" strokeWidth="1.7" fill="none" />
            <circle cx="8.5" cy="11" r="1.15" fill="#fff" />
            <circle cx="12" cy="11" r="1.15" fill="#fff" />
            <circle cx="15.5" cy="11" r="1.15" fill="#fff" />
          </svg>
        )}
      </button>
    </>
  )
}
