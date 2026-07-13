import type { EtlAgentUiPayload } from '../api/etlAgentApi'

const TONE: Record<string, string> = {
  good: 'border-emerald-200 bg-emerald-50/80 text-emerald-950',
  warn: 'border-amber-200 bg-amber-50/90 text-amber-950',
  critical: 'border-rose-200 bg-rose-50/90 text-rose-950',
  neutral: 'border-slate-200 bg-white text-slate-900',
}

/** Respuesta estructurada del agente (no markdown crudo). */
export function AgentInsightPanel({
  ui,
  agentUsed,
  tools,
}: {
  ui: EtlAgentUiPayload
  agentUsed?: string
  tools?: string[]
}) {
  const uniqueTools = [...new Set(tools || [])]
  const agentLabel =
    agentUsed === 'knowledge_truckflow' ? 'Knowledge Truckflow'
    : agentUsed === 'knowledge_contratos' ? 'Knowledge Contratos'
    : agentUsed === 'seguridad' ? 'Seguridad'
    : agentUsed === 'comunicador' ? 'Comunicador'
    : 'Orquestador'

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          <span>{agentLabel}</span>
          {ui.context?.runId ?
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono normal-case tracking-normal text-slate-600">
              {ui.context.runId}
            </span>
          : null}
          {ui.context?.scope ?
            <span className="normal-case tracking-normal text-slate-500">· {ui.context.scope}</span>
          : null}
        </div>
        <h3 className="mt-2 text-[1.35rem] font-semibold leading-snug tracking-tight text-slate-900">
          {ui.title}
        </h3>
        {ui.verdict ?
          <p className="mt-2 text-[15px] leading-relaxed text-slate-700">
            <span className="decoration-slate-300 underline decoration-2 underline-offset-[5px] [text-decoration-skip-ink:none]">
              {ui.verdict}
            </span>
          </p>
        : null}
      </div>

      {ui.metrics?.length ?
        <div className="grid gap-2 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {ui.metrics.map((m) => (
            <div
              key={`${m.label}-${m.value}`}
              className={`rounded-xl border px-3.5 py-3 ${TONE[m.tone || 'neutral'] || TONE.neutral}`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{m.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{m.value}</div>
              {m.hint ? <div className="mt-1 text-xs opacity-70">{m.hint}</div> : null}
            </div>
          ))}
        </div>
      : null}

      {ui.rankings?.length ?
        <div className="space-y-2 border-b border-slate-100 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Comparativa
          </div>
          <ul className="space-y-2">
            {ui.rankings.map((row) => (
              <li
                key={row.label}
                className={`rounded-xl border px-3.5 py-3 ${
                  row.emphasize ?
                    'border-slate-800 bg-slate-900 text-white shadow-md'
                  : 'border-slate-200 bg-white text-slate-800'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className={`text-sm font-semibold ${row.emphasize ? 'text-white' : 'text-slate-900'}`}>
                      {row.label}
                    </div>
                    {row.sublabel ?
                      <div className={`text-xs ${row.emphasize ? 'text-slate-300' : 'text-slate-500'}`}>
                        {row.sublabel}
                      </div>
                    : null}
                  </div>
                  {row.emphasize ?
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200">
                      foco
                    </span>
                  : null}
                </div>
                {row.values?.length ?
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {row.values.map((v) => (
                      <div key={v.k} className="min-w-[4.5rem]">
                        <div className={`text-[10px] uppercase ${row.emphasize ? 'text-slate-400' : 'text-slate-400'}`}>
                          {v.k}
                        </div>
                        <div className={`text-sm font-semibold tabular-nums ${row.emphasize ? 'text-white' : 'text-slate-800'}`}>
                          {v.v}
                        </div>
                      </div>
                    ))}
                  </div>
                : null}
              </li>
            ))}
          </ul>
        </div>
      : null}

      {ui.findings?.length ?
        <div className="space-y-2 border-b border-slate-100 px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Lectura</div>
          <ul className="space-y-2">
            {ui.findings.map((f) => (
              <li key={f} className="flex gap-2 text-[14px] leading-relaxed text-slate-700">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      : null}

      {(ui.ask || uniqueTools.length > 0) ?
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          {ui.ask ?
            <p className="text-sm text-slate-500">
              <span className="font-medium text-slate-700">Siguiente: </span>
              {ui.ask}
            </p>
          : <span />}
          {uniqueTools.length ?
            <p className="text-[11px] text-slate-400">
              Fuentes: {uniqueTools.slice(0, 5).join(' · ')}
              {uniqueTools.length > 5 ? ` · +${uniqueTools.length - 5}` : ''}
            </p>
          : null}
        </div>
      : null}
    </article>
  )
}
