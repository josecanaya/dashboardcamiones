/**
 * Chat del agente ETL vía Anthropic Messages API (tool-use).
 * La clave NUNCA sale al browser: solo SUPABASE/ANTHROPIC_* en .env del server.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { ORCHESTRATOR_SKILL, SUBAGENT_SKILLS } from './etl-agent-skills.mjs'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = process.env.ORQUESTADOR_MODEL?.trim() || 'claude-sonnet-4-6'
const MAX_ROUNDS = 12
const KNOWLEDGE_MODEL = process.env.KNOWLEDGE_MODEL?.trim() || 'claude-haiku-4-5-20251001'

const SYSTEM = ORCHESTRATOR_SKILL

const SUBAGENTS = Object.fromEntries(
  Object.entries(SUBAGENT_SKILLS).map(([id, s]) => [id, { system: s.system, tools: s.tools }])
)

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
  tool(
    'get_segment_kpi',
    'KPI de tiempos por tramo lógico (tabla segment_timing_kpi). Usar para Preingreso→Calada u otros tramos. from/to: PREINGRESO, CALADA, INGRESO, EGRESO, BALANZA_INGRESO, etc. circuit_code opcional (R1, R7…).',
    {
      run_id: { type: 'string' },
      from_logical: { type: 'string', description: 'Ej. PREINGRESO' },
      to_logical: { type: 'string', description: 'Ej. CALADA' },
      circuit_code: {
        type: 'string',
        description: 'Opcional. Si se omite, devolvés todos los circuitos de ese tramo + resumen.',
      },
    },
    ['run_id', 'from_logical', 'to_logical']
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
  tool(
    'delegar',
    'Delega a un subagente: knowledge_truckflow | knowledge_contratos | seguridad | comunicador.',
    {
      subagente: {
        type: 'string',
        enum: Object.keys(SUBAGENTS),
      },
      consulta: { type: 'string' },
      run_id: { type: 'string' },
    },
    ['subagente', 'consulta']
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
      if (name === 'get_segment_kpi') {
        const runId = String(args.run_id || '')
        const fromL = String(args.from_logical || '')
          .trim()
          .toUpperCase()
          .replace(/→/g, '>')
          .replace(/--/g, '>')
        const toL = String(args.to_logical || '')
          .trim()
          .toUpperCase()
          .replace(/→/g, '>')
          .replace(/--/g, '>')
        const circuit = args.circuit_code ? String(args.circuit_code).trim().toUpperCase() : ''
        const q = await etlFetch(
          'GET',
          `/api/etl/runs/${encodeURIComponent(runId)}/tables/segment_timing_kpi`,
          { params: { limit: 5000 } }
        )
        if (q?.error || q?.status === 404) {
          return {
            error:
              'No hay segment_timing_kpi en esta corrida. Volvé a correr run_etl (versiones nuevas persisten KPI tiempos).',
            hint: q,
          }
        }
        const rows = Array.isArray(q?.rows) ? q.rows : []
        const match = rows.filter((row) => {
          const from = String(row.from_logical || '').toUpperCase()
          const to = String(row.to_logical || '').toUpperCase()
          const label = String(row.transition_label || '').toUpperCase()
          const okPair =
            (from === fromL && to === toL) ||
            label.includes(`${fromL}→${toL}`) ||
            label.includes(`${fromL}>${toL}`) ||
            label.includes(`${fromL} -- ${toL}`)
          if (!okPair) return false
          if (!circuit) return true
          return String(row.executive_circuit_code || '').toUpperCase() === circuit
        })
        const parsed = match.map((row) => ({
          circuit: row.executive_circuit_code || '',
          from: row.from_logical,
          to: row.to_logical,
          label: row.transition_label,
          n: Number(row.n) || 0,
          mean_min: Number(row.mean_min) || 0,
          median_min: Number(row.median_min) || 0,
          p90_min: Number(row.p90_min) || 0,
          min_min: Number(row.min_min) || 0,
          max_min: Number(row.max_min) || 0,
        }))
        const weightSum = parsed.reduce((a, r) => a + r.n, 0)
        const weightedMean =
          weightSum > 0 ? parsed.reduce((a, r) => a + r.mean_min * r.n, 0) / weightSum : null
        return {
          run_id: runId,
          from_logical: fromL,
          to_logical: toL,
          circuit_code: circuit || null,
          rows: parsed,
          total_n: weightSum,
          weighted_mean_min: weightedMean != null ? Math.round(weightedMean * 100) / 100 : null,
          table_missing: false,
        }
      }
      if (name === 'get_circuit_catalog') {
        return await etlFetch('GET', '/api/etl/catalog/circuits')
      }
      if (name === 'explain_journey') {
        return await explainJourney(args)
      }
      if (name === 'delegar') {
        return { error: 'delegar solo desde el orquestador principal' }
      }
      return { error: `tool desconocida: ${name}` }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  async function anthropicCreate({ messages, system, tools, model }) {
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
        model: model || DEFAULT_MODEL,
        max_tokens: 4096,
        system: system || SYSTEM,
        tools: tools || TOOLS,
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

  function toolsByNames(names) {
    const set = new Set(names)
    return TOOLS.filter((t) => set.has(t.name) && t.name !== 'delegar')
  }

  async function runToolLoop({
    messages,
    system,
    tools,
    model,
    allowDelegate,
    toolTrace,
  }) {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const resp = await anthropicCreate({ messages, system, tools, model })
      if (resp.stop_reason === 'tool_use') {
        const toolResults = []
        for (const block of resp.content || []) {
          if (block.type !== 'tool_use') continue
          let result
          if (block.name === 'delegar') {
            if (!allowDelegate) {
              result = { error: 'delegación anidada no permitida' }
            } else {
              result = await runSubagente(
                String(block.input?.subagente || ''),
                String(block.input?.consulta || ''),
                block.input?.run_id ? String(block.input.run_id) : null,
                toolTrace
              )
            }
          } else {
            result = await dispatchTool(block.name, block.input || {})
          }
          toolTrace.push({ name: block.name, input: block.input, result })
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
        model: model || DEFAULT_MODEL,
        stopReason: resp.stop_reason,
      }
    }
    return {
      reply: 'Se alcanzó el límite de rondas de tools sin respuesta final.',
      model: model || DEFAULT_MODEL,
      stopReason: 'max_rounds',
    }
  }

  async function runSubagente(subId, consulta, runId, toolTrace) {
    const cfg = SUBAGENTS[subId]
    if (!cfg) return { error: `subagente desconocido: ${subId}` }
    const hint = runId ? `\n\nContexto: run_id=${runId}` : ''
    const out = await runToolLoop({
      messages: [{ role: 'user', content: consulta }],
      system: cfg.system + hint,
      tools: toolsByNames(cfg.tools),
      model: KNOWLEDGE_MODEL,
      allowDelegate: false,
      toolTrace,
    })
    return { subagente: subId, respuesta: out.reply }
  }

  function buildHighlights(toolTrace) {
    const highlights = []
    for (const step of [...toolTrace].reverse()) {
      const r = step.result
      if (!r || typeof r !== 'object' || r.error) continue
      if (step.name === 'get_segment_kpi' && r.weighted_mean_min != null) {
        highlights.push({
          label: `${r.from_logical || '?'} → ${r.to_logical || '?'}`,
          value: `${r.weighted_mean_min} min`,
          detail: `n=${r.total_n}${r.circuit_code ? ` · ${r.circuit_code}` : ' · todos los circuitos'}`,
        })
        break
      }
      if (step.name === 'count_rows' && typeof r.total === 'number') {
        highlights.push({
          label: r.eq ? `${r.table_name} = ${r.eq}` : r.table_name,
          value: String(r.total),
          detail: r.col ? `filtro ${r.col}` : 'filas',
        })
        break
      }
    }
    return highlights
  }

  function parseAgentUiBlock(reply) {
    const text = String(reply || '')
    const m = text.match(/<<AGENT_UI\s*([\s\S]*?)\s*AGENT_UI>>/)
    if (!m) return { plain: text.trim(), ui: null }
    try {
      const ui = JSON.parse(m[1].trim())
      const plain = text.replace(m[0], '').trim()
      return { plain, ui }
    } catch {
      return { plain: text.trim(), ui: null }
    }
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
    const out = await runToolLoop({
      messages,
      system: SYSTEM,
      tools: TOOLS,
      model: DEFAULT_MODEL,
      allowDelegate: true,
      toolTrace,
    })
    const publicTrace = toolTrace.map(({ name, input }) => ({ name, input }))
    const { plain, ui } = parseAgentUiBlock(out.reply)
    const delegated = [...toolTrace].reverse().find((t) => t.name === 'delegar' && t.result?.subagente)
    return {
      ...out,
      reply: plain || (ui?.verdict ? String(ui.verdict) : out.reply),
      ui,
      agentUsed: delegated?.result?.subagente || 'orquestador',
      toolTrace: publicTrace,
      highlights: buildHighlights(toolTrace),
    }
  }

  return {
    isConfigured: () => Boolean(apiKey()),
    chat,
    status: () => ({
      configured: Boolean(apiKey()),
      model: DEFAULT_MODEL,
      subagents: Object.keys(SUBAGENTS),
      hasHeadlessScript: existsSync(etlHeadlessScript),
    }),
  }
}
