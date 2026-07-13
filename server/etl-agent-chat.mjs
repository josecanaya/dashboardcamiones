/**
 * Chat del agente ETL vía Anthropic Messages API (tool-use).
 * La clave NUNCA sale al browser: solo SUPABASE/ANTHROPIC_* en .env del server.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = process.env.ORQUESTADOR_MODEL?.trim() || 'claude-sonnet-4-6'
const MAX_ROUNDS = 12

const SYSTEM = `Sos el orquestador analista de logística de planta Ricardone / Puerto San Lorenzo (Vicentin).
Respondés en el dashboard del comité ETL.

Tools: run_etl, list_runs, list_data_days, get_summary, list_tables, query_table, count_rows, get_circuit_catalog, explain_journey.

Reglas CRÍTICAS:
1. Si la pregunta es de datos, SIEMPRE usá tools. Nunca inventes cifras, patentes ni circuitos.
2. list_runs marca isFixtureSample=true en corridas de prueba (p.ej. s-events-slice, <50 eventos).
   - Esas corridas NO son totales de planta. Si el usuario pregunta "cuántos R7 / camiones / últimos KPIs de operación",
     NO uses un fixture como si fuera producción.
   - En ese caso: list_data_days → run_etl(from_day, to_day) sobre data/truckflow, o pedí el rango de fechas.
3. Para CONTAR (ej. cuántos R7): usá count_rows con table_name=final_circuits, col=executive_circuit_code, eq=R7.
   El número correcto es el campo total. NUNCA cuentes solo las filas devueltas por query_table (están limitadas).
4. Para explicar un R* (definición): get_circuit_catalog.
5. Respondé en español, citando run_id, eventCount e isFixtureSample cuando aplique. Si usaste un fixture, decilo explícitamente.`

function tool(name, description, properties, required) {
  const schema = { type: 'object', properties, additionalProperties: false }
  if (required?.length) schema.required = required
  return { name, description, input_schema: schema }
}

const TOOLS = [
  tool(
    'run_etl',
    'Ejecuta una corrida ETL y devuelve run_id. Para datos reales de planta usá from_day+to_day (YYYY-MM-DD) sobre data/truckflow. events_paths solo para fixtures de prueba.',
    {
      events_paths: { type: 'array', items: { type: 'string' } },
      excel_path: { type: 'string' },
      from_day: { type: 'string' },
      to_day: { type: 'string' },
    }
  ),
  tool(
    'list_runs',
    'Lista corridas. Revisá isFixtureSample y eventCount antes de usar una como "última corrida de planta".',
    { remote: { type: 'boolean' } }
  ),
  tool(
    'list_data_days',
    'Lista días disponibles en data/truckflow/ (event-list.json). Usar antes de run_etl con from_day/to_day.',
    {}
  ),
  tool(
    'get_summary',
    'KPIs ejecutivos de una corrida (committeeCompletos, anomalías, etc.).',
    { run_id: { type: 'string' } },
    ['run_id']
  ),
  tool('list_tables', 'Nombres de tablas de una corrida.', { run_id: { type: 'string' } }, [
    'run_id',
  ]),
  tool(
    'query_table',
    'Filas de una tabla (limitadas). Para conteos usá count_rows. Circuito ejecutivo: col=executive_circuit_code.',
    {
      run_id: { type: 'string' },
      table_name: { type: 'string' },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
      col: { type: 'string' },
      eq: { type: 'string' },
    },
    ['run_id', 'table_name']
  ),
  tool(
    'count_rows',
    'Cuenta filas de una tabla con filtro opcional col+eq. Devolvés { total }. Usar para "cuántos R7", etc. Columna tipica: executive_circuit_code.',
    {
      run_id: { type: 'string' },
      table_name: { type: 'string' },
      col: { type: 'string' },
      eq: { type: 'string' },
    },
    ['run_id', 'table_name']
  ),
  tool('get_circuit_catalog', 'Catálogo de circuitos R* (definiciones).', {}),
  tool(
    'explain_journey',
    'Busca evidencia de un viaje por plate y/o journey_uid en tablas de clasificación.',
    {
      run_id: { type: 'string' },
      plate: { type: 'string' },
      journey_uid: { type: 'string' },
      limit: { type: 'integer' },
    },
    ['run_id']
  ),
]

function truncateJson(obj, maxChars = 24_000) {
  const text = JSON.stringify(obj)
  if (text.length <= maxChars) return text
  return JSON.stringify({ _truncated: true, _chars: text.length, preview: text.slice(0, maxChars) })
}

/**
 * @param {{
 *   projectRoot: string
 *   runsRoot: string
 *   port: number
 *   etlHeadlessScript: string
 * }} ctx
 */
