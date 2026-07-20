/** Cliente del agente ETL (proxy Vite → :8787 /api/etl). */

export function etlApiPrefix(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return '/api/etl'
  const env = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_ETL_API_PREFIX : undefined
  if (typeof env === 'string' && env.trim()) return env.trim().replace(/\/$/, '')
  return '/api/etl'
}

export type EtlAgentStatus = {
  configured: boolean
  model: string
  hasHeadlessScript?: boolean
  subagents?: string[]
}

export type EtlAgentChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type EtlAgentUiPayload = {
  title: string
  verdict?: string
  context?: { runId?: string; scope?: string }
  metrics?: { label: string; value: string; hint?: string; tone?: 'neutral' | 'good' | 'warn' | 'critical' }[]
  rankings?: {
    label: string
    sublabel?: string
    emphasize?: boolean
    values?: { k: string; v: string }[]
  }[]
  findings?: string[]
  ask?: string | null
}

export type EtlAgentChatResponse = {
  reply: string
  model?: string
  toolTrace?: { name: string; input?: unknown }[]
  highlights?: { label: string; value: string; detail?: string }[]
  ui?: EtlAgentUiPayload | null
  agentUsed?: string
  stopReason?: string
  error?: string
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
      body && typeof body === 'object' && 'error' in body ?
        String((body as { error?: unknown }).error)
      : text
    throw new Error(err || `Error HTTP ${res.status}`)
  }
  return body as T
}

export async function getEtlAgentStatus(): Promise<EtlAgentStatus> {
  const res = await fetch(`${etlApiPrefix()}/agent/status`, { cache: 'no-store' })
  return parseJson<EtlAgentStatus>(res)
}

export async function postEtlAgentChat(
  message: string,
  history: EtlAgentChatMessage[]
): Promise<EtlAgentChatResponse> {
  const res = await fetch(`${etlApiPrefix()}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  })
  return parseJson<EtlAgentChatResponse>(res)
}

/**
 * Igual que postEtlAgentChat pero lee el stream NDJSON del server y reporta
 * cada acción del agente en vivo vía onProgress(label). Devuelve la respuesta final.
 */
export async function streamEtlAgentChat(
  message: string,
  history: EtlAgentChatMessage[],
  onProgress: (label: string) => void
): Promise<EtlAgentChatResponse> {
  const res = await fetch(`${etlApiPrefix()}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  })
  if (!res.ok || !res.body) {
    // Fallback: el server respondió error no-stream (ej. 503 config).
    return parseJson<EtlAgentChatResponse>(res)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let final: EtlAgentChatResponse | null = null
  let errored: string | null = null

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let evt: { type?: string; label?: string; error?: string } & EtlAgentChatResponse
    try {
      evt = JSON.parse(trimmed)
    } catch {
      return
    }
    if (evt.type === 'progress' && evt.label) onProgress(evt.label)
    else if (evt.type === 'done') final = evt
    else if (evt.type === 'error') errored = evt.error || 'Error del agente'
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
  if (!final) throw new Error('El agente no devolvió respuesta.')
  return final
}
