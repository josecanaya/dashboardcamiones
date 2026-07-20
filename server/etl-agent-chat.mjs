/**
 * Puente del chat ETL a Claude Code headless (SUSCRIPCIÓN, sin API key).
 *
 * El endpoint /api/etl/agent/chat conserva la MISMA UI, pero en vez de llamar a
 * api.anthropic.com con ANTHROPIC_API_KEY (facturado por token) invoca el CLI de
 * Claude Code (`claude -p`) con la API key DESACTIVADA en el entorno del proceso
 * → usa la suscripción. Las tools y los subagentes los provee el MCP (.mcp.json)
 * + `.claude/agents/`, no este archivo.
 *
 * Requisito: `claude auth login` (suscripción) hecho para el CLI, y el ETL API arriba.
 * Nota: usar la suscripción para un backend servido es un workaround (los términos
 * de la suscripción apuntan a uso interactivo). Si querés el camino soportado,
 * volvé a la API key.
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

const CHAT_TIMEOUT_MS = Number(process.env.ETL_AGENT_TIMEOUT_MS || 300_000)

const ALLOWED_TOOLS = [
  'Task',
  'mcp__etl__resolve_window',
  'mcp__etl__run_etl',
  'mcp__etl__list_runs',
  'mcp__etl__get_summary',
  'mcp__etl__list_tables',
  'mcp__etl__query_table',
  'mcp__etl__get_circuit_catalog',
  'mcp__etl__explain_journey',
  'mcp__etl__generar_pptx_comite',
]

/**
 * Nombre técnico de tool + sus argumentos reales → acción en lenguaje claro,
 * mostrando EXACTAMENTE qué tabla/ventana está mirando (como una IA moderna).
 */
function toolLabel(name, input) {
  const inp = input && typeof input === 'object' ? input : {}
  switch (name) {
    case 'ToolSearch':
      return 'Preparando la consulta…'
    case 'mcp__etl__resolve_window':
      return inp.from_day && inp.to_day ?
          `Buscando datos del ${inp.from_day} al ${inp.to_day}…`
        : 'Buscando datos de esas fechas…'
    case 'mcp__etl__run_etl':
      return inp.from_day && inp.to_day ?
          `Procesando ${inp.from_day} al ${inp.to_day} (puede tardar)…`
        : 'Procesando el período (puede tardar)…'
    case 'mcp__etl__list_runs':
      return 'Revisando períodos disponibles…'
    case 'mcp__etl__get_summary':
      return 'Leyendo el resumen del período…'
    case 'mcp__etl__list_tables':
      return 'Viendo qué tablas de datos hay…'
    case 'mcp__etl__query_table': {
      const t = inp.table_name
      if (t && inp.col && inp.eq != null && inp.eq !== '') {
        return `Leyendo tabla ${t} · filtro ${inp.col}=${inp.eq}…`
      }
      return t ? `Leyendo tabla ${t}…` : 'Consultando los movimientos…'
    }
    case 'mcp__etl__get_circuit_catalog':
      return 'Revisando el catálogo de circuitos…'
    case 'mcp__etl__explain_journey':
      return inp.plate ? `Analizando el recorrido de ${inp.plate}…` : 'Analizando el recorrido…'
    case 'mcp__etl__generar_pptx_comite':
      return 'Armando el material de comité…'
    case 'Task':
    case 'Agent':
      return inp.subagent_type ?
          `Consultando al especialista (${inp.subagent_type})…`
        : 'Consultando a un especialista…'
    default:
      // Fallback informativo: nunca un genérico opaco.
      if (typeof name === 'string' && name.startsWith('mcp__etl__')) {
        return `Consultando datos (${name.replace('mcp__etl__', '').replace(/_/g, ' ')})…`
      }
      return name ? `Ejecutando ${name}…` : 'Analizando los datos…'
  }
}

