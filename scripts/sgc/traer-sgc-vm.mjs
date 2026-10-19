/**
 * Trae lo que guardó el recolector SGC de la VM (fines de semana) y lo une con data/sgc local.
 *
 * Uso: node scripts/sgc/traer-sgc-vm.mjs <carpeta o .zip/.tar.gz con data/sgc de la VM>
 *
 * - Une ingresos.json por NROINGRESO sin pisar: firstSeenAt/firstWeight = lo primero que vio
 *   cualquiera de los dos, el resto de los campos = la observación más nueva (lastSeenAt).
 * - Suma la bitácora de la VM (_polls.jsonl) a data/sgc/_polls-vm.jsonl.
 * - Regenera data/movimientos de los días de salida tocados (desde SGC_MOVIMIENTOS_FROM), con los
 *   priors del histórico de esta PC (la VM no genera movimientos).
 */
import { PROJECT_ROOT } from '../../server/load-env.mjs'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSgcSource } from '../../server/sgc/sgcSource.mjs'

const MOVIMIENTOS_FROM = process.env.SGC_MOVIMIENTOS_FROM?.trim() || '2026-10-15'
const DAY = /^\d{4}-\d{2}-\d{2}$/

const input = process.argv[2]
if (!input || !existsSync(input)) {
  console.error('Uso: node scripts/sgc/traer-sgc-vm.mjs <carpeta o .zip/.tar.gz de la VM>')
  process.exit(1)
}

let root = path.resolve(input)
if (statSync(root).isFile()) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'sgc-vm-'))
  // En Windows, el tar de System32 (bsdtar) abre .zip y .tar.gz y entiende rutas «C:\…».
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  execFileSync(tar, ['-xf', root, '-C', tmp])
  root = tmp
}

/** Busca la carpeta que tiene las carpetas de día (data/sgc de la VM). */
function findSgcDir(dir, depth = 0) {
  const entries = readdirSync(dir, { withFileTypes: true })
  if (entries.some(e => e.isDirectory() && DAY.test(e.name) && existsSync(path.join(dir, e.name, 'ingresos.json')))) return dir
  if (depth >= 4) return null
  for (const e of entries) if (e.isDirectory()) {
    const hit = findSgcDir(path.join(dir, e.name), depth + 1)
    if (hit) return hit
  }
  return null
}

const vmDir = findSgcDir(root)
if (!vmDir) {
  console.error(`No encontré carpetas de día con ingresos.json dentro de ${input}`)
  process.exit(1)
}

const readJson = (file, fallback) => { try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback } catch { return fallback } }
const dayOf = iso => String(iso ?? '').slice(0, 10)
const localRoot = path.join(PROJECT_ROOT, 'data', 'sgc')

function mergeRecord(a, b) {
  if (!a) return b
  if (!b) return a
  const [older, newer] = String(a.lastSeenAt) <= String(b.lastSeenAt) ? [a, b] : [b, a]
  const first = String(a.firstSeenAt) <= String(b.firstSeenAt) ? a : b
  return { ...newer, firstSeenAt: first.firstSeenAt, firstWeight: first.firstWeight ?? older.firstWeight ?? newer.firstWeight }
}

let nuevos = 0, actualizados = 0
const touched = new Set()
for (const day of readdirSync(vmDir).filter(d => DAY.test(d)).sort()) {
  const vm = readJson(path.join(vmDir, day, 'ingresos.json'), {})
  const file = path.join(localRoot, day, 'ingresos.json')
  const local = readJson(file, {})
  let changed = false
  for (const [key, rec] of Object.entries(vm)) {
    const prev = local[key]
    const next = mergeRecord(prev, rec)
    if (JSON.stringify(prev) === JSON.stringify(next)) continue
    prev ? actualizados++ : nuevos++
    local[key] = next
    changed = true
    if (next.FECHASALIDA) touched.add(dayOf(next.FECHASALIDA))
  }
  if (changed) {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(local), 'utf8')
  }
}

const vmPolls = path.join(vmDir, '_polls.jsonl')
if (existsSync(vmPolls)) {
  const seen = new Set(readFileSync(path.join(localRoot, '_polls-vm.jsonl'), { encoding: 'utf8', flag: 'a+' }).split('\n'))
  const add = readFileSync(vmPolls, 'utf8').split('\n').filter(l => l.trim() && !seen.has(l))
  if (add.length) appendFileSync(path.join(localRoot, '_polls-vm.jsonl'), add.join('\n') + '\n', 'utf8')
  const ok = add.filter(l => l.includes('"ok":true')).length
  console.log(`Bitácora VM: ${add.length} consultas nuevas (${ok} bien, ${add.length - ok} con error).`)
}

const sgc = createSgcSource({ projectRoot: PROJECT_ROOT })
const written = [...touched].filter(d => d >= MOVIMIENTOS_FROM).sort().map(sgc.writeMovimientosDay).filter(Boolean)
console.log(`Ingresos: ${nuevos} nuevos, ${actualizados} actualizados.`)
console.log(written.length ? `Movimientos regenerados: ${written.map(w => `${w.day} (${w.rows})`).join(', ')}` : 'Movimientos: sin cambios.')
