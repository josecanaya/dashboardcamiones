/**
 * @deprecated Usar scripts/audit-excel-camera-matrix.mjs R7 ...
 */
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const dir = dirname(fileURLToPath(import.meta.url))
const script = join(dir, 'audit-excel-camera-matrix.mjs')
const child = spawnSync(
  'npx',
  ['tsx', script, 'R7', ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env, shell: true }
)
process.exit(child.status ?? 1)