const SYSTEM_APPEND = [
  'Sos un asistente de logística para la DIRECCIÓN de la planta Ricardone / Puerto San Lorenzo',
  '(Vicentin). Hablás con un usuario de NEGOCIO que NO es programador.',
  '',
  'CÓMO OBTENER DATOS (obligatorio):',
  '1. Si la pregunta menciona fechas/período → llamá mcp__etl__resolve_window(from_day, to_day).',
  '   Año por defecto si no lo dicen: 2026. Ej: "13 al 20" de julio → 2026-07-13 .. 2026-07-20.',
  '2. Con run_id vigente (stale=false) → mcp__etl__get_summary y/o mcp__etl__query_table /',
  '   mcp__etl__list_tables / mcp__etl__explain_journey. NUNCA inventes cifras.',
  '3. Si resolve_window da 404 o stale=true → podés mcp__etl__run_etl(from_day, to_day) y después',
  '   volver a resolve_window. Si el usuario no pidió reprocesar y no hay cache, decí:',
  '   "No tengo esa información procesada para ese período" y ofrecé procesarla.',
  '4. TABLAS CANÓNICAS (una pregunta = una tabla; ver docs/RUNS_TABLAS_CANONICAS.md). OBLIGATORIO:',
  '   - Conteos de movimientos/producto/plataforma (Excel contrato) → excel_operations_with_truckflow',
  '     (product_normalized, platform_normalized). NUNCA merged_truckflow_movimientos para contar.',
  '   - Movimientos sin evidencia de cámaras → excel_operations_with_truckflow con matched_journey_uids',
  '     vacío. NUNCA movimientos_without_truckflow_match (números inconsistentes).',
  '   - Clasificación ejecutiva/comité (completos, anomalías) → final_circuits.executive_bucket.',
  '     NUNCA debug_matrix_classification ni merged_truckflow_movimientos.executive_status (muerta).',
  '   - Tiempos → circuit_timing_summary (+circuit_timing_journeys). segment_timing_kpi puede estar vacía.',
  '   - Transiles → transile_externo_*; aceite/líquidos → liquid_movements_*.',
  '   Al dar un conteo, decí SIEMPRE el denominador: "X movimientos según Excel" ≠ "X recorridos de cámara".',
  '5. Las ventanas guardadas son SEMANAS calendario (lunes→domingo). Si piden un rango que no es una',
  '   semana exacta, usá la(s) semana(s) que lo cubren y aclaralo. No proceses ventanas ad-hoc solapadas.',
  '6. Delegá con Task a knowledge-contratos (producto/plataforma), knowledge-truckflow (cámaras/tiempos),',
  '   seguridad (anomalías) o comunicador (resumen comité) cuando el dominio sea claro.',
  '',
  'CÓMO HABLAR (al usuario):',
  '- Español claro y breve, estilo comité: cifra + conclusión corta.',
  '- NO menciones servidores, puertos, código, git, nombres de tools ni JSON.',
  '- Podés citar el período y cantidades; evitá jerga de desarrollo (run_id, nombres de tablas).',
  '- NUNCA digas "usá el dashboard web" si podés consultar vos con las tools.',
  '',
  'Opcional: para una tarjeta estructurada en la UI podés terminar con un bloque',
  '<<AGENT_UI {json} AGENT_UI>>.',
].join('\n')

/** Ubica el ejecutable de Claude Code: env override → paquete Desktop → PATH. */
function findClaudeCli() {
  const override = process.env.CLAUDE_CLI_PATH?.trim()
  if (override && existsSync(override)) return override

  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) {
    const pkgs = path.join(localAppData, 'Packages')
    try {
      for (const pkg of readdirSync(pkgs)) {
        if (!pkg.startsWith('Claude_')) continue
        const ccDir = path.join(pkgs, pkg, 'LocalCache', 'Roaming', 'Claude', 'claude-code')
        if (!existsSync(ccDir)) continue
        // Mayor versión primero (orden semver-ish descendente por nombre).
        const versions = readdirSync(ccDir).sort().reverse()
        for (const v of versions) {
          const exe = path.join(ccDir, v, 'claude.exe')
          if (existsSync(exe)) return exe
        }
      }
    } catch {
      /* ignorar: se cae al fallback de PATH */
    }
  }
  // Fallback: confiar en el PATH (Linux/mac o instalación standalone).
  return process.platform === 'win32' ? 'claude.exe' : 'claude'
}

function buildPrompt(message, history) {
  const lines = [
    'Respondé la consulta de logística usando las tools mcp__etl__* (resolve_window primero si hay fechas).',
    'No remitas al dashboard: consultá las corridas cacheadas y respondé con cifras reales.',
    '',
  ]
  const prev = Array.isArray(history) ? history.slice(-12) : []
  if (prev.length) {
    lines.push('Conversación previa:')
    for (const h of prev) {
      const who = h?.role === 'assistant' ? 'Agente' : 'Usuario'
      lines.push(`${who}: ${String(h?.content ?? '').slice(0, 4000)}`)
    }
    lines.push('')
  }
  lines.push(`Consulta actual del usuario: ${String(message ?? '')}`)
  return lines.join('\n')
}

function parseAgentUiBlock(reply) {
  const text = String(reply || '')
  const m = text.match(/<<AGENT_UI\s*([\s\S]*?)\s*AGENT_UI>>/)
  if (!m) return { plain: text.trim(), ui: null }
  try {
    const ui = JSON.parse(m[1].trim())
    return { plain: text.replace(m[0], '').trim(), ui }
  } catch {
    return { plain: text.trim(), ui: null }
  }
}

