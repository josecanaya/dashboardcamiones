import { useState } from 'react'
import { TruckPlateRegistryModal } from './TruckPlateRegistryModal'

/** Botón flotante / barra para abrir el catálogo de patentes. */
export function TruckPlateRegistryLauncher() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-100"
      >
        Catálogo de patentes
      </button>
      <TruckPlateRegistryModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
