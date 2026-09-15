/** Cliente fino de NVAi (Plant State + agente ETL vía :8787). */

export type NvaiFocus = {
  sector?: string
  plate?: string
  label?: string
}

export type NvaiChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type NvaiFact = {
  text: string
  source: string
}

export type NvaiChatResponse = {
  reply: string
  model?: string
  toolTrace?: { name: string; input?: unknown }[]
  highlights?: { label: string; value: string; detail?: string }[]
  ui?: unknown
  agentUsed?: string
  stopReason?: string
  error?: string
  site?: string
  snapshotAt?: string | null
  facts?: NvaiFact[]
}

function nvaiApiPrefix(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return '/api/truckflow'
  const env =
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_TRUCKFLOW_API_PREFIX : undefined
  if (typeof env === 'string' && env.trim()) return env.trim().replace(/\/$/, '')
  return '/api/truckflow'
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Respuesta no JSON (${res.status})`)
  }
  if (!res.ok) {
    const err =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error?: unknown }).error)
        : text
    throw new Error(err || `Error HTTP ${res.status}`)
  }
  return body as T
}

/** Extrae hechos con fuente del bloque <<NVAI_FACTS … NVAI_FACTS>>. */
export function parseNvaiFacts(reply: string): { plain: string; facts: NvaiFact[] } {
  const m = reply.match(/<<NVAI_FACTS\s*([\s\S]*?)\s*NVAI_FACTS>>/)
  if (!m) return { plain: reply.trim(), facts: [] }
  try {
    const raw = JSON.parse(m[1].trim()) as unknown
    const facts: NvaiFact[] = Array.isArray(raw)
      ? raw
          .filter(
            (f): f is { text: unknown; source: unknown } =>
              !!f && typeof f === 'object' && 'text' in f && 'source' in f
          )
          .map((f) => ({ text: String(f.text), source: String(f.source) }))
          .filter((f) => f.text.trim())
      : []
    return { plain: reply.replace(m[0], '').trim(), facts }
  } catch {
    return { plain: reply.trim(), facts: [] }
  }
}

/**
 * Stream NDJSON de POST /api/truckflow/live/nvai/ask.
 */
export async function streamNvaiAsk(
  args: {
    question: string
    site?: string
    focus?: NvaiFocus | string | null
    history?: NvaiChatMessage[]
  },
  onProgress: (label: string) => void
): Promise<NvaiChatResponse> {
  const res = await fetch(`${nvaiApiPrefix()}/live/nvai/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: args.question,
      site: args.site ?? 'ricardone',
      focus: args.focus ?? null,
      history: args.history ?? [],
    }),
  })
  if (!res.ok || !res.body) {
    return parseJson<NvaiChatResponse>(res)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let final: NvaiChatResponse | null = null
  let errored: string | null = null

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let evt: { type?: string; label?: string; error?: string } & NvaiChatResponse
    try {
      evt = JSON.parse(trimmed)
    } catch {
      return
    }
    if (evt.type === 'progress' && evt.label) onProgress(evt.label)
    else if (evt.type === 'done') final = evt
    else if (evt.type === 'error') errored = evt.error || 'Error de NVAi'
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      handleLine(buffer.slice(0, nl))
      buffer = buffer.slice(nl + 1)
    }
  }
  if (buffer.trim()) handleLine(buffer)

  if (errored) throw new Error(errored)
  if (final == null) throw new Error('NVAi no devolvió respuesta.')
  // Asignaciones dentro del reader no estrechan el tipo; copiamos el resultado final.
  const done: NvaiChatResponse = final
  const parsed = parseNvaiFacts(done.reply || '')
  return {
    ...done,
    reply: parsed.plain || done.reply,
    facts: parsed.facts,
  }
}
