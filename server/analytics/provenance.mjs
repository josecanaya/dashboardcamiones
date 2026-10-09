import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, cpSync, mkdirSync } from 'node:fs'
import path from 'node:path'
export const digest = value => createHash('sha256').update(value).digest('hex')
export function sourceFingerprint({ eventsPaths, movimientosRoot, from, to, corrections }) {
  const files = [...eventsPaths]
  if (existsSync(movimientosRoot)) for (const day of readdirSync(movimientosRoot).sort()) {
    if (day >= from && day <= to && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const file = path.join(movimientosRoot, day, 'movimientos.json')
      if (existsSync(file)) files.push(file)
    }
  }
  return digest(JSON.stringify({ files: [...new Set(files)].sort().map(file => ({ file, hash: existsSync(file) ? digest(readFileSync(file)) : null })), corrections: [...(corrections ?? [])].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) }))
}
export function archiveRun(runsRoot, runId, dir) {
  if (!dir || !existsSync(path.join(dir, 'manifest.json'))) return null
  const files = []
  function collect(root) { for (const entry of readdirSync(root, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) { const file = path.join(root,entry.name); if (entry.isDirectory()) collect(file); else files.push([path.relative(dir,file), digest(readFileSync(file))]) } }
  collect(dir)
  const revision = digest(JSON.stringify(files))
  const target = path.join(runsRoot, '_revisions', runId, revision)
  if (!existsSync(target)) { mkdirSync(path.dirname(target), { recursive:true }); cpSync(dir, target, { recursive:true, errorOnExist:true }) }
  return revision
}
