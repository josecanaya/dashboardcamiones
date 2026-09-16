import { useState } from 'react'
import type { SourceDay, SourceState } from '../api/truckflowLocalServerApi'
import type { PreparationState } from './types'

const STATE_LABEL: Record<SourceState, string> = {
  available: 'Disponible',
  missing: 'Falta',
  partial: 'Parcial',
  error: 'Con error',
  unknown: 'Sin dato',
}

const STATE_TONE: Record<SourceState, 'success' | 'warning' | 'danger' | 'neutral'> = {
  available: 'success',
  missing: 'warning',
  partial: 'warning',
  error: 'danger',
  unknown: 'neutral',
}

function badgeClass(tone: 'success' | 'warning' | 'danger' | 'neutral'): string {
  if (tone === 'success') return 'ui-badge ui-badge--success'
  if (tone === 'warning') return 'ui-badge ui-badge--warning'
  if (tone === 'danger') return 'ui-badge ui-badge--danger'
  return 'ui-badge'
}

function summarizeSources(days: SourceDay[], kind: 'events' | 'alerts'): {
  total: number
  available: number
  missing: number
  partial: number
  error: number
  unknown: number
} {
  const acc = { total: days.length, available: 0, missing: 0, partial: 0, error: 0, unknown: 0 }
  for (const d of days) {
    const s = d[kind].state
    acc[s] += 1
  }
  return acc
}

type Props = {
  state: PreparationState
  excelCoverage: { day: string; rows: number }[]
  hasActiveRun: boolean
}

/** Tres tarjetas: Cámaras (eventos+alertas), Excel (movimientos) y Procesamiento (corrida). */
export function SourceCoverageCards({ state, excelCoverage, hasActiveRun }: Props): JSX.Element {
  const [showDetail, setShowDetail] = useState(false)
  const days = state.sourceDays
  const eventsSummary = summarizeSources(days, 'events')
  const alertsSummary = summarizeSources(days, 'alerts')

  const excelByDay = new Map(excelCoverage.map(c => [c.day, c.rows]))
  const missingExcel = state.missingExcelDays
  const excelWithRows = excelCoverage.filter(c => c.rows > 0).length

  return (
    <section aria-label="Disponibilidad de fuentes" className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
      <article className="ui-panel">
        <header className="mb-2">
          <p className="ui-label">Cámaras · Eventos</p>
        </header>
        <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          {eventsSummary.available}/{eventsSummary.total || '—'}
        </p>
        <p className="ui-muted" style={{ fontSize: 13, marginTop: 4 }}>
          días disponibles (event-list.json global)
        </p>
        {eventsSummary.missing + eventsSummary.error + eventsSummary.partial > 0 ? (
          <p className={badgeClass('warning')} style={{ marginTop: 8 }}>
            Falta o parcial: {eventsSummary.missing + eventsSummary.error + eventsSummary.partial}
          </p>
        ) : null}
      </article>

      <article className="ui-panel">
        <header className="mb-2">
          <p className="ui-label">Cámaras · Alertas</p>
        </header>
        <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          {alertsSummary.available}/{alertsSummary.total || '—'}
        </p>
        <p className="ui-muted" style={{ fontSize: 13, marginTop: 4 }}>
          días disponibles (alert-list.json global)
        </p>
      </article>

      <article className="ui-panel">
        <header className="mb-2">
          <p className="ui-label">Excel · Movimientos por Contrato</p>
        </header>
        <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          {excelWithRows}/{days.length || '—'}
        </p>
        <p className="ui-muted" style={{ fontSize: 13, marginTop: 4 }}>
          días con filas en el backup local
        </p>
        {missingExcel.length ? (
          <p className={badgeClass('warning')} style={{ marginTop: 8 }}>
            Sin movimientos Excel: {missingExcel.length} día(s) — no se puede confirmar si falta el archivo
          </p>
        ) : null}
      </article>

      <article className="ui-panel">
        <header className="mb-2">
          <p className="ui-label">Procesamiento</p>
        </header>
        <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          {hasActiveRun ? 'Vigente' : 'Requiere preparación'}
        </p>
        <p className="ui-muted" style={{ fontSize: 13, marginTop: 4 }}>
          {hasActiveRun ? 'Corrida disponible para el período activo.' : 'No hay corrida vigente para el rango pedido.'}
        </p>
      </article>

      <details
        className="ui-panel"
        style={{ gridColumn: '1 / -1' }}
        open={showDetail}
        onToggle={e => setShowDetail((e.target as HTMLDetailsElement).open)}
      >
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--ui-primary)' }}>
          Detalle por día ({days.length})
        </summary>
        <div className="mt-3" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--ui-line)' }}>
                <th style={{ padding: '6px 8px' }}>Día</th>
                <th style={{ padding: '6px 8px' }}>Eventos</th>
                <th style={{ padding: '6px 8px' }}>Alertas</th>
                <th style={{ padding: '6px 8px' }}>Excel (filas)</th>
              </tr>
            </thead>
            <tbody>
              {days.map(d => {
                const excelRows = excelByDay.get(d.day)
                return (
                  <tr key={d.day} style={{ borderBottom: '1px solid var(--ui-line)' }}>
                    <td style={{ padding: '6px 8px' }}>{d.day}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <span className={badgeClass(STATE_TONE[d.events.state])}>{STATE_LABEL[d.events.state]}</span>
                      <span className="ui-muted" style={{ marginLeft: 8 }}>
                        {d.events.count === null ? 'sin dato' : `${d.events.count} filas`}
                      </span>
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <span className={badgeClass(STATE_TONE[d.alerts.state])}>{STATE_LABEL[d.alerts.state]}</span>
                      <span className="ui-muted" style={{ marginLeft: 8 }}>
                        {d.alerts.count === null ? 'sin dato' : `${d.alerts.count} filas`}
                      </span>
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      {excelRows === undefined
                        ? <span className="ui-muted">sin dato</span>
                        : <span>{excelRows}</span>}
                    </td>
                  </tr>
                )
              })}
              {days.length === 0 ? (
                <tr><td colSpan={4} className="ui-muted" style={{ padding: '12px 8px' }}>
                  Todavía no revisaste disponibilidad para este rango.
                </td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
