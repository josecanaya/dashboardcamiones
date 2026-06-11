#!/usr/bin/env node
/**
 * CLI local Transform / Contract-first.
 * Modo validación: solo comprueba JSON por día.
 * Modo contract-first: requiere --excel y delega a scripts/contract-first-cli-runner.ts (tsx).
 */
import fs from 'fs/promises'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const DEFAULT_DATA_ROOT = path.join(PROJECT_ROOT, 'data', 'truckflow')
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'scripts', 'output', 'contract-first')

function printHelp() {
  console.log(`Uso:
  node scripts/run-truckflow-transform-local.mjs --from YYYY-MM-DD --to YYYY-MM-DD [opciones]

Modos:
  Sin --excel     Valida event-list.json (y alert-list.json) por día en data-root.
  Con --excel     Ejecuta conciliación Contract-first (Excel + Truckflow local) vía tsx.

Opciones:
  --from, --start   Fecha inicio inclusive
  --to, --end       Fecha fin inclusive
  --excel           Ruta a MovimientosPorContrato.xlsx (activa merge)
  --data-root       Raíz JSON Truckflow (default: data/truckflow)
  --out             Salida CSV (default: scripts/output/contract-first)
  --help            Esta ayuda

Ejemplo:
  node scripts/run-truckflow-transform-local.mjs --from 2026-06-04 --to 2026-06-04 \\
    --excel ./data/MovimientosPorContrato_20260604.xlsx
`)
}

function parseArgs(argv) {
  const out = {
    from: '',
    to: '',
    excel: '',
    dataRoot: DEFAULT_DATA_ROOT,
    out: DEFAULT_OUT,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') out.help = true
    if (a === '--from' || a === '--start') out.from = argv[++i] ?? ''
    if (a === '--to' || a === '--end') out.to = argv[++i] ?? ''
    if (a === '--excel') out.excel = argv[++i] ?? ''
    if (a === '--data-root') out.dataRoot = path.resolve(argv[++i] ?? '')
    if (a === '--out') out.out = path.resolve(argv[++i] ?? '')
  }
  return out
}

function* dayRange(startIso, endIso) {
  const start = new Date(`${startIso}T12:00:00`)
  const end = new Date(`${endIso}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return
  if (start > end) return
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    yield `${y}-${m}-${day}`
  }
}

async function dayFilesOk(dataRoot, day, eventsOnly) {
  const dir = path.join(dataRoot, day)
  const eventPath = path.join(dir, 'event-list.json')
  const alertPath = path.join(dir, 'alert-list.json')
  try {
    await fs.access(eventPath)
    if (!eventsOnly) await fs.access(alertPath)
    return { day, ok: true, eventPath, alertPath }
  } catch {
    return { day, ok: false, eventPath, alertPath }
  }
}

function runContractFirstTsx(args) {
  const runner = path.join(__dirname, 'contract-first-cli-runner.ts')
  const forward = [
    runner,
    '--from',
    args.from,
    '--to',
    args.to,
    '--excel',
    path.resolve(args.excel),
    '--data-root',
    args.dataRoot,
    '--out',
    args.out,
  ]
  const r = spawnSync('npx', ['tsx', ...forward], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  process.exit(r.status ?? 1)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.from || !args.to) {
    printHelp()
    process.exit(args.help ? 0 : 1)
  }

  const days = [...dayRange(args.from, args.to)]
  if (days.length === 0) {
    console.error('Rango de fechas inválido.')
    process.exit(1)
  }

  const eventsOnly = Boolean(args.excel)
  const checks = await Promise.all(days.map((d) => dayFilesOk(args.dataRoot, d, eventsOnly)))
  const missing = checks.filter((c) => !c.ok)

  console.log(`[truckflow-transform-local] dataRoot: ${args.dataRoot}`)
  console.log(`[truckflow-transform-local] rango: ${args.from} .. ${args.to} (${days.length} día(s))`)

  for (const c of checks) {
    const missMsg = eventsOnly ? 'falta event-list.json' : 'falta event-list.json y/o alert-list.json'
    console.log(c.ok ? `  OK  ${c.day}` : `  MISS ${c.day} (${missMsg})`)
  }

  if (missing.length > 0) {
    console.error('\nFaltan archivos. Exportá con: npm run server:truckflow y POST /api/truckflow/export-period')
    process.exit(2)
  }

  if (!args.excel) {
    console.log('\nValidación OK. Para conciliar Contract-first agregá --excel path/to/MovimientosPorContrato.xlsx')
    process.exit(0)
  }

  try {
    await fs.access(path.resolve(args.excel))
  } catch {
    console.error(`No se encuentra Excel: ${args.excel}`)
    process.exit(2)
  }

  runContractFirstTsx(args)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
