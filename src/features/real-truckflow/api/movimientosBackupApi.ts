/** Cliente del backup local de Movimientos por Contrato (proxy Vite → :8787). */

function movimientosApiPrefix(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return '/api/movimientos'
  const env = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_ETL_API_PREFIX : undefined
  if (typeof env === 'string' && env.trim()) {
    return env.trim().replace(/\/$/, '').replace(/\/etl$/, '') + '/movimientos'
  }
  return '/api/movimientos'
}

export type MovimientosBackupDay = { day: string; rows: number }
export type MovimientosBackupCoverage = {
  dataRoot?: string
  days: MovimientosBackupDay[]
  totalRows: number
  totalDays: number
}
export type MovimientosIngestResult = {
  ok: boolean
  file: string
  summary: string
  coverage: MovimientosBackupCoverage
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

export async function getMovimientosBackupCoverage(): Promise<MovimientosBackupCoverage> {
  const res = await fetch(`${movimientosApiPrefix()}/list-days`, { cache: 'no-store' })
  return parseJson<MovimientosBackupCoverage>(res)
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(file)
  })
}

export async function postMovimientosIngest(file: File): Promise<MovimientosIngestResult> {
  const base64 = await fileToBase64(file)
  const res = await fetch(`${movimientosApiPrefix()}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, base64 }),
  })
  return parseJson<MovimientosIngestResult>(res)
}
