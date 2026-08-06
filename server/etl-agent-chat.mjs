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

/**
 * Sin `Task` a propósito: los subagentes de `.claude/agents/` están escritos
 * contra el modelo de tablas v13 (`final_circuits`, `circuit_timing_*`,
 * `excel_operations_with_truckflow`) que este prompt prohíbe. Delegar traía
 * cifras del mapa viejo que el orquestador después tenía que reconciliar —
 * era la causa de las consultas de 300s. Además cada subagente arranca en frío,
 * así que para una pregunta de una o dos tablas la delegación nunca paga.
 * El orquestador tiene todas las tools MCP que tenían ellos, incluida la de PPTX.
 */
const ALLOWED_TOOLS = [
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
  'RUTEO DE TABLAS — esto es el catálogo COMPLETO, con las columnas que vas a necesitar.',
  'Elegí la fila y andá directo (los nombres de columna son exactos, no los adivines):',
  '  cuántos movimientos / por producto / por plataforma → C_operaciones_con_camara',
  '      product_normalized, resolved_product, platform_normalized, plate_normalized,',
  '      resolved_executive_circuit_code, kgs_neto, total_min, movement_type',
  '  movimientos SIN evidencia de cámara → C_operaciones_sin_camara (mismas columnas + no_truckflow_reason)',
  '  recorridos válidos / qué circuito se usó más → D_circuitos_validos',
  '      circuito_code, circuito_label, plate, total_min, coverage_percent',
  '  anomalías de comportamiento → D_circuitos_anomalos (+ motivo)',
  '  recorridos con cobertura insuficiente → D_circuitos_incompletos',
  '  camión visto por cámara sin movimiento en el Excel → D_camiones_sin_contrato',
  '  tiempos / demoras / cuello de botella (agregado) → E_kpi_circuito',
  '      circuito_code, n_operaciones, mediana_min, p90_min, porcentaje_camara_pura,',
  '      y las PATAS: ric_*, bridge_*, sl_* (cada una con _media_min, _p90_min, _n)',
  '  tiempos de un recorrido o patente puntual → E_kpi_operacion',
  '  transiles → transile_externo_*;  aceite / líquidos → liquid_movements_*',
  '',
  'PRESUPUESTO DE BÚSQUEDA (obligatorio): UNA tabla por cada cosa que te preguntan, y una sola',
  'consulta por tabla. Si la pregunta tiene tres partes, son tres tablas — pero ninguna parte',
  'necesita más de una. Si te tienta consultar la misma tabla dos veces, mirá las columnas de',
  'arriba: el nombre que buscás está ahí. NO explores: NO llames list_tables salvo que el ruteo no',
  'cubra la pregunta. Una pregunta simple se responde con UNA tabla y punto.',
  '',
  'CÓMO CONSULTAR (query_table):',
  '- El filtro es igualdad exacta (col + eq) y los VALORES ESTÁN EN MAYÚSCULAS: SOJA, GIRASOL,',
  '  PELLET, INGRESO, EGRESO, VOLCABLE_1, KEPPLER_1, ACEITE_OSL. Escribilos así la primera vez;',
  '  no pruebes "Soja" y después "SOJA".',
  '- La respuesta trae `total` = cantidad de filas que matchean el filtro. Para CONTAR usá ese',
  '  número con limit=1: no hace falta traer las filas.',
  '- Para contar valores DISTINTOS (ej. patentes) sí hay que traer filas: limit alto y contás vos.',
  '',
  'DOS PRECISIONES QUE SE PIDEN SEGUIDO:',
  '- "cuántos CAMIONES" ≠ "cuántos movimientos": los movimientos son `total`; los camiones son',
  '  plate_normalized DISTINTAS (un camión repite viajes en la semana). Si piden camiones, traé',
  '  las filas y contá patentes únicas — se puede. Dá las dos cifras y aclarás cuál es cuál.',
  '- "DÓNDE está el cuello de botella" pide la PATA, no el circuito: comparás ric_media_min',
  '  (adentro de Ricardone), bridge_media_min (viaje Ric→SL) y sl_media_min (adentro de San',
  '  Lorenzo) en E_kpi_circuito. "Qué circuito es más lento" sí se responde con mediana_min.',
  '',
  'TABLAS PROHIBIDAS: excel_operations_with_truckflow, final_circuits, circuit_timing_*,',
  'segment_timing_*, segment_scatter_analysis, clean_journeys_for_analysis,',
  'movimientos_reconciliation, merged_truckflow_movimientos y debug_matrix_classification son del',
  'modelo VIEJO (v13): son insumo o derivadas y dan números que se contradicen entre sí. No las',
  'consultes ni las cites, aunque parezcan tener lo que buscás. El ruteo de arriba ya lo cubre.',
  '',
  'CÓMO OBTENER DATOS (obligatorio):',
  '1. Si la pregunta menciona fechas/período → llamá mcp__etl__resolve_window(from_day, to_day).',
  '   Año por defecto si no lo dicen: 2026. Ej: "13 al 20" de julio → 2026-07-13 .. 2026-07-20.',
  '   "esta semana" = la semana calendario en curso (lunes→domingo).',
  '2. Con run_id vigente (stale=false) → mcp__etl__query_table sobre la tabla del ruteo.',
  '   mcp__etl__get_summary sólo si piden un panorama general. NUNCA inventes cifras.',
  '3. Si resolve_window da 404 o stale=true → podés mcp__etl__run_etl(from_day, to_day) y después',
  '   volver a resolve_window. Si el usuario no pidió reprocesar y no hay cache, decí:',
  '   "No tengo esa información procesada para ese período" y ofrecé procesarla.',
  '4. Notas del modelo de niveles A→B→C→D→E (ver docs/NIVELES_ABCD.md):',
  '   - C_operaciones_sin_camara es un denominador APARTE: nunca lo sumes a C_operaciones_con_camara.',
  '     El motivo de cada fila está en no_truckflow_reason.',
  '   - D_circuitos_anomalos ya viene filtrada (sólo comportamiento afirmable, más de 3 lecturas de',
  '     cámara). No filtres nada más. D_circuitos_incompletos NO son anomalías.',
  '   - Los tiempos de E salen de la CÁMARA; el Excel es sólo respaldo. Mirá porcentaje_camara_pura',
  '     antes de afirmar una mediana: si es bajo, aclaralo.',
  '   - Al dar un conteo decí SIEMPRE el denominador: "X movimientos según Excel" ≠ "X recorridos',
  '     de cámara".',
  '5. Las ventanas guardadas son SEMANAS calendario (lunes→domingo). Si piden un rango que no es una',
  '   semana exacta, usá la(s) semana(s) que lo cubren y aclaralo. No proceses ventanas ad-hoc solapadas.',
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

/* ------------------------------------------------------------------ tokens */

const numTok = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Suma un bloque de usage (camelCase o snake_case) sobre el acumulador. */
function sumarUso(acc, u) {
  acc.entrada += numTok(u.input_tokens ?? u.inputTokens)
  acc.salida += numTok(u.output_tokens ?? u.outputTokens)
  acc.cacheCreacion += numTok(u.cache_creation_input_tokens ?? u.cacheCreationInputTokens)
  acc.cacheLectura += numTok(u.cache_read_input_tokens ?? u.cacheReadInputTokens)
  acc.costoUsd += numTok(u.costUSD ?? u.cost_usd)
  return acc
}

/**
 * Tokens gastados por la consulta, sacados del evento `result` de Claude Code.
 *
 * Se prefiere `modelUsage` (desglose por modelo, ACUMULADO de todo el turno:
 * incluye las llamadas intermedias de tools y los subagentes) sobre `usage`,
 * que en algunas versiones del CLI trae sólo el último mensaje y subreporta.
 * Si no hay ninguno de los dos, devuelve ceros — nunca rompe la respuesta.
 *
 * `entrada` son tokens de entrada NUEVOS; los de caché van aparte porque se
 * facturan distinto (escritura ~1.25×, lectura ~0.1×) y sumarlos sin decirlo
 * confunde el número.
 */
export function extraerUso(resultObj) {
  const acc = {
    entrada: 0,
    salida: 0,
    cacheCreacion: 0,
    cacheLectura: 0,
    costoUsd: 0,
    modelos: [],
  }
  if (!resultObj || typeof resultObj !== 'object') return acc

  const porModelo = resultObj.modelUsage
  if (porModelo && typeof porModelo === 'object' && Object.keys(porModelo).length) {
    for (const [modelo, u] of Object.entries(porModelo)) {
      if (!u || typeof u !== 'object') continue
      acc.modelos.push(modelo)
      sumarUso(acc, u)
    }
  } else if (resultObj.usage && typeof resultObj.usage === 'object') {
    sumarUso(acc, resultObj.usage)
  }

  // `total_cost_usd` es el costo del turno completo; se usa si el desglose no lo trae.
  if (!acc.costoUsd) acc.costoUsd = numTok(resultObj.total_cost_usd)
  return acc
}

/* ---------------------------------------------------- límite de suscripción */

/**
 * Fracción del límite de la CUENTA que este dashboard puede consumir.
 *
 * El límite de sesión es de la cuenta (lo comparte con Claude Code interactivo,
 * claude.ai, etc.). Acá se reserva sólo una parte para el chat, así que el
 * porcentaje que se muestra está escalado: con share=0.5, gastar el 4% de la
 * cuenta significa haber usado el 8% de lo que le toca al dashboard.
 */
const SHARE = (() => {
  const v = Number(process.env.ETL_AGENT_SHARE)
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.5
})()

/** Ventana de caché del `/usage`. Es gratis, pero spawnear el CLI cuesta ~2s. */
const USO_TTL_MS = 30_000

/**
 * Parsea la salida de `/usage`. Formato al 2026-08:
 *   Current session: 32% used · resets Aug 6, 9:10pm (America/Buenos_Aires)
 *   Current week (all models): 27% used · resets Aug 10, 12pm (America/Buenos_Aires)
 * Si el formato cambia devuelve null en el tramo que no pudo leer, nunca inventa.
 */
export function parsearLimite(texto, share = SHARE) {
  const t = String(texto || '')
  const tramo = (re) => {
    const m = re.exec(t)
    if (!m) return null
    const cuentaPct = Number(m[1])
    if (!Number.isFinite(cuentaPct)) return null
    // El % que informa Claude Code es sobre la CUENTA. Escalado a la porción
    // reservada para el dashboard: 32% de cuenta con share 0.5 → 64% del cupo.
    const propioPct = Math.min(100, Math.round(cuentaPct / share))
    return {
      cuentaPct,
      propioPct,
      disponiblePct: Math.max(0, 100 - propioPct),
      resetAt: (m[2] || '').trim() || null,
    }
  }
  return {
    share,
    sesion: tramo(/Current session:\s*(\d+)%\s*used(?:\s*·\s*resets\s*([^(\n]+))?/i),
    semana: tramo(/Current week[^:]*:\s*(\d+)%\s*used(?:\s*·\s*resets\s*([^(\n]+))?/i),
  }
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

  /**
   * Argumentos del CLI. Uno solo para las dos rutas (json y stream-json): antes
   * estaban duplicados y se desincronizaban.
   *
   * `--allowedTools` va SIEMPRE ÚLTIMO: es variádico y se come cualquier flag
   * que venga después.
   */
  const argsClaude = (formato) => [
    '-p',
    '--output-format',
    formato,
    ...(formato === 'stream-json' ? ['--verbose'] : []),
    '--mcp-config',
    mcpConfigPath,
    // Sólo el MCP `etl`: cualquier otro server configurado en la máquina
    // agrandaría la superficie de tools y da más lugar a que se pierda.
    '--strict-mcp-config',
    // Estas consultas son lecturas de una o dos tablas, no investigación.
    // `medium` responde igual de bien y en bastante menos tiempo.
    '--effort',
    process.env.ETL_AGENT_EFFORT || 'medium',
    // Cinturón y tiradores: Task ya no está en ALLOWED_TOOLS (ver arriba), pero
    // si el CLI algún día lo habilita por defecto, esto lo corta igual.
    '--disallowedTools',
    'Task',
    '--append-system-prompt',
    SYSTEM_APPEND,
    '--allowedTools',
    ...ALLOWED_TOOLS,
  ]

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
      // Sin subagentes: el chat no delega (ver ALLOWED_TOOLS). Los .md de
      // `.claude/agents/` siguen ahí para Claude Code interactivo, pero este
      // endpoint no los usa.
      subagents: [],
      effort: process.env.ETL_AGENT_EFFORT || 'medium',
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

      const args = argsClaude('json')

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

  /**
   * Cupo restante de la suscripción, vía `claude -p "/usage"`.
   *
   * `/usage` es un comando LOCAL: no llama al modelo, cuesta US$ 0 y 0 tokens
   * (verificado). Lo único que cuesta es spawnear el CLI (~2s), por eso el
   * caché. Se invoca sin --mcp-config ni system prompt: no los necesita y así
   * no levanta el server MCP al pedo.
   */
  let cacheLimite = { at: 0, valor: null }

  function limiteSesion() {
    if (Date.now() - cacheLimite.at < USO_TTL_MS && cacheLimite.valor) {
      return Promise.resolve(cacheLimite.valor)
    }
    return new Promise((resolve) => {
      const env = { ...process.env }
      delete env.ANTHROPIC_API_KEY
      delete env.ANTHROPIC_AUTH_TOKEN
      delete env.ANTHROPIC_BASE_URL

      let child
      try {
        child = spawn(cliPath, ['-p', '--output-format', 'json'], {
          cwd: projectRoot,
          env,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch {
        resolve(null)
        return
      }

      let stdout = ''
      const timer = setTimeout(() => {
        child.kill()
        resolve(null)
      }, 20_000)

      child.stdin.write('/usage')
      child.stdin.end()
      child.stdout.on('data', (d) => (stdout += d))
      child.stderr.on('data', () => {})
      child.on('error', () => {
        clearTimeout(timer)
        resolve(null)
      })
      child.on('close', () => {
        clearTimeout(timer)
        const parsed = parseClaudeJson(stdout)
        const texto = String(parsed?.result ?? '')
        // Con ANTHROPIC_API_KEY el texto no habla de suscripción y no hay cupo
        // que mostrar: mejor no mostrar nada que mostrar un número inventado.
        if (!texto || !/Current session:/i.test(texto)) {
          resolve(null)
          return
        }
        const valor = parsearLimite(texto)
        cacheLimite = { at: Date.now(), valor }
        resolve(valor)
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
      uso: extraerUso(parsed),
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

      const args = argsClaude('stream-json')

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
      uso: extraerUso(resultObj),
      stopReason: resultObj.stop_reason || 'end_turn',
      sessionId: resultObj.session_id,
    }
  }

  return { status, isConfigured, chat, chatStream, limiteSesion }
}
