import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  parseNvaiFacts,
  streamNvaiAsk,
  type NvaiChatMessage,
  type NvaiFact,
  type NvaiFocus,
} from './nvaiApi'

type UiMessage = NvaiChatMessage & {
  facts?: NvaiFact[]
  error?: boolean
  tools?: string[]
}

const SUGGESTIONS = [
  '¿Cómo está Ricardone ahora?',
  '¿Dónde hay acumulación?',
  '¿Qué sectores están en atención o críticos?',
]

function FactsBlock({ facts }: { facts: NvaiFact[] }) {
  if (!facts.length) return null
  return (
    <div className="mt-2 overflow-hidden rounded-[10px] border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        Los hechos
      </div>
      <ul>
        {facts.map((f, i) => (
          <li
            key={`${f.source}-${i}`}
            className={`flex gap-2 px-3 py-2 ${i < facts.length - 1 ? 'border-b border-slate-100' : ''}`}
          >
            <span className="min-w-0 flex-1 font-mono text-[11.5px] leading-snug text-slate-700">
              {f.text}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-slate-400">{f.source}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export type NvaiPanelProps = {
  site?: string
  focus?: NvaiFocus | string | null
  /** Embebido en Home: sin chrome de drawer. */
  embedded?: boolean
  onClose?: () => void
  className?: string
}

export function NvaiPanel({
  site = 'ricardone',
  focus = null,
  embedded = false,
  onClose,
  className = '',
}: NvaiPanelProps) {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  async function send(text: string) {
    const question = text.trim()
    if (!question || busy) return
    setDraft('')
    const history = messages
      .filter((m) => !m.error)
      .map(({ role, content }) => ({ role, content }))
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setBusy(true)
    setProgress([])
    try {
      const out = await streamNvaiAsk(
        { question, site, focus, history },
        (label) =>
          setProgress((prev) => (prev[prev.length - 1] === label ? prev : [...prev, label]))
      )
      const parsed = out.facts?.length
        ? { plain: out.reply, facts: out.facts }
        : parseNvaiFacts(out.reply || '')
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: parsed.plain,
          facts: parsed.facts,
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
      setProgress([])
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send(draft)
  }

  const focusHint =
    typeof focus === 'string'
      ? focus
      : focus?.sector
        ? `sector ${focus.sector}`
        : focus?.plate
          ? `patente ${focus.plate}`
          : null

  return (
    <div
      className={`flex h-full min-h-0 flex-col bg-white ${embedded ? '' : 'border-l border-slate-200 shadow-lg'} ${className}`}
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-slate-200 px-4 py-3">
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-sky-600">
          <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
            <rect x="3" y="4.5" width="18" height="13" rx="3.5" stroke="#fff" strokeWidth="2.2" fill="none" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">NVAi</div>
          <div className="truncate font-mono text-[11px] text-slate-400">
            {site}
            {focusHint ? ` · ${focusHint}` : ' · ahora'}
          </div>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
          >
            Limpiar
          </button>
        ) : null}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar NVAi"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
              <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !busy ? (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Empezá por acá
            </p>
            <div className="grid gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => void send(s)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[13px] leading-snug text-slate-800 transition hover:border-slate-300 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] leading-relaxed text-slate-400">
              Cada número sale del snapshot o de una ventana ETL. Si no está, NVAi dice que no se
              sabe.
            </p>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={`${m.role}-${i}`} className={m.role === 'user' ? 'flex justify-end' : ''}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] rounded-xl rounded-br-sm border border-sky-100 bg-sky-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-800">
                {m.content}
              </div>
            ) : m.error ? (
              <div className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-950 ring-1 ring-rose-100">
                {m.content}
              </div>
            ) : (
              <div className="max-w-[95%]">
                {m.content ? (
                  <p className="text-[13.5px] leading-relaxed text-slate-900 whitespace-pre-wrap">
                    {m.content}
                  </p>
                ) : null}
                <FactsBlock facts={m.facts ?? []} />
                {m.tools?.length ? (
                  <p className="mt-2 text-[10px] text-slate-400">
                    Tools: {m.tools.slice(0, 4).join(' · ')}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ))}

        {busy ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
            {progress.length ? progress[progress.length - 1] : 'Consultando…'}
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={onSubmit}
        className="flex shrink-0 items-center gap-2 border-t border-slate-200 px-3 py-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
          placeholder="Preguntá sobre la planta…"
          className="min-w-0 flex-1 rounded-[10px] border border-slate-300 bg-white px-3.5 py-2.5 text-[13px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-sky-400"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white disabled:opacity-40"
          aria-label="Enviar"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M7 12V2M2.5 6.5L7 2l4.5 4.5" stroke="#fff" strokeWidth="1.7" fill="none" />
          </svg>
        </button>
      </form>
    </div>
  )
}
