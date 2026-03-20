/**
 * Pieza 4 — Contexto técnico minimal
 * Footer discreto: fórmula, rango, Truckflow.
 */

export function EstadiaTechnicalFooter() {
  const generated = new Date().toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  return (
    <div
      className="rounded-xl border border-slate-100 bg-slate-50/80 px-6 py-4"
      style={{ minWidth: 720 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span>Fórmula: Tiempo de estadía = egreso − ingreso</span>
          <span>Rango: 30 min a 15 h</span>
        </div>
        <span>Generado por Truckflow · {generated}</span>
      </div>
    </div>
  )
}
