import { useMemo } from 'react'
import { Button } from '../../../components/ui/Interface'
import type { DateRange } from './types'
import { previousCalendarWeekRange } from '../utils/weekDateRange'

/** Ayer en America/Argentina/Buenos_Aires como YYYY-MM-DD. */
function lastCompleteDayBA(): string {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const d = parts.find(p => p.type === 'day')!.value
  const today = new Date(`${y}-${m}-${d}T00:00:00Z`)
  today.setUTCDate(today.getUTCDate() - 1)
  return today.toISOString().slice(0, 10)
}

function shiftIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function isValidRange(range: DateRange): boolean {
  if (!range.from || !range.to) return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to)) return false
  return range.from <= range.to
}

type Props = {
  draft: DateRange
  onChange: (range: DateRange) => void
  onInspect: () => void
  busy: boolean
  activeSummary: string | null
}

/** Único editor de rango de toda la app (CONTRATO §5). No dispara POSTs; sólo edita el draft. */
export function PeriodEditor({ draft, onChange, onInspect, busy, activeSummary }: Props): JSX.Element {
  const valid = useMemo(() => isValidRange(draft), [draft])
  const invalidReason = !draft.from || !draft.to
    ? 'Completá ambas fechas.'
    : draft.from > draft.to
    ? '«Desde» debe ser anterior o igual a «Hasta».'
    : null

  const applyPreset = (kind: 'previousWeek' | 'last7'): void => {
    if (kind === 'previousWeek') {
      const w = previousCalendarWeekRange()
      onChange({ from: w.startDate, to: w.endDate })
    } else {
      const to = lastCompleteDayBA()
      const from = shiftIsoDays(to, -6)
      onChange({ from, to })
    }
  }

  return (
    <section className="ui-panel" aria-label="Período a preparar">
      <header className="mb-3">
        <p className="ui-label">Período</p>
        <p className="ui-muted" style={{ fontSize: 13 }}>
          El período se comparte con indicadores y reportes. Editar acá no cambia los datos ya visibles.
        </p>
      </header>
      <form
        className="ui-period-form"
        onSubmit={e => {
          e.preventDefault()
          if (valid && !busy) onInspect()
        }}
      >
        <label>
          <span className="ui-label">Desde</span>
          <input
            className="ui-input"
            type="date"
            required
            value={draft.from}
            onChange={e => onChange({ from: e.target.value, to: draft.to })}
            disabled={busy}
          />
        </label>
        <label>
          <span className="ui-label">Hasta</span>
          <input
            className="ui-input"
            type="date"
            required
            min={draft.from || undefined}
            value={draft.to}
            onChange={e => onChange({ from: draft.from, to: e.target.value })}
            disabled={busy}
          />
        </label>
        <Button type="button" onClick={() => applyPreset('previousWeek')} disabled={busy}>
          Semana anterior
        </Button>
        <Button type="button" onClick={() => applyPreset('last7')} disabled={busy}>
          Últimos 7 días completos
        </Button>
        <Button primary type="submit" disabled={!valid || busy}>
          Revisar disponibilidad
        </Button>
      </form>
      {invalidReason ? (
        <p className="ui-message ui-message--warning mt-3" role="status">
          {invalidReason}
        </p>
      ) : null}
      {activeSummary ? (
        <p className="ui-label mt-3" aria-live="polite">
          Datos visibles ahora: <strong>{activeSummary}</strong>
        </p>
      ) : null}
    </section>
  )
}
