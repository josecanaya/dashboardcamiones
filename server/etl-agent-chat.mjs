/**
 * Puente del chat ETL a Claude Code headless (SUSCRIPCIÓN, sin API key).
 *
 * El endpoint /api/etl/agent/chat conserva la MISMA UI, pero en vez de llamar a
 * api.anthropic.com con ANTHROPIC_API_KEY (facturado por token) invoca el CLI de
 * Claude Code (`claude -p`) con la API key DESACTIVADA en el entorno del proceso
 * → usa la suscripción. Las tools y los subagentes los provee el MCP (.mcp.json)
 * + `.claude/agents/`, no este archivo.
 *
 * Requisito: `claude login` (suscripción) hecho para el CLI, y el ETL API arriba.
 * Nota: usar la suscripción para un backend servido es un workaround (los términos
 * de la suscripción apuntan a uso interactivo). Si querés el camino soportado,
 * volvé a la API key.
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const CHAT_TIMEOUT_MS = Number(process.env.ETL_AGENT_TIMEOUT_MS || 180_000)

const ALLOWED_TOOLS = [
  'Task',
  'mcp__etl__run_etl',
  'mcp__etl__list_runs',
  'mcp__etl__get_summary',
  'mcp__etl__list_tables',
  'mcp__etl__query_table',
  'mcp__etl__get_circuit_catalog',
  'mcp__etl__explain_journey',
  'mcp__etl__generar_pptx_comite',
]

const SYSTEM_APPEND =
  'Sos el agente de chat de logística ETL embebido en la web (planta Ricardone / ' +
  'Puerto San Lorenzo, Vicentin). Respondé la consulta consultando SIEMPRE las tools ' +
  'mcp__etl__* (nunca inventes cifras, patentes ni circuitos) y delegando a los ' +
  'subagentes con la Task tool cuando el dominio sea claro. Español, conciso, citá ' +
  'run_id y tablas usadas. Opcional: para una tarjeta estructurada en la UI, incluí ' +
  'un bloque <<AGENT_UI {json} AGENT_UI>> al final.'

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
  const lines = []
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
        prompt,
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
        child = spawn(cliPath, args, { cwd: projectRoot, env, windowsHide: true })
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
        const err = new Error('Timeout esperando a Claude Code.')
        err.code = 'TIMEOUT'
        reject(err)
      }, CHAT_TIMEOUT_MS)

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
          'Claude Code no está logueado. Abrí una terminal y corré `claude login` (suscripción), sin ANTHROPIC_API_KEY.'
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

  return { status, isConfigured, chat }
}
