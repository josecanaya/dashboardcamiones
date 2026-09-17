/**
 * Levanta go2rtc junto con el server, si hace falta.
 *
 * Por qué: el video en vivo necesita go2rtc escuchando en 1984 (es quien convierte
 * el RTSP de las cámaras Dahua en algo que el browser reproduce). Tenerlo como un
 * segundo proceso que alguien se tiene que acordar de arrancar es una fuente de
 * «no anda la cámara» que no es un problema real.
 *
 * Reglas:
 *   - Si ya hay un go2rtc escuchando (arrancado a mano o por otra instancia), no
 *     se arranca otro: se usa ese.
 *   - Si no está el binario, se avisa una vez y el server sigue andando. El resto
 *     del tablero no depende del video.
 *   - El proceso hijo muere con el padre: nada de go2rtc huérfanos.
 *
 * El binario se baja aparte (https://github.com/AlexxIT/go2rtc/releases) y va en
 * `tools/go2rtc/`, que está en .gitignore. Ver docs/POC_DSS_LIVE.md.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const PING_TIMEOUT_MS = 1_500
/** go2rtc tarda en atender el primer pedido; reintentamos un rato corto. */
const READY_TIMEOUT_MS = 8_000
const READY_POLL_MS = 250

/** Nombre del ejecutable según la plataforma. */
function binaryName() {
  return process.platform === 'win32' ? 'go2rtc.exe' : 'go2rtc'
}

/** ¿Hay alguien atendiendo la API de go2rtc? */
async function isUp(base) {
  try {
    const res = await fetch(`${base}/api/streams`, {
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Arranca go2rtc si no está corriendo.
 * @param {{ projectRoot: string }} opts
 * @returns {Promise<{ started: boolean; reason: string }>}
 */
export async function ensureGo2rtc({ projectRoot }) {
  const base = (process.env.GO2RTC_BASE?.trim() || 'http://127.0.0.1:1984').replace(/\/$/, '')

  if (await isUp(base)) {
    return { started: false, reason: 'ya estaba corriendo' }
  }

  // Solo tiene sentido arrancarlo si es local: un go2rtc remoto no lo levantamos nosotros.
  const host = (() => {
    try {
      return new URL(base).hostname
    } catch {
      return ''
    }
  })()
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    return { started: false, reason: `GO2RTC_BASE apunta a ${host}: se espera que lo levante esa máquina` }
  }

  const dir = path.join(projectRoot, 'tools', 'go2rtc')
  const exe = path.join(dir, binaryName())
  if (!existsSync(exe)) {
    return {
      started: false,
      reason: `falta ${path.relative(projectRoot, exe)} (bajar de github.com/AlexxIT/go2rtc/releases)`,
    }
  }

  const configPath = path.join(dir, 'go2rtc.yaml')
  const args = existsSync(configPath) ? ['-config', configPath] : []
  const child = spawn(exe, args, {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.on('error', (e) => {
    console.warn(`[go2rtc] no se pudo arrancar: ${e.message}`)
  })
  child.on('exit', (code, signal) => {
    if (code !== 0 && !signal) console.warn(`[go2rtc] terminó con código ${code}`)
  })
  // Solo los errores: el log normal de go2rtc es ruidoso y no aporta acá.
  child.stderr?.on('data', (b) => {
    const line = String(b).trim()
    if (line) console.warn(`[go2rtc] ${line}`)
  })

  /** Que no sobreviva al server: si cae el padre, se lleva al hijo. */
  const matar = () => {
    if (!child.killed) child.kill()
  }
  process.once('exit', matar)
  process.once('SIGINT', () => {
    matar()
    process.exit(0)
  })
  process.once('SIGTERM', () => {
    matar()
    process.exit(0)
  })

  const limite = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < limite) {
    if (await isUp(base)) return { started: true, reason: `arrancado desde ${path.relative(projectRoot, exe)}` }
    await new Promise((r) => setTimeout(r, READY_POLL_MS))
  }
  return { started: false, reason: 'arrancó pero no respondió a tiempo' }
}
