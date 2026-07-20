/**
 * Cliente del cache por ventana (proxy Vite → :8787).
 * Materializado en runs/windows/<from>_<to>/ (runId estable; se pisa al reprocesar).
 */

function base(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return '/api/etl'
  const env = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_ETL_API_PREFIX : undefined
  if (typeof env === 'string' && env.trim()) return env.trim().replace(/\/$/, '')
  return '/api/etl'
}

export type ResolveWindowResult = {
  from: string
  to: string
  runId: string
  inputHash: string
  rulesVersion: string
  createdAt: string
  stale: boolean
  currentRulesVersion: string
}

export type SavedWindow = {
  from: string
  to: string
  runId: string
  rulesVersion: string
  createdAt: string
  stale: boolean
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

/** Run cacheado para la ventana, o null si no hay (404). */
export async function resolveWindow(from: string, to: string): Promise<ResolveWindowResult | null> {
  const url = `${base()}/resolve-window?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 404) return null
  return parseJson<ResolveWindowResult>(res)
}

/** Lista de ventanas (procesos) guardadas, más reciente primero. */
export async function listWindows(): Promise<SavedWindow[]> {
  const res = await fetch(`${base()}/windows`, { cache: 'no-store' })
  const body = await parseJson<{ windows: SavedWindow[] }>(res)
  return body.windows ?? []
}

export async function getRunSummary(runId: string): Promise<{
  runId: string
  manifest: Record<string, unknown>
  stats: Record<string, unknown>
}> {
  const res = await fetch(`${base()}/runs/${encodeURIComponent(runId)}/summary`, { cache: 'no-store' })
  return parseJson(res)
}

export async function listRunTables(runId: string): Promise<string[]> {
  const res = await fetch(`${base()}/runs/${encodeURIComponent(runId)}/tables`, { cache: 'no-store' })
  const body = await parseJson<{ tables: string[] }>(res)
  return body.tables ?? []
}

export async function fetchRunTable(
  runId: string,
  name: string
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const url = `${base()}/runs/${encodeURIComponent(runId)}/tables/${encodeURIComponent(name)}?limit=10000`
  const res = await fetch(url, { cache: 'no-store' })
  return parseJson(res)
}

/** POST /api/etl/runs: devuelve el run cacheado en ms salvo force=true. */
export async function requestRunEtl(
  from: string,
  to: string,
  opts?: { force?: boolean }
): Promise<{ runId: string; cached?: boolean }> {
  const res = await fetch(`${base()}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, skipSupabase: true, force: opts?.force === true }),
  })
  return parseJson(res)
}