/** Extrae el objeto JSON final de la salida de `claude --output-format json`. */
function parseClaudeJson(stdout) {
  const trimmed = String(stdout || '').trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.lastIndexOf('{')
    if (start >= 0) {
      try {
        return JSON.parse(trimmed.slice(start))
      } catch {
        return null
      }
    }
    return null
  }
}

/**
 * @param {{ projectRoot: string, runsRoot: string, port: number, etlHeadlessScript: string }} ctx
 */
export function createEtlAgentChat({ projectRoot, port }) {
  const cliPath = findClaudeCli()
  const mcpConfigPath = path.join(projectRoot, '.mcp.json')
  const localBase = () => `http://127.0.0.1:${port}`

  function cliAvailable() {
    // 'claude'/'claude.exe' sin ruta = confiamos en PATH; rutas absolutas se verifican.
    if (cliPath === 'claude' || cliPath === 'claude.exe') return true
    return existsSync(cliPath)
  }

  function isConfigured() {
    return cliAvailable() && existsSync(mcpConfigPath)
  }

  function status() {
    return {
      configured: isConfigured(),
      model: 'claude-code (suscripción)',
      mode: 'claude-cli-subscription',
      cliPath,
      hasMcpConfig: existsSync(mcpConfigPath),
      subagents: ['knowledge-truckflow', 'knowledge-contratos', 'seguridad', 'comunicador'],
      note: 'Sin ANTHROPIC_API_KEY: corre en la suscripción vía Claude Code. Requiere `claude login`.',
    }
  }

  function runClaude(prompt) {
    return new Promise((resolve, reject) => {
      // API key DESACTIVADA en el proceso hijo → fuerza uso de la suscripción.
      const env = { ...process.env }
      delete env.ANTHROPIC_API_KEY
      delete env.ANTHROPIC_AUTH_TOKEN
      delete env.ANTHROPIC_BASE_URL
      env.ETL_API_BASE = localBase()

      const args = [
        '-p',
        '--output-format',
        'json',
        '--mcp-config',
        mcpConfigPath,
        '--append-system-prompt',
        SYSTEM_APPEND,
        '--allowedTools',
        ...ALLOWED_TOOLS,
      ]

      let child
      try {
        // Pasar el prompt por stdin (no como argumento) para evitar issues en Windows.
        child = spawn(cliPath, args, {
          cwd: projectRoot,
          env,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch (e) {
        const err = new Error(`No se pudo lanzar Claude Code (${cliPath}): ${e.message}`)
        err.code = 'NO_CLI'
        reject(err)
        return
      }

      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill()
        const tail = (stderr || stdout || '').slice(-400)
        const err = new Error(
          `Timeout (${Math.round(CHAT_TIMEOUT_MS / 1000)}s) esperando a Claude Code.` +
            (tail ? ` Último output: ${tail}` : '')
        )
        err.code = 'TIMEOUT'
        reject(err)
      }, CHAT_TIMEOUT_MS)

      // Enviar el prompt por stdin y cerrarlo.
      child.stdin.write(prompt)
      child.stdin.end()

      child.stdout.on('data', (d) => (stdout += d))
      child.stderr.on('data', (d) => (stderr += d))
      child.on('error', (e) => {
        clearTimeout(timer)
        const err = new Error(
          e.code === 'ENOENT'
            ? `Claude Code no encontrado (${cliPath}). Instalá el CLI o seteá CLAUDE_CLI_PATH.`
            : `Error lanzando Claude Code: ${e.message}`
        )
        err.code = 'NO_CLI'
        reject(err)
      })
      child.on('close', () => {
        clearTimeout(timer)
        resolve({ stdout, stderr })
      })
    })
  }

  async function chat({ message, history }) {
    if (!existsSync(mcpConfigPath)) {
      const err = new Error(`Falta .mcp.json en ${projectRoot} (config del servidor MCP etl).`)
      err.code = 'NO_MCP'
      throw err
    }

    const { stdout, stderr } = await runClaude(buildPrompt(message, history))
    const parsed = parseClaudeJson(stdout)
    if (!parsed) {
      const err = new Error(`Respuesta ilegible de Claude Code. stderr: ${stderr.slice(0, 400)}`)
      err.status = 502
      throw err
    }

    const resultText = String(parsed.result ?? '')
    if (parsed.is_error || parsed.subtype !== 'success') {
      if (/not logged in|please run \/login/i.test(resultText)) {
        const err = new Error(
          'Claude Code no está logueado. Abrí una terminal y corré `claude auth login` (suscripción), sin ANTHROPIC_API_KEY.'
        )
        err.code = 'NOT_LOGGED_IN'
        err.status = 503
        throw err
      }
      const err = new Error(`Claude Code error: ${resultText || parsed.terminal_reason || 'desconocido'}`)
      err.status = 502
      throw err
    }

    const { plain, ui } = parseAgentUiBlock(resultText)
    return {
      reply: plain || '(sin texto)',
      model: 'claude-code (suscripción)',
      ui,
      stopReason: parsed.stop_reason || 'end_turn',
      sessionId: parsed.session_id,
    }
  }

  /**
   * Igual que runClaude pero con --output-format stream-json: emite eventos
   * NDJSON en vivo. Llama onProgress(label) por cada tool_use y devuelve el
   * objeto `result` final (mismo shape que el json no-streaming).
   */
  function runClaudeStream(prompt, onProgress) {
    return new Promise((resolve, reject) => {
      const env = { ...process.env }
      delete env.ANTHROPIC_API_KEY
      delete env.ANTHROPIC_AUTH_TOKEN
      delete env.ANTHROPIC_BASE_URL
      env.ETL_API_BASE = localBase()

      const args = [
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--mcp-config',
        mcpConfigPath,
        '--append-system-prompt',
        SYSTEM_APPEND,
        '--allowedTools',
        ...ALLOWED_TOOLS,
      ]

      let child
      try {
        child = spawn(cliPath, args, {
          cwd: projectRoot,
          env,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch (e) {
        const err = new Error(`No se pudo lanzar Claude Code (${cliPath}): ${e.message}`)
        err.code = 'NO_CLI'
        reject(err)
        return
      }

      let buffer = ''
      let stderr = ''
      let resultObj = null

      const timer = setTimeout(() => {
        child.kill()
        const err = new Error(`Timeout (${Math.round(CHAT_TIMEOUT_MS / 1000)}s) esperando a Claude Code.`)
        err.code = 'TIMEOUT'
        reject(err)
      }, CHAT_TIMEOUT_MS)

      function handleEvent(evt) {
        if (!evt || typeof evt !== 'object') return
        if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
          for (const part of evt.message.content) {
            if (part?.type === 'tool_use' && part.name) {
              // Log crudo para afinar etiquetas si aparece alguna tool sin mapear.
              console.error(`[agent tool] ${part.name}`)
              try {
                onProgress?.(toolLabel(part.name, part.input))
              } catch {
                /* onProgress no debe romper el stream */
              }
            }
          }
        } else if (evt.type === 'result') {
          resultObj = evt
        }
      }

      child.stdin.write(prompt)
      child.stdin.end()

      child.stdout.on('data', (d) => {
        buffer += d
        let nl
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (!line) continue
          try {
            handleEvent(JSON.parse(line))
          } catch {
            /* línea parcial o no-JSON: ignorar */
          }
        }
      })
      child.stderr.on('data', (d) => (stderr += d))
      child.on('error', (e) => {
        clearTimeout(timer)
        const err = new Error(
          e.code === 'ENOENT'
            ? `Claude Code no encontrado (${cliPath}).`
            : `Error lanzando Claude Code: ${e.message}`
        )
        err.code = 'NO_CLI'
        reject(err)
      })
      child.on('close', () => {
        clearTimeout(timer)
        // procesar cualquier resto en el buffer
        const rest = buffer.trim()
        if (rest) {
          try {
            handleEvent(JSON.parse(rest))
          } catch {
            /* ignorar */
          }
        }
        resolve({ resultObj, stderr })
      })
    })
  }

  async function chatStream({ message, history }, onProgress) {
    if (!existsSync(mcpConfigPath)) {
      const err = new Error(`Falta .mcp.json en ${projectRoot} (config del servidor MCP etl).`)
      err.code = 'NO_MCP'
      throw err
    }

    const { resultObj, stderr } = await runClaudeStream(buildPrompt(message, history), onProgress)
    if (!resultObj) {
      const err = new Error(`Respuesta ilegible de Claude Code. stderr: ${stderr.slice(0, 400)}`)
      err.status = 502
      throw err
    }

    const resultText = String(resultObj.result ?? '')
    if (resultObj.is_error || resultObj.subtype !== 'success') {
      if (/not logged in|please run \/login/i.test(resultText)) {
        const err = new Error(
          'Claude Code no está logueado. Corré `claude auth login` (suscripción), sin ANTHROPIC_API_KEY.'
        )
        err.code = 'NOT_LOGGED_IN'
        err.status = 503
        throw err
      }
      const err = new Error(`Claude Code error: ${resultText || resultObj.terminal_reason || 'desconocido'}`)
      err.status = 502
      throw err
    }

    const { plain, ui } = parseAgentUiBlock(resultText)
    return {
      reply: plain || '(sin texto)',
      model: 'claude-code (suscripción)',
      ui,
      stopReason: resultObj.stop_reason || 'end_turn',
      sessionId: resultObj.session_id,
    }
  }

  return { status, isConfigured, chat, chatStream }
}
