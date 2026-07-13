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
}

export type EtlAgentChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type EtlAgentChatResponse = {
  reply: string
  model?: string
  toolTrace?: { name: string; input?: unknown }[]
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
