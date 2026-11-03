/**
 * El vínculo en En vivo: cada N minutos corre scripts/vinculo/cobertura.mjs (el mismo algoritmo que el 02/11
 * reconstruyó el 99,3 % de los viajes) sobre lo que el servidor tiene en memoria —lecturas y alertas de las dos
 * plantas, y las cartas vigentes del padrón— y deja, por captura, a qué camión con carta la asignó y con qué
 * probabilidad. El servicio las aplica como una capa más (regla `vinculo`) a las capturas que el reconocedor
 * dejó sin resolver.
 *
 * Corre el script como proceso aparte en una carpeta temporal (no toca data/ ni reportes/). Ver el traspaso
 * docs/CONTINUAR_2026-11-03_reconocedor-y-vinculo.md, «Siguiente paso», camino 1.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const arDay = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
const plateOf = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const TIMEOUT_MS = 4 * 60_000

/**
 * Asignaciones del resultado del vínculo, una por captura: las lecturas que el vínculo atribuye a un camión con
 * carta sin que la patente leída sea la de la carta (corregidas a 1 carácter, «mismo paso») y las capturas
 * sin dueño repartidas al camión más probable.
 * @returns {{ device: string, t: number, readPlate: string, plate: string, ctg: string|null, prob: number, como: string }[]}
 */
export function assignmentsFromCobertura(cob) {
  const out = []
  for (const tr of cob.camiones ?? []) {
    for (const l of tr.lecturas ?? []) {
      if (l.clase === 'carta' && tr.plates?.includes(l.patente)) continue // leída bien: no hay nada que asignar
      out.push({ device: l.camara, t: Date.parse(l.at), readPlate: plateOf(l.patente), plate: tr.plate, ctg: tr.ctg, prob: 1, como: l.clase })
    }
  }
  for (const c of cob.capturas ?? []) {
    const r = c.rivales?.[0]
    if (!r) continue
    out.push({ device: c.camara, t: Date.parse(c.at), readPlate: plateOf(c.patente), plate: r.patente, ctg: r.ctg, prob: r.prob / 100, como: r.por === 'leido' ? 'misma_pasada' : 'paso_pendiente', rival: c.rivales[1] ? { plate: c.rivales[1].patente, prob: c.rivales[1].prob / 100 } : null })
  }
  return out
}

/**
 * @param {{ projectRoot: string, getInputs: () => Promise<{ events: object[], alerts: object[] }>, getCartas: () => object[], onResult: (r: { at: string, assignments: ReturnType<typeof assignmentsFromCobertura> }) => void, intervalMs?: number, log?: Console }} opts
 */
export function createVinculoLive({ projectRoot, getInputs, getCartas, onResult, intervalMs = 5 * 60_000, log = console }) {
  let running = false
  let last = null
  let lastError = null

  function runScript(dataDir, from, to, outDir, cartasFile) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(projectRoot, 'scripts', 'vinculo', 'cobertura.mjs'), from, to], {
        cwd: projectRoot,
        env: { ...process.env, VINCULO_DATA: dataDir, VINCULO_CARTAS: cartasFile, VINCULO_OUT: outDir, VINCULO_SIN_DSS: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      let err = ''
      child.stderr.on('data', (d) => (err += d))
      child.stdout.on('data', () => {})
      const timer = setTimeout(() => { child.kill(); reject(new Error(`el vínculo tardó más de ${TIMEOUT_MS / 60_000} min`)) }, TIMEOUT_MS)
      child.on('error', (e) => { clearTimeout(timer); reject(e) })
      child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`vínculo salió con ${code}: ${err.slice(-400)}`)) })
    })
  }

  async function tick() {
    if (running) return
    running = true
    const t0 = Date.now()
    const dir = mkdtempSync(path.join(os.tmpdir(), 'vinculo-'))
    try {
      const { events, alerts } = await getInputs()
      const cartas = [...getCartas()]
      if (!events.length || !cartas.length) return
      // Un solo día de datos (el de hoy) con todo lo que hay en memoria: el script lee del día anterior al siguiente.
      const to = arDay(Date.now())
      const from = arDay(Date.now() - 24 * 3600_000)
      const day = path.join(dir, 'truckflow', to)
      mkdirSync(day, { recursive: true })
      mkdirSync(path.join(dir, 'dss-export'), { recursive: true })
      writeFileSync(path.join(day, 'event-list.json'), JSON.stringify({ records: events }))
      writeFileSync(path.join(day, 'alert-list.json'), JSON.stringify(alerts))
      const cartasFile = path.join(dir, 'cartas.json')
      writeFileSync(cartasFile, JSON.stringify(cartas))
      const outDir = path.join(dir, 'out')
      await runScript(dir, from, to, outDir, cartasFile)
      const cob = JSON.parse(readFileSync(path.join(outDir, 'cobertura.json'), 'utf8'))
      const assignments = assignmentsFromCobertura(cob)
      last = { at: new Date().toISOString(), ms: Date.now() - t0, camiones: cob.camiones?.length ?? 0, asignaciones: assignments.length }
      lastError = null
      onResult({ at: last.at, assignments })
      log.info?.(`[vínculo] ${last.camiones} camiones con carta, ${assignments.length} capturas asignadas (${Math.round(last.ms / 1000)} s)`)
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      log.warn?.(`[vínculo] ${lastError}`)
    } finally {
      running = false
      rmSync(dir, { recursive: true, force: true })
    }
  }

  return {
    start() {
      setTimeout(() => void tick(), 90_000).unref?.() // después de que carguen los buffers de las dos plantas
      setInterval(() => void tick(), intervalMs).unref?.()
    },
    tick,
    status: () => ({ ...last, lastError, running }),
  }
}

