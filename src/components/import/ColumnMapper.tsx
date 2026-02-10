import type { ColumnMapping } from '../../import/types'
import type { ColumnRole } from '../../import/types'

const ROLES: { role: ColumnRole; label: string; required?: boolean }[] = [
  { role: 'timestamp', label: 'Fecha/hora', required: true },
  { role: 'event', label: 'Evento / Estado', required: true },
  { role: 'location', label: 'Ubicación / Sector' },
  { role: 'visitId', label: 'ID visita / Ticket / Nro turno' },
  { role: 'plate', label: 'Patente' },
  { role: 'docNumber', label: 'Nro documento (Carta de porte, etc.)' },
  { role: 'site', label: 'Planta' },
  { role: 'product', label: 'Producto' },
  { role: 'cargoForm', label: 'Tipo carga (sólido/líquido)' },
]

interface ColumnMapperProps {
  headers: string[]
  mapping: ColumnMapping
  onChange: (mapping: ColumnMapping) => void
}

export function ColumnMapper({ headers, mapping, onChange }: ColumnMapperProps) {
  const update = (role: keyof ColumnMapping, value: string) => {
    onChange({ ...mapping, [role]: value || undefined })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-700">Mapear columnas</h3>
      <p className="text-xs text-slate-500">
        Indicá qué columna del archivo corresponde a cada campo. Obligatorios: fecha/hora y evento.
      </p>
      <div className="grid gap-3">
        {ROLES.map(({ role, label, required }) => (
          <div key={role} className="flex items-center gap-3">
            <label className="w-48 text-sm text-slate-700 shrink-0">
              {label}
              {required && <span className="text-red-500"> *</span>}
            </label>
            <select
              value={mapping[role as keyof ColumnMapping] ?? ''}
              onChange={(e) => update(role as keyof ColumnMapping, e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">— No usar —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
