// Deja reconocido el día anterior sin que nadie lo pida: a las 03:45 (hora de Argentina, cuando ya llegó lo de la
// noche) corre scripts/reconocer.mjs para ayer como proceso hijo. Si falla, lo registra con el motivo y reintenta
// cada hora (hasta MAX_INTENTOS). Si data/reconocido/<ayer>/manifest.json ya existe no corre. RECONOCER_AUTO=0 lo apaga.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { existsSync } from 'node:fs'

export const HORA_AUTO = { h: 3, m: 45 }
export const MAX_INTENTOS = 4
const REINTENTO_MS = 60 * 60_000
const arDate = (ms) => new Date(ms - 3 * 3600_000)
const arDay = (ms) => arDate(ms).toISOString().slice(0, 10)

/**
 * Decide si corresponde correr ahora.
 * @param {number} nowMs
 * @param {{ dia: string|null, ok: boolean, intentos: number, ultimoMs: number }} estado lo último intentado
 * @returns {string|null} el día a reconocer (ayer) o null
 */
export function diaARecorrer(nowMs, estado) {
  const a = arDate(nowMs)
  if (a.getUTCHours() * 60 + a.getUTCMinutes() < HORA_AUTO.h * 60 + HORA_AUTO.m) return null
  const ayer = arDay(nowMs - 86_400_000)
  if (estado.dia !== ayer) return ayer
  if (estado.ok || estado.intentos >= MAX_INTENTOS) return null
  return nowMs - estado.ultimoMs >= REINTENTO_MS ? ayer : null
}

/** @param {{ projectRoot: string, log?: Pick<Console,'log'|'warn'>, nowFn?: () => number, spawnFn?: typeof spawn }} o */
export function createReconocerAuto({ projectRoot, log = console, nowFn = Date.now, spawnFn = spawn, existsFn = existsSync }) {
  const estado = { dia: null, ok: false, intentos: 0, ultimoMs: 0, corriendo: false, error: null }
  let timer = null

  function correr(dia) {
    estado.corriendo = true
    estado.intentos = estado.dia === dia ? estado.intentos + 1 : 1
    estado.dia = dia
    estado.ok = false
    estado.ultimoMs = nowFn()
    let err = ''
    const child = spawnFn(process.execPath, [path.join(projectRoot, 'scripts', 'reconocer.mjs'), dia, dia], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout?.on('data', () => {})
    child.stderr?.on('data', (d) => { err = (err + d).slice(-2000) })
    child.on('error', (e) => { err = e.message })
    child.on('close', (code) => {
      estado.corriendo = false
      estado.ok = code === 0
      estado.error = code === 0 ? null : (err.trim() || `código ${code}`)
      if (code === 0) log.log(`[reconocer] ${dia} reconocido`)
      else log.warn(`[reconocer] ${dia} falló (intento ${estado.intentos}/${MAX_INTENTOS}): ${estado.error}`)
    })
  }

  // Si el día ya quedó en disco (manifest.json), no se repite: el estado en memoria se pierde con cada reinicio
  // del servidor y sin esto cada arranque volvía a reconocer ayer entero (~2 GB y disco al 100 %).
  const yaReconocido = (dia) => existsFn(path.join(projectRoot, 'data', 'reconocido', dia, 'manifest.json'))

  function tick() {
    if (estado.corriendo) return
    const dia = diaARecorrer(nowFn(), estado)
    if (!dia) return
    if (yaReconocido(dia)) {
      Object.assign(estado, { dia, ok: true, error: null })
      return
    }
    correr(dia)
  }

  return {
    start() {
      if (timer || process.env.RECONOCER_AUTO === '0') return
      timer = setInterval(tick, 60_000)
      timer.unref?.()
    },
    tick,
    status: () => ({ ...estado }),
  }
}
