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

const RUN_TABLE_PAGE_SIZE = 10000

type RunTablePage = {
  headers?: string[]
  total?: number
  limit?: number
  offset?: number
  rows?: Record<string, unknown>[]
}

/**
 * Lee una tabla completa de una corrida cacheada, paginando con limit=10000
 * hasta acumular `total`. Rechaza inconsistencias entre páginas para evitar
 * devolver filas incompletas o mezcladas de distintas versiones del archivo.
 */
export async function fetchRunTable(
  runId: string,
  name: string
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const encRun = encodeURIComponent(runId)
  const encName = encodeURIComponent(name)
  const rows: Record<string, unknown>[] = []
  let headers: string[] = []
  let total: number | null = null
  let offset = 0
  let pages = 0

  while (true) {
    const url = `${base()}/runs/${encRun}/tables/${encName}?limit=${RUN_TABLE_PAGE_SIZE}&offset=${offset}`
    const res = await fetch(url, { cache: 'no-store' })
    const page = await parseJson<RunTablePage>(res)
    pages += 1

    if (!Array.isArray(page.rows)) {
      throw new Error(`Tabla ${name}: página sin filas (offset ${offset})`)
    }
    if (typeof page.offset === 'number' && page.offset !== offset) {
      throw new Error(`Tabla ${name}: offset devuelto ${page.offset} ≠ solicitado ${offset}`)
    }

    if (total === null) {
      if (typeof page.total !== 'number' || !Number.isFinite(page.total) || page.total < 0) {
        throw new Error(`Tabla ${name}: total inválido en primera página`)
      }
      total = page.total
      headers = Array.isArray(page.headers) ? page.headers : []
      if (total === 0) {
        return { headers, rows: [] }
      }
    } else {
      if (typeof page.total === 'number' && page.total !== total) {
        throw new Error(`Tabla ${name}: total cambió entre páginas (${total} → ${page.total})`)
      }
      if (
        Array.isArray(page.headers) &&
        (page.headers.length !== headers.length ||
          page.headers.some((h, i) => h !== headers[i]))
      ) {
        throw new Error(`Tabla ${name}: headers cambiaron entre páginas`)
      }
    }

    const remaining = total - rows.length
    if (page.rows.length === 0 && remaining > 0) {
      throw new Error(`Tabla ${name}: página vacía antes de completar (${rows.length}/${total})`)
    }

    rows.push(...page.rows)
    offset += page.rows.length

    if (rows.length >= total) break
    if (page.rows.length === 0) break
    if (pages > 1024) throw new Error(`Tabla ${name}: demasiadas páginas`)
  }

  if (rows.length !== total) {
    throw new Error(`Tabla ${name}: se recibieron ${rows.length}/${total} filas`)
  }
  return { headers, rows }
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
