import { FormEvent, useEffect, useRef, useState } from 'react'
import { AgentInsightPanel } from '../components/AgentInsightPanel'
import {
  getEtlAgentStatus,
  streamEtlAgentChat,
  type EtlAgentChatMessage,
  type EtlAgentChatResponse,
  type EtlAgentStatus,
  type EtlAgentUiPayload,
} from '../api/etlAgentApi'

type UiMessage = EtlAgentChatMessage & {
  tools?: string[]
  highlights?: NonNullable<EtlAgentChatResponse['highlights']>
  ui?: EtlAgentUiPayload | null
  agentUsed?: string
  error?: boolean
}

const SUGGESTIONS = [
  'En R7, ¿qué tramo tiene más desvío y cuánto dura Preingreso→Calada?',
  'Tiempo medio Preingreso→Calada en Q1 (madrugada) vs Q2',
  '¿Cuántos R7 hay del 2026-07-06 al 2026-07-11?',
]

function parseUiFromReply(reply: string): { plain: string; ui: EtlAgentUiPayload | null } {
  const m = reply.match(/<<AGENT_UI\s*([\s\S]*?)\s*AGENT_UI>>/)
  if (!m) return { plain: reply.trim(), ui: null }
  try {
    return { plain: reply.replace(m[0], '').trim(), ui: JSON.parse(m[1].trim()) as EtlAgentUiPayload }
  } catch {
    return { plain: reply.trim(), ui: null }
  }
}

// La conversación se persiste en sessionStorage para que no se pierda al cambiar
// de pestaña (el tab se desmonta) ni al recargar. Se limpia al cerrar el navegador.
const CHAT_STORAGE_KEY = 'etl-agent-chat-messages-v1'

function loadStoredMessages(): UiMessage[] {
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? (parsed as UiMessage[]) : []
  } catch {
    return []
  }
}

export function AgenteChatTab() {
  const [status, setStatus] = useState<EtlAgentStatus | null>(null)
  const [statusError, setStatusError] = useState('')
  const [messages, setMessages] = useState<UiMessage[]>(loadStoredMessages)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Persistir la conversación entre cambios de pestaña / recargas.
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
    } catch {
      /* storage lleno o no disponible: la conversación sigue en memoria */
    }
  }, [messages])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await getEtlAgentStatus()
        if (!cancelled) setStatus(s)
      } catch (e) {
        if (!cancelled) setStatusError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  async function send(text: string) {
    const message = text.trim()
    if (!message || busy) return
    setDraft('')
    const history = messages
      .filter((m) => !m.error)
      .map(({ role, content }) => ({ role, content }))
    setMessages((prev) => [...prev, { role: 'user', content: message }])
    setBusy(true)
    setProgress([])
    try {
      const out = await streamEtlAgentChat(message, history, (label) =>
        setProgress((prev) => (prev[prev.length - 1] === label ? prev : [...prev, label]))
      )
      const parsed = out.ui ?? parseUiFromReply(out.reply).ui
      const plain = out.ui ? out.reply : parseUiFromReply(out.reply).plain
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: plain,
          tools: (out.toolTrace || []).map((t) => t.name),
          highlights: out.highlights,
          ui: parsed,
          agentUsed: out.agentUsed,
        },
      ])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: e instanceof Error ? e.message : String(e),
          error: true,
        },
      ])
    } finally {
      setBusy(false)
      setProgress([])
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send(draft)
  }

  const configured = status?.configured === true

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Comité · IA</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Agente operativo</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
            Orquestador + Knowledge Truckflow / Contratos / Seguridad / Comunicador. Consulta corridas reales;
            no inventa cifras.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusError ?
            <span className="text-xs text-amber-700">Server offline</span>
          : configured ?
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-100">
              {status?.subagents?.length ? `${status.subagents.length} skills` : 'Listo'}
            </span>
          : status == null ?
            <span className="text-xs text-slate-400">…</span>
          : <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-800">
              Chat no disponible
            </span>
          }
          {messages.length > 0 ?
            <button
              type="button"
              onClick={() => setMessages([])}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Limpiar
            </button>
          : null}
        </div>
      </header>

      <div className="flex min-h-[64vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#f7f6f3]">
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {messages.length === 0 && !busy ?
            <div className="space-y-3 pt-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Empezá por acá</p>
              <div className="grid gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!configured || busy}
                    onClick={() => void send(s)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-[15px] leading-snug text-slate-800 shadow-sm transition hover:border-slate-300 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          : null}

          {messages.map((m, i) => {
            // La tarjeta estructurada solo se muestra si tiene contenido real.
            // Un <<AGENT_UI>> con solo título (o vacío) NO debe ocultar el texto.
            const uiHasContent =
              !!m.ui &&
              !!(
                m.ui.metrics?.length ||
                m.ui.findings?.length ||
                m.ui.rankings?.length ||
                m.ui.verdict
              )
            const text = (m.content || '').trim()
            return (
              <div key={`${m.role}-${i}`} className={m.role === 'user' ? 'flex justify-end' : ''}>
                {m.role === 'user' ?
                  <div className="max-w-[88%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-2.5 text-[15px] leading-relaxed text-white">
                    {m.content}
                  </div>
                : m.error ?
                  <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-950 ring-1 ring-rose-100">
                    {m.content}
                  </div>
                : <div className="max-w-[95%] space-y-2">
                    {uiHasContent ?
                      <AgentInsightPanel ui={m.ui!} agentUsed={m.agentUsed} tools={m.tools} />
                    : null}
                    {m.highlights?.length ?
                      <div className="flex flex-wrap gap-2">
                        {m.highlights.map((h) => (
                          <div
                            key={`${h.label}-${h.value}`}
                            className="min-w-[9rem] rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                          >
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              {h.label}
                            </div>
                            <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{h.value}</div>
                            {h.detail ? <div className="text-[11px] text-slate-500">{h.detail}</div> : null}
                          </div>
                        ))}
                      </div>
                    : null}
                    {/* El texto se muestra SIEMPRE que exista, aunque haya tarjeta. */}
                    {text ?
                      <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-200/80">
                        <p className="whitespace-pre-wrap">{text}</p>
                      </div>
                    : !uiHasContent ?
                      <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-500 shadow-sm ring-1 ring-slate-200/80">
                        <p>El agente respondió sin contenido. Reintentá la pregunta.</p>
                      </div>
                    : null}
                  </div>
                }
              </div>
            )
          })}

          {busy ?
            <div className="space-y-1.5">
              {progress.length === 0 ?
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-slate-500" />
                  Pensando…
                </div>
              : progress.map((label, idx) => {
                  const last = idx === progress.length - 1
                  return (
                    <div
                      key={`${idx}-${label}`}
                      className={`flex items-center gap-2 text-sm ${last ? 'text-slate-700' : 'text-slate-400'}`}
                    >
                      {last ?
                        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                      : <span className="inline-block text-emerald-500">✓</span>}
                      {label}
                    </div>
                  )
                })
              }
            </div>
          : null}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={onSubmit} className="border-t border-slate-200/80 bg-white/90 p-3 backdrop-blur">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(draft)
                }
              }}
              rows={2}
              disabled={busy || !configured}
              placeholder={
                configured ? 'Preguntá como en comité…' : 'Configurá ANTHROPIC_API_KEY y reiniciá el server'
              }
              className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-[15px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={busy || !configured || !draft.trim()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-35"
            >
              Enviar
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
