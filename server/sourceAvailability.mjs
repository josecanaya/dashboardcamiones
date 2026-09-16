/**
 * Inspección de disponibilidad de fuentes crudas (event-list.json / alert-list.json)
 * bajo DATA_ROOT/YYYY-MM-DD/. Módulo puro, solo lectura: no escribe nada, no llama
 * a ETL/DSS. Ver docs/rediseno/cierre/CONTRATO.md §3 y docs/rediseno/cierre/tareas/R02.md.
 *
 * Nunca devuelve records, baseUrl, rutas físicas ni mensajes crudos de filesystem:
 * la salida de `inspectSourceFile`/`getSourceAvailability` se limita a
 * { state, count, fetchedAt }.
 */
import fs from 'fs/promises'
import path from 'path'

/** @typedef {'available'|'missing'|'partial'|'error'|'unknown'} SourceState */

function isValidIsoString(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  const ms = Date.parse(value)
  return !Number.isNaN(ms)
}

/**
 * Lee y clasifica un único archivo de fuente cruda (event-list.json o alert-list.json).
 * Nunca lanza: los errores de fs/JSON se traducen a `state: 'error'`.
 *
 * @param {string} filePath ruta absoluta al archivo.
 * @param {string} day día civil esperado (YYYY-MM-DD, el directorio del archivo).
 * @param {string} endpoint endpoint esperado en el payload ('journey-event/list' | 'alert/list').
 * @returns {Promise<{state: SourceState, count: number|null, fetchedAt: string|null}>}
 */
export async function inspectSourceFile(filePath, day, endpoint) {
  let raw
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return { state: 'missing', count: null, fetchedAt: null }
    }
    return { state: 'error', count: null, fetchedAt: null }
  }

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return { state: 'error', count: null, fetchedAt: null }
  }

  // Legacy: el archivo es directamente un array de filas, sin envoltorio con metadatos.
  // Tiene filas legibles, pero ninguna evidencia de alcance (sede/ventana/endpoint) → unknown.
  if (Array.isArray(payload)) {
    return { state: 'unknown', count: payload.length, fetchedAt: null }
  }

  if (!payload || typeof payload !== 'object') {
    return { state: 'error', count: null, fetchedAt: null }
  }

  const fetchedAt = isValidIsoString(payload.fetchedAt) ? payload.fetchedAt : null

  const hasErrorField =
    typeof payload.error === 'string' ? payload.error.trim().length > 0 : Boolean(payload.error)
  const recordsIsArray = Array.isArray(payload.records)

  if (hasErrorField || !recordsIsArray) {
    return { state: 'error', count: null, fetchedAt }
  }

  const count = payload.records.length

  const hasQueryStart = typeof payload.queryStart === 'string' && payload.queryStart.length > 0
  const hasQueryEnd = typeof payload.queryEnd === 'string' && payload.queryEnd.length > 0
  const hasSiteFilterKey = Object.prototype.hasOwnProperty.call(payload, 'siteFilter')
  const siteFilterIsGlobal = hasSiteFilterKey && payload.siteFilter === null
  const siteFilterIsSpecific = hasSiteFilterKey && payload.siteFilter !== null
  const hasEndpointField = typeof payload.endpoint === 'string' && payload.endpoint.length > 0

  if (hasQueryStart && hasQueryEnd) {
    // Archivo de ventana (export-window). Cubre el día completo solo si coincide
    // exactamente con el formato usado por exportSingleDay/buildListUrl para "día entero".
    const coversFullDay =
      payload.queryStart === `${day}T00:00:00` && payload.queryEnd === `${day}T23:59:59`
    if (!coversFullDay) {
      return { state: 'partial', count, fetchedAt }
    }
    if (!hasSiteFilterKey) {
      // Cubre el día completo pero sin indicador de sede: no asumir global implícito.
      return { state: 'unknown', count, fetchedAt }
    }
    if (siteFilterIsSpecific) {
      return { state: 'partial', count, fetchedAt }
    }
    // coversFullDay && siteFilterIsGlobal: cae a la evaluación de "export diario" (regla 3).
  } else if (!hasSiteFilterKey && !hasEndpointField) {
    // Legacy sin queryStart/queryEnd ni siteFilter ni endpoint: sin evidencia de alcance.
    return { state: 'unknown', count, fetchedAt }
  }

  const dayMatches = payload.day === day
  const endpointMatches = payload.endpoint === endpoint

  if (siteFilterIsGlobal && dayMatches && endpointMatches) {
    return { state: 'available', count, fetchedAt }
  }
  if (siteFilterIsSpecific) {
    return { state: 'partial', count, fetchedAt }
  }
  return { state: 'unknown', count, fetchedAt }
}

async function mapPool(items, worker, concurrency) {
  const results = new Array(items.length)
  let idx = 0
  async function runWorker() {
    while (idx < items.length) {
      const current = idx
      idx += 1
      results[current] = await worker(items[current], current)
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1))
  await Promise.all(Array.from({ length: n }, () => runWorker()))
  return results
}

/**
 * Recorre `days` (YYYY-MM-DD) bajo `dataRoot` con paralelismo acotado (máximo 4 días
 * simultáneos; dos archivos por día) y devuelve un `SourceDay[]` ordenado ascendente.
 *
 * @param {string} dataRoot directorio raíz (equivalente a DATA_ROOT del servidor).
 * @param {string[]} days días YYYY-MM-DD (no necesariamente ordenados).
 * @returns {Promise<Array<{day: string, events: object, alerts: object}>>}
 */
export async function getSourceAvailability(dataRoot, days) {
  const uniqueSorted = Array.from(new Set(days)).sort()
  const rows = await mapPool(
    uniqueSorted,
    async (day) => {
      const dayDir = path.join(dataRoot, day)
      const [events, alerts] = await Promise.all([
        inspectSourceFile(path.join(dayDir, 'event-list.json'), day, 'journey-event/list'),
        inspectSourceFile(path.join(dayDir, 'alert-list.json'), day, 'alert/list'),
      ])
      return { day, events, alerts }
    },
    4
  )
  return rows
}
