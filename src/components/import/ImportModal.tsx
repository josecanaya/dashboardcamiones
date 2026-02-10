import { useCallback } from 'react'
import { ImportScreen } from './ImportScreen'

interface ImportModalProps {
  open: boolean
  onClose: () => void
}

export function ImportModal({ open, onClose }: ImportModalProps) {
  const handleSuccess = useCallback(() => {
    onClose()
  }, [onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-[1000px] h-[80vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
      >
        <div className="shrink-0 border-b border-slate-200 px-4 py-3 flex items-center justify-between bg-white">
          <h2 id="import-modal-title" className="text-lg font-semibold text-slate-800">
            Cargar archivo
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <ImportScreen onProcessSuccess={handleSuccess} />
        </div>
      </div>
    </div>
  )
}
