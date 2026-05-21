import type { SiteId } from '../../domain/sites'
import type { KpiOperationKind } from '../../config/kpiCircuitMatrix'
import {
  KPI_OPERATION_LABELS,
  circuitsForPlantOperation,
  operationsAvailableForPlant,
  supportsKpiCircuitMatrix,
} from '../../config/kpiCircuitMatrix'

export interface KpiCircuitFilterBarProps {
  siteId: SiteId
  operation: KpiOperationKind
  onOperationChange: (op: KpiOperationKind) => void
  /** null = todos los circuitos del tipo seleccionado */
  matrixCircuit: string | null
  onMatrixCircuitChange: (code: string | null) => void
  /** Códigos extra detectados en el histórico cargado (ej. R5_R6 Truckflow). */
  extraMatrixCodes?: string[]
}

export function KpiCircuitFilterBar({
  siteId,
  operation,
  onOperationChange,
  matrixCircuit,
  onMatrixCircuitChange,
  extraMatrixCodes = [],
}: KpiCircuitFilterBarProps) {
  if (!supportsKpiCircuitMatrix(siteId)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
        La matriz operación → circuito (R/SL) aplica solo a <strong>Ricardone</strong> y <strong>San Lorenzo</strong>. En esta planta los KPI usan todos los viajes del período.
      </div>
    )
  }

  const ops = operationsAvailableForPlant(siteId)
  const circuits = [...circuitsForPlantOperation(siteId, operation), ...extraMatrixCodes]

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="min-w-[180px] flex-1">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Tipo de operación
        </label>
        <select
          value={operation}
          onChange={(e) => {
            const op = e.target.value as KpiOperationKind
            onOperationChange(op)
            onMatrixCircuitChange(null)
          }}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800"
        >
          {ops.map((op) => (
            <option key={op} value={op}>
              {KPI_OPERATION_LABELS[op]}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[200px] flex-1">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Circuito (código matriz)
        </label>
        <select
          value={matrixCircuit ?? 'ALL'}
          onChange={(e) => {
            const v = e.target.value
            onMatrixCircuitChange(v === 'ALL' ? null : v)
          }}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800"
        >
          <option value="ALL">Todos ({circuits.length} en {KPI_OPERATION_LABELS[operation]})</option>
          {circuits.map((code) => (
            <option key={code} value={code}>
              {code}
              {extraMatrixCodes.includes(code) ? ' (datos Truckflow)' : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