/** Índice por cámara para buscar la asignación de una captura (misma cámara, ±1,5 s). */
export function indexAssignments(assignments) {
  const byDevice = new Map()
  for (const a of assignments) {
    const k = String(a.device ?? '').toLowerCase()
    if (!byDevice.has(k)) byDevice.set(k, [])
    byDevice.get(k).push(a)
  }
  return {
    at(device, t) {
      let best = null
      for (const a of byDevice.get(String(device ?? '').toLowerCase()) ?? []) {
        const d = Math.abs(a.t - t)
        if (d <= 1500 && (!best || d < best.d)) best = { ...a, d }
      }
      return best
    },
  }
}

const OPEN = new Set(['pendiente', 'provisorio', 'fuera_sistema'])

/**
 * Capa vínculo: a una captura que el reconocedor dejó sin resolver (abierta o fuera del sistema, no la base de
 * no camiones) y sin decisión de operaciones, se le pone el camión que eligió el vínculo si la probabilidad
 * llega a `minProb`. Por debajo queda como sugerencia (`vinculo`) en el caso. La lectura se suma al viaje de
 * ese camión más cercano (±12 h) que tenga el feed.
 * @param {object[]} items casos del reconocedor
 * @param {ReturnType<typeof indexAssignments>|null} index
 * @param {object[]} rawEvents
 * @param {{ minProb?: number, timeOf: (e: object) => number }} opts
 */
export function applyVinculo(items, index, rawEvents, { minProb = 0.5, timeOf }) {
  if (!index) return items
  const journeysOf = new Map()
  for (const e of rawEvents) {
    const p = plateOf(e.normalizedPlate || e.truckPlate)
    const uid = String(e.journeyUid ?? '').trim()
    if (!p || !uid || e.fromAlert) continue
    if (!journeysOf.has(p)) journeysOf.set(p, [])
    journeysOf.get(p).push({ uid, t: timeOf(e) })
  }
  const nearest = (plate, t) => {
    let best = null
    for (const j of journeysOf.get(plate) ?? []) if (Math.abs(j.t - t) <= 12 * 3600_000 && (!best || Math.abs(j.t - t) < Math.abs(best.t - t))) best = j
    return best?.uid ?? null
  }
  return items.map((it) => {
    if (it.decision || it.archived || !OPEN.has(it.level) || it.rule === 'no_camion') return it
    const t = Date.parse(it.at)
    const a = index.at(it.deviceCode, t)
    if (!a || !a.plate) return it
    const vinculo = { plate: a.plate, ctg: a.ctg, prob: a.prob, como: a.como, rival: a.rival ?? null }
    if (a.prob < minProb) return { ...it, vinculo }
    return {
      ...it,
      vinculo,
      level: 'casi_seguro',
      rule: 'vinculo',
      assignedPlate: a.plate,
      assignedJourneyUid: nearest(a.plate, t),
      reason: `el vínculo la asigna a ${a.plate} (carta ${a.ctg}) con ${Math.round(a.prob * 100)} %${a.rival ? `; le sigue ${a.rival.plate} (${Math.round(a.rival.prob * 100)} %)` : ''}`,
    }
  })
}
