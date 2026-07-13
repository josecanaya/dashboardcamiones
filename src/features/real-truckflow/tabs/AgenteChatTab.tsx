import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  getEtlAgentStatus,
  postEtlAgentChat,
  type EtlAgentChatMessage,
  type EtlAgentStatus,
} from '../api/etlAgentApi'

type UiMessage = EtlAgentChatMessage & {
  tools?: string[]
  error?: boolean
}

const SUGGESTIONS = [
  '¿Hay corridas reales o solo fixtures? Listá data/truckflow',
  'Corrê ETL del 2026-05-28 al 2026-05-29 y contá cuántos R7 hay',
  'Explicame el circuito R26 (definición del catálogo)',
]

export function AgenteChatTab() {
  const [status, setStatus] = useState<EtlAgentStatus | null>(null)
  const [statusError, setStatusError] = useState('')
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await getEtlAgentStatus()
        if (!cancelled) setStatus(s)
      } catch (e) {
        if (!cancelled) {
          setStatusError(e instanceof Error ? e.message : String(e))
        }
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
    try {
      const out = await postEtlAgentChat(message, history)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: out.reply,
          tools: (out.toolTrace || []).map((t) => t.name),
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
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send(draft)
  }

  const configured = status?.configured === true

  return (
    <section className="flex min-h-[70vh] flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Agente ETL</h2>
        <p className="mt-1 text-sm text-slate-600">
          Preguntas sobre corridas, circuitos y tablas. Las cifras salen del etl-api (tools), no se inventan.
          Las corridas de <span className="font-mono">s-events-slice</span> son fixtures de prueba (~18 eventos):
          para totales de planta pedí un rango y el agente corre ETL sobre{' '}
          <span className="font-mono">data/truckflow</span>.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          {statusError ?
            <span className="rounded-lg bg-amber-50 px-2.5 py-1 font-medium text-amber-900">
              Server: {statusError}
            </span>
          : status == null ?
            <span className="text-slate-500">Comprobando agente…</span>
          : configured ?
            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">
              Claude listo · {status.model}
              {Array.isArray(status.subagents) && status.subagents.length ?
                ` · subagentes: ${status.subagents.join(', ')}`
              : ''}
            </span>
          : <span className="rounded-lg bg-rose-50 px-2.5 py-1 font-medium text-rose-900">
              Falta ANTHROPIC_API_KEY en .env (clave sk-ant-… completa, no el JSON de la consola)
            </span>
          }
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !busy ?
            <div className="space-y-3 text-sm text-slate-600">
              <p>Probá una de estas:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!configured || busy}
                    onClick={() => void send(s)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-slate-800 shadow-sm hover:border-slate-300 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          : null}

          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user' ?
                  'ml-auto bg-slate-900 text-white'
                : m.error ?
                  'bg-rose-50 text-rose-950 ring-1 ring-rose-200'
                : 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.tools?.length ?
                <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  tools: {m.tools.join(' → ')}
                </p>
              : null}
            </div>
          ))}

          {busy ?
            <div className="w-fit rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
              Consultando tools…
            </div>
          : null}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={onSubmit} className="border-t border-slate-200 bg-white p-3">
          <div className="flex gap-2">
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
                configured ?
                  'Escribí tu pregunta… (Enter envía, Shift+Enter nueva línea)'
                : 'Configurá ANTHROPIC_API_KEY y reiniciá npm run server:truckflow'
              }
              className="min-h-[3rem] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 focus:ring-2 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={busy || !configured || !draft.trim()}
              className="self-end rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Enviar
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
