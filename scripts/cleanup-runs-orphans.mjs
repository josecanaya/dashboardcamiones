/**
 * Borra corridas legacy timestamp bajo runs/ (huérfanas o ya reemplazadas por windows/).
 *
 * Uso:
 *   node scripts/cleanup-runs-orphans.mjs           # dry-run
 *   node scripts/cleanup-runs-orphans.mjs --apply   # borra
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isLegacyTimestampRunId } from '../server/etl-runs-layout.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const RUNS_ROOT = path.join(PROJECT_ROOT, 'runs')
const apply = process.argv.includes('--apply')

function readIndexedRunIds() {
  const p = path.join(RUNS_ROOT, '_index', 'by-window.json')
  if (!existsSync(p)) return new Set()
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'))
    const ids = new Set()
    for (const e of Object.values(raw.entries || {})) {
      if (e?.runId) ids.add(String(e.runId))
    }
    return ids
  } catch {
    return new Set()
  }
}

function main() {
  if (!existsSync(RUNS_ROOT)) {
    console.log('No existe runs/')
    return
  }
  const indexed = readIndexedRunIds()
  const candidates = []
  for (const ent of readdirSync(RUNS_ROOT, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('_') || ent.name === 'windows') continue
    if (!isLegacyTimestampRunId(ent.name)) continue
    candidates.push({
      name: ent.name,
      indexed: indexed.has(ent.name),
      path: path.join(RUNS_ROOT, ent.name),
    })
  }

  console.log(
    apply ?
      `[cleanup-runs] APPLY — borrando ${candidates.length} carpetas legacy`
    : `[cleanup-runs] DRY-RUN — ${candidates.length} carpetas legacy (pasá --apply para borrar)`
  )
  for (const c of candidates) {
    console.log(`  ${c.name}${c.indexed ? ' (aún en índice — se borra igual; reprocesá la ventana)' : ''}`)
    if (apply) rmSync(c.path, { recursive: true, force: true })
  }

  if (apply) {
    const indexPath = path.join(RUNS_ROOT, '_index', 'by-window.json')
    if (existsSync(indexPath)) {
      try {
        const doc = JSON.parse(readFileSync(indexPath, 'utf8'))
        const next = { version: 1, entries: {} }
        for (const [key, e] of Object.entries(doc.entries || {})) {
          const [from, to] = String(key).split('..')
          const stable = from && to ? `${from}_${to}` : ''
          const stableDir = path.join(RUNS_ROOT, 'windows', stable)
          const legacyDir = path.join(RUNS_ROOT, e.runId)
          if (stable && existsSync(stableDir)) {
            next.entries[key] = { ...e, runId: stable, path: `windows/${stable}` }
          } else if (existsSync(legacyDir)) {
            next.entries[key] = e
          }
        }
        writeFileSync(indexPath, JSON.stringify(next, null, 2), 'utf8')
        console.log(`[cleanup-runs] índice actualizado → ${Object.keys(next.entries).length} ventanas`)
      } catch (err) {
        console.warn('[cleanup-runs] no se pudo reescribir índice:', err)
      }
    }
  }
}

main()
