import { localApiPrefix } from './truckflowLocalServerApi'

/** Errores de red del navegador al proxy / servidor 8787. */
export function formatLocalTruckflowFetchError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg === 'Failed to fetch' || msg.includes('fetch failed') || msg.includes('NetworkError')) {
    return (
      'No hay conexión con el servidor local (puerto 8787). ' +
      'En otra terminal del proyecto ejecutá: npm run server:truckflow. ' +
      'Si ya está corriendo, reinicialo tras cambios en server/.'
    )
  }
  return msg
}

export async function fetchLocalTruckflow(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const prefix = localApiPrefix()
  const url = path.startsWith('http') ? path : `${prefix}${path.startsWith('/') ? path : `/${path}`}`
  try {
    return await fetch(url, init)
  } catch (e) {
    throw new Error(formatLocalTruckflowFetchError(e), { cause: e })
  }
}

const PING_TIMEOUT_MS = 8_000

export async function pingLocalTruckflowServer(): Promise<{
  ok: boolean
  fleetRegistryStorage?: string
  supabaseConfigured?: boolean
  supabaseHost?: string | null
  error?: string
}> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), PING_TIMEOUT_MS)
  try {
    const res = await fetchLocalTruckflow('/health', {
      headers: { Accept: 'application/json' },
      signal: ctl.signal,
    })
    const body = (await res.json()) as {
      ok?: boolean
      fleetRegistryStorage?: string
      supabaseConfigured?: boolean
      supabaseHost?: string | null
      error?: string
    }
    if (!res.ok) {
      return { ok: false, error: body.error ?? `HTTP ${res.status}` }
    }
    return {
      ok: Boolean(body.ok),
      fleetRegistryStorage: body.fleetRegistryStorage,
      supabaseConfigured: body.supabaseConfigured,
      supabaseHost: body.supabaseHost,
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return {
        ok: false,
        error:
          'El servidor en 8787 no respondió a tiempo. Iniciá o reiniciá npm run server:truckflow.',
      }
    }
    return { ok: false, error: formatLocalTruckflowFetchError(e) }
  } finally {
    clearTimeout(t)
  }
}