export function createEtlAgentChat({ projectRoot, runsRoot, port, etlHeadlessScript }) {
  const localBase = () => `http://127.0.0.1:${port}`

  function apiKey() {
    return process.env.ANTHROPIC_API_KEY?.trim() || ''
  }

  async function etlFetch(method, pathName, { json, params } = {}) {
    const u = new URL(pathName, localBase())
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue
        u.searchParams.set(k, String(v))
      }
    }
    const res = await fetch(u, {
      method,
      headers: json ? { 'Content-Type': 'application/json' } : undefined,
      body: json ? JSON.stringify(json) : undefined,
    })
    const text = await res.text()
    let body
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
    if (!res.ok) {
      return { error: `HTTP ${res.status}`, status: res.status, body }
    }
    return body
  }

  async function explainJourney(args) {
    const runId = String(args.run_id || '')
    const plate = String(args.plate || '').trim()
    const journeyUid = String(args.journey_uid || '').trim()
    const limit = Number(args.limit) || 20
    if (!plate && !journeyUid) return { error: 'Indicá plate y/o journey_uid' }
    const tablesDoc = await etlFetch('GET', `/api/etl/runs/${encodeURIComponent(runId)}/tables`)
    const available = new Set(tablesDoc?.tables || [])
    const candidates = [
      'final_circuits',
      'debug_matrix_classification',
      'clean_journeys',
      'unclassified_journeys',
      'classified_circuits',
    ]
    const evidence = {}
    for (const table of candidates) {
      if (!available.has(table)) continue
      const hits = []
      const tryCols =
        journeyUid ?
          ['journey_uid', 'journeyUid', 'uid']
        : []
      const plateCols = plate ? ['truck_plate', 'truckPlate', 'plate', 'normalized_plate', 'normalizedPlate'] : []
      for (const col of [...tryCols]) {
        const q = await etlFetch('GET', `/api/etl/runs/${encodeURIComponent(runId)}/tables/${table}`, {
          params: { limit, col, eq: journeyUid },
        })
        if (Array.isArray(q?.rows)) hits.push(...q.rows)
      }
      for (const col of plateCols) {
        const q = await etlFetch('GET', `/api/etl/runs/${encodeURIComponent(runId)}/tables/${table}`, {
          params: { limit, col, eq: plate },
        })
        if (Array.isArray(q?.rows)) hits.push(...q.rows)
      }
      const seen = new Set()
      const unique = []
      for (const row of hits) {
        const key = JSON.stringify(row)
        if (seen.has(key)) continue
        seen.add(key)
        unique.push(row)
      }
      if (unique.length) evidence[table] = unique.slice(0, limit)
    }
    return {
      run_id: runId,
      plate: plate || null,
      journey_uid: journeyUid || null,
      evidence,
    }
  }

  async function dispatchTool(name, args) {
    try {
      if (name === 'run_etl') {
        // Preferir spawn directo (evita deadlock HTTP al mismo proceso en POST sync largo).
        const eventsPaths = Array.isArray(args.events_paths) ? args.events_paths : []
        const fromDay = args.from_day ? String(args.from_day) : ''
        const toDay = args.to_day ? String(args.to_day) : ''
        const cliArgs = [etlHeadlessScript, '--out', runsRoot]
        for (const p of eventsPaths) {
          const abs = path.isAbsolute(p) ? p : path.resolve(projectRoot, p)
          cliArgs.push('--events', abs)
        }
        if (args.excel_path) {
          const xp = path.isAbsolute(args.excel_path)
            ? args.excel_path
            : path.resolve(projectRoot, String(args.excel_path))
          cliArgs.push('--excel', xp)
        }
        if (!eventsPaths.length && fromDay && toDay) {
          // Dejar que el endpoint resuelva días — fetch interno corto
          return await etlFetch('POST', '/api/etl/runs', {
            json: {
              from: fromDay,
              to: toDay,
              excelPath: args.excel_path || undefined,
              skipSupabase: true,
            },
          })
        }
        if (!eventsPaths.length) {
          return { error: 'Indicá events_paths o from_day+to_day' }
        }
        const result = spawnSync('npx', ['tsx', ...cliArgs], {
          cwd: projectRoot,
          encoding: 'utf8',
          shell: true,
          env: process.env,
          maxBuffer: 32 * 1024 * 1024,
        })
        const lines = String(result.stdout || '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
        const runId = lines[lines.length - 1] || ''
        if (result.status !== 0 || !runId) {
          return {
            error: 'Falló run_etl',
            status: result.status,
            stderr: String(result.stderr || '').slice(-2000),
          }
        }
        return { runId }
      }
      if (name === 'list_runs') {
        return await etlFetch('GET', '/api/etl/runs', {
          params: args.remote ? { remote: '1' } : undefined,
        })
      }
      if (name === 'list_data_days') {
        return await etlFetch('GET', '/api/etl/data-days')
      }
      if (name === 'get_summary') {
        return await etlFetch('GET', `/api/etl/runs/${encodeURIComponent(args.run_id)}/summary`)
      }
      if (name === 'list_tables') {
        return await etlFetch('GET', `/api/etl/runs/${encodeURIComponent(args.run_id)}/tables`)
      }
      if (name === 'query_table') {
        return await etlFetch(
          'GET',
          `/api/etl/runs/${encodeURIComponent(args.run_id)}/tables/${encodeURIComponent(args.table_name)}`,
          {
            params: {
              limit: args.limit ?? 100,
              offset: args.offset ?? 0,
              col: args.col,
              eq: args.eq,
            },
          }
        )
      }
      if (name === 'count_rows') {
        const q = await etlFetch(
          'GET',
          `/api/etl/runs/${encodeURIComponent(args.run_id)}/tables/${encodeURIComponent(args.table_name)}`,
          {
            params: {
              limit: 1,
              offset: 0,
              col: args.col,
              eq: args.eq,
            },
          }
        )
        if (q?.error) return q
        return {
          run_id: args.run_id,
          table_name: args.table_name,
          col: args.col ?? null,
          eq: args.eq ?? null,
          total: Number(q?.total ?? 0),
        }
      }
      if (name === 'get_circuit_catalog') {
        return await etlFetch('GET', '/api/etl/catalog/circuits')
      }
      if (name === 'explain_journey') {
        return await explainJourney(args)
      }
      return { error: `tool desconocida: ${name}` }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  async function anthropicCreate(messages) {
    const key = apiKey()
    if (!key) {
      const err = new Error(
        'Falta ANTHROPIC_API_KEY en el .env del repo (clave completa sk-ant-..., no el JSON de metadatos de la consola).'
      )
      err.code = 'NO_API_KEY'
      throw err
    }
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        system: SYSTEM,
        tools: TOOLS,
        messages,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = body?.error?.message || JSON.stringify(body).slice(0, 500)
      const err = new Error(`Anthropic HTTP ${res.status}: ${msg}`)
      err.status = res.status
      throw err
    }
    return body
  }

  function extractText(content) {
    if (!Array.isArray(content)) return ''
    return content
      .filter((b) => b?.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
  }

  /**
   * @param {{ message: string, history?: { role: string, content: string }[] }} input
   */
  async function chat({ message, history = [] }) {
    const messages = []
    for (const h of history.slice(-20)) {
      if (!h?.content) continue
      const role = h.role === 'assistant' ? 'assistant' : 'user'
      messages.push({ role, content: String(h.content) })
    }
    messages.push({ role: 'user', content: String(message || '').trim() })

    const toolTrace = []
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const resp = await anthropicCreate(messages)
      if (resp.stop_reason === 'tool_use') {
        const toolResults = []
        for (const block of resp.content || []) {
          if (block.type !== 'tool_use') continue
          const result = await dispatchTool(block.name, block.input || {})
          toolTrace.push({ name: block.name, input: block.input })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: truncateJson(result),
          })
        }
        messages.push({ role: 'assistant', content: resp.content })
        messages.push({ role: 'user', content: toolResults })
        continue
      }
      return {
        reply: extractText(resp.content) || '(sin texto)',
        model: DEFAULT_MODEL,
        toolTrace,
        stopReason: resp.stop_reason,
      }
    }
    return {
      reply: 'Se alcanzó el límite de rondas de tools sin respuesta final.',
      model: DEFAULT_MODEL,
      toolTrace,
      stopReason: 'max_rounds',
    }
  }

  return {
    isConfigured: () => Boolean(apiKey()),
    chat,
    status: () => ({
      configured: Boolean(apiKey()),
      model: DEFAULT_MODEL,
      hasHeadlessScript: existsSync(etlHeadlessScript),
    }),
  }
}
