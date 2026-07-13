import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  getEtlAgentStatus,
  postEtlAgentChat,
  type EtlAgentChatMessage,
  type EtlAgentChatResponse,
  type EtlAgentStatus,
} from '../api/etlAgentApi'

type UiMessage = EtlAgentChatMessage & {
  tools?: string[]
  highlights?: NonNullable<EtlAgentChatResponse['highlights']>
  error?: boolean
}

const SUGGESTIONS = [
  'Tiempo medio Preingreso → Calada en la última corrida real',
  '¿Cuántos R7 hay del 2026-07-06 al 2026-07-11?',
  'Resumen ejecutivo de la última corrida con eventos > 0',
]

function cleanReplyText(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^>\s?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function AgenteChatTab() {
  const [status, setStatus] = useState<EtlAgentStatus | null>(null)
  const [statusError, setStatusError] = useState('')
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

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
    try {
      const out = await postEtlAgentChat(message, history)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: cleanReplyText(out.reply),
          tools: (out.toolTrace || []).map((t) => t.name),
          highlights: out.highlights,
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
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Agente operativo</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Preguntá por tiempos de tramo, circuitos o KPIs. Lee corridas reales de{' '}
            <span className="font-mono text-[12px]">data/truckflow</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusError ?
            <span className="text-xs text-amber-700">Server offline</span>
          : configured ?
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
              Listo
            </span>
          : status == null ?
            <span className="text-xs text-slate-400">…</span>
          : <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-800">
              Falta API key
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

      <div className="flex min-h-[62vh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.length === 0 && !busy ?
            <div className="space-y-3 pt-2">
              <p className="text-sm text-slate-500">Ejemplos</p>
              <div className="grid gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!configured || busy}
                    onClick={() => void send(s)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm text-slate-800 transition hover:border-slate-300 hover:bg-white disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          : null}

          {messages.map((m, i) => (
            <div key={`${m.role}-${i}`} className={m.role === 'user' ? 'flex justify-end' : 'space-y-2'}>
              {m.role === 'user' ?
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-800 px-3.5 py-2.5 text-sm leading-relaxed text-white">
                  {m.content}
                </div>
              : <div className="max-w-[95%] space-y-2">
                  {m.highlights?.length ?
                    <div className="flex flex-wrap gap-2">
                      {m.highlights.map((h) => (
                        <div
                          key={`${h.label}-${h.value}`}
                          className="min-w-[9rem] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                        >
                          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            {h.label}
                          </div>
                          <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                            {h.value}
                          </div>
                          {h.detail ?
                            <div className="mt-0.5 text-[11px] text-slate-500">{h.detail}</div>
                          : null}
                        </div>
                      ))}
                    </div>
                  : null}
                  <div
                    className={`rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.error ?
                        'bg-rose-50 text-rose-950 ring-1 ring-rose-100'
                      : 'bg-slate-50 text-slate-800'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                  {m.tools?.length ?
                    <div className="flex flex-wrap gap-1.5 pl-1">
                      {m.tools.map((t, ti) => (
                        <span
                          key={`${t}-${ti}`}
                          className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-slate-200"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  : null}
                </div>
              }
            </div>
          ))}

          {busy ?
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
              Consultando corridas…
            </div>
          : null}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={onSubmit} className="border-t border-slate-100 bg-white p-3">
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
                configured ?
                  'Ej. tiempo medio Preingreso–Calada…'
                : 'Configurá ANTHROPIC_API_KEY y reiniciá el server'
              }
              className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={busy || !configured || !draft.trim()}
              className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-35"
            >
              Enviar
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
