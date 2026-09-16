import type { PreparationState } from './types'

const STEP_KIND_LABEL: Record<'download' | 'process' | 'load', string> = {
  download: 'Actualizar eventos y alertas',
  process: 'Procesar semana',
  load: 'Cargar tablas',
}

type Props = {
  state: PreparationState
  onStop: () => void
}

/** Progreso textual del plan actual. No porcentajes ficticios: pasos completados / total. */
export function PreparationProgress({ state, onStop }: Props): JSX.Element | null {
  const { steps, phase, error, limitations } = state
  if (!steps.length && !error && phase === 'idle') return null

  const completed = steps.filter(s => s.state === 'done').length
  const running = steps.find(s => s.state === 'running')
  const isBusy = ['checking', 'downloading', 'processing', 'loading'].includes(phase)

  return (
    <section className="ui-panel" aria-label="Progreso de preparación">
      <header className="mb-2 flex items-center justify-between" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <p className="ui-label">Preparación</p>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }} role="status">
            {phase === 'checking' && 'Revisando disponibilidad…'}
            {phase === 'downloading' && (running ? `Descargando ${running.from}` : 'Descargando…')}
            {phase === 'processing' && (running ? `Procesando semana ${running.from} → ${running.to}` : 'Procesando…')}
            {phase === 'loading' && 'Cargando tablas…'}
            {phase === 'ready' && 'Datos listos'}
            {phase === 'failed' && 'No se pudo completar'}
            {phase === 'interrupted' && 'La preparación anterior se interrumpió'}
            {phase === 'needs_sources' && 'Faltan fuentes por descargar'}
            {phase === 'needs_processing' && 'Requiere preparación'}
            {phase === 'idle' && 'Sin operación en curso'}
          </p>
          {steps.length ? (
            <p className="ui-muted" style={{ fontSize: 13, marginTop: 2 }}>
              Pasos: {completed}/{steps.length}
            </p>
          ) : null}
        </div>
        {isBusy ? (
          <button type="button" className="ui-button" onClick={onStop}>
            Detener después del paso actual
          </button>
        ) : null}
      </header>

      {isBusy && !running ? (
        <div
          role="progressbar"
          aria-label="Trabajo en curso"
          style={{
            height: 4, borderRadius: 4, background: 'var(--ui-line)', overflow: 'hidden', marginBottom: 12,
          }}
        >
          <div
            style={{
              width: '30%', height: '100%',
              background: 'var(--ui-primary)',
              animation: 'ui-progress-slide 1.4s ease-in-out infinite',
            }}
          />
        </div>
      ) : null}

      {steps.length ? (
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--ui-primary)' }}>
            Ver plan ({steps.length} paso{steps.length === 1 ? '' : 's'})
          </summary>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 4 }}>
            {steps.map(s => (
              <li key={s.key} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <span style={{
                  minWidth: 84,
                  color:
                    s.state === 'done' ? 'var(--ui-success)' :
                    s.state === 'failed' ? 'var(--ui-danger)' :
                    s.state === 'running' ? 'var(--ui-primary)' :
                    'var(--ui-muted)',
                  fontWeight: 600,
                }}>
                  {s.state === 'done' ? '✓ Hecho' :
                   s.state === 'failed' ? '✗ Falló' :
                   s.state === 'running' ? '⋯ En curso' :
                   '· Pendiente'}
                </span>
                <span>{STEP_KIND_LABEL[s.kind]} — {s.from === s.to ? s.from : `${s.from} → ${s.to}`}</span>
                {s.error ? <span className="ui-muted">— {s.error}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {error ? (
        <p className="ui-message ui-message--error mt-3" role="alert">
          <strong>Error:</strong> {error}
        </p>
      ) : null}

      {limitations.length ? (
        <ul className="mt-3" style={{ listStyle: 'disc', paddingLeft: 20, color: 'var(--ui-warning)', fontSize: 13 }}>
          {limitations.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      ) : null}

      <style>{`
        @keyframes ui-progress-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="progressbar"] > div { animation: none !important; opacity: 0.6; }
        }
      `}</style>
    </section>
  )
}
