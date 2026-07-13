#!/usr/bin/env node
/**
 * Sube una corrida local runs/<runId>/ a Supabase.
 * Uso: node scripts/upload-etl-run.mjs <runId|ruta>
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import '../server/load-env.mjs'
import { uploadEtlRunFromDisk } from '../server/etl-runs-store.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const RUNS_ROOT = path.join(PROJECT_ROOT, 'runs')

const arg = process.argv[2]
if (!arg || arg === '--help' || arg === '-h') {
  console.log(`Uso: node scripts/upload-etl-run.mjs <runId|ruta-a-runs/runId>

Requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (y migración etl_runs aplicada).
`)
  process.exit(arg ? 0 : 1)
}

const runDir = existsSync(arg) ? path.resolve(arg) : path.join(RUNS_ROOT, arg)
if (!existsSync(runDir)) {
  console.error(`No existe: ${runDir}`)
  process.exit(1)
}

try {
  const out = await uploadEtlRunFromDisk(runDir)
  if (!out) {
    console.error('Supabase no configurado (faltan SUPABASE_URL / SERVICE_ROLE_KEY)')
    process.exit(1)
  }
  console.info(JSON.stringify(out, null, 2))
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
