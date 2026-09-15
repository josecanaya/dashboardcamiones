/**
 * NVAi — envoltorio del agente ETL con el snapshot de Plant State como contexto.
 * No calcula números: solo puede citar lo que viene en el snapshot (o decir que no se sabe).
 */

/**
 * @typedef {{ sector?: string, plate?: string, label?: string } | string | null | undefined} NvaiFocus
 */

/**
 * Serializa el snapshot con claves de fuente estables para el prompt.
 * @param {object} snapshot
 */
export function serializeSnapshotForPrompt(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { 'plant-state': null }
  }
  const plant = snapshot.plant ?? null
  const sectors = Array.isArray(snapshot.sectors) ? snapshot.sectors : []
  const edges = Array.isArray(snapshot.edges) ? snapshot.edges : []

  /** @type {Record<string, unknown>} */
  const out = {
    'plant-state': {
      site: snapshot.site ?? null,
      at: snapshot.at ?? null,
      plant,
      trucksOpen: snapshot.trucksOpen ?? null,
      generatedInMs: snapshot.generatedInMs ?? null,
    },
  }

  for (const s of sectors) {
    const code = String(s?.sectorCode ?? '').trim()
    if (!code) continue
    out[`sectors/${code}`] = s
    if (s?.status && s.status !== 'no_data') {
      // El status ya incorpora baseline en el server; se cita como "baseline" solo
      // cuando el agente habla del umbral habitual vs actual vía status/delta.
      out[`baseline/${code}`] = {
        note:
          'El status del sector se resolvió contra baseline del cuarto actual si había muestras suficientes; ' +
          'no hay cifras de baseline crudas en este snapshot. Si necesitás el número habitual y no está acá, decí que no se sabe.',
        status: s.status,
        present: s.present,
        delta40: s.delta40,
        rate60: s.rate60,
        dwellP90Min: s.dwellP90Min ?? null,
      }
    }
  }

  for (const e of edges) {
    const id = String(e?.id ?? '').trim()
    if (!id) continue
    out[`edges/${id}`] = e
  }

  return out
}

/**
 * Arma el mensaje completo para el agente (pregunta + snapshot + foco + reglas duras).
 * @param {{ question: string, site: string, focus?: NvaiFocus, snapshot: object }} args
 */
export function buildNvaiPrompt({ question, site, focus, snapshot }) {
  const sources = serializeSnapshotForPrompt(snapshot)
  const focusBlock =
    focus == null || focus === ''
      ? 'Sin foco específico (pregunta a nivel planta).'
      : typeof focus === 'string'
        ? `Foco del operador: ${focus}`
        : `Foco del operador (JSON): ${JSON.stringify(focus)}`

  return [
    'Sos NVAi, el asistente operacional de Truckflow (planta en vivo + ventanas ETL históricas).',
    `Sitio consultado: ${site}.`,
    '',
    'REGLAS DURAS (no negociables):',
    '1. NO calculés ningún número. No sumes, no restes, no estimés, no interpolés, no redondeés a ojo.',
    '2. Cada hecho numérico o de estado que cites DEBE llevar la clave de fuente exacta del snapshot',
    '   (ej. plant-state, sectors/S6, baseline/S6, edges/<id>).',
    '3. Si el dato no está en el bloque SNAPSHOT de abajo, respondé explícitamente que no se sabe.',
    '4. Podés usar tools ETL solo para ventanas históricas guardadas; para el «ahora» usá SOLO el snapshot.',
    '5. Respondé en español, conciso.',
    '',
    'Formato de respuesta (obligatorio al final del mensaje):',
    '<<NVAI_FACTS',
    '[{"text":"<hecho citado del snapshot>","source":"<clave exacta, ej. plant-state o sectors/S6>"}]',
    'NVAI_FACTS>>',
    'Antes del bloque, un párrafo breve de lectura operacional (sin números inventados).',
    'Si no hay hechos citables, el array va [] y el párrafo dice que no se sabe.',
    '',
    focusBlock,
    '',
    'SNAPSHOT (única fuente de cifras actuales; claves = source):',
    JSON.stringify(sources, null, 2),
    '',
    'Pregunta del operador:',
    String(question ?? '').trim(),
  ].join('\n')
}

/**
 * Ejecuta una consulta NVAi: snapshot actual + prompt + chatStream del agente ETL.
 * @param {{
 *   question: string,
 *   site?: string,
 *   focus?: NvaiFocus,
 *   history?: { role: string, content: string }[],
 *   getSnapshot: (site: string) => Promise<object>,
 *   chatStream: (args: { message: string, history: unknown[] }, onProgress: (label: string) => void) => Promise<object>,
 *   onProgress?: (label: string) => void,
 * }} args
 */
export async function askNvai({
  question,
  site = 'ricardone',
  focus,
  history = [],
  getSnapshot,
  chatStream,
  onProgress,
}) {
  const q = String(question ?? '').trim()
  if (!q) {
    const err = new Error('Falta question')
    err.code = 'bad_request'
    err.httpStatus = 400
    throw err
  }
  const siteKey = String(site ?? 'ricardone').trim().toLowerCase() || 'ricardone'
  const snapshot = await getSnapshot(siteKey)
  const message = buildNvaiPrompt({ question: q, site: siteKey, focus, snapshot })
  const out = await chatStream({ message, history: Array.isArray(history) ? history : [] }, (label) => {
    if (typeof onProgress === 'function') onProgress(label)
  })
  return { ...out, site: siteKey, snapshotAt: snapshot?.at ?? null }
}
