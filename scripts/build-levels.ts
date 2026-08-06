/**
 * Materializa el modelo de niveles A→B→C→D→E (v14) sobre corridas ya guardadas.
 *
 *   npx tsx scripts/build-levels.ts --all
 *   npx tsx scripts/build-levels.ts --run 2026-07-13_2026-07-19
 *   npx tsx scripts/build-levels.ts --all --check      (no escribe; sólo verifica)
 *
 * Lee las tablas del run y escribe los niveles en CSV (canónico) + JSON (para
 * el endpoint y el front, que ya consumen JSON). No reprocesa el ETL: los
 * niveles son una reorganización determinística de lo que la corrida ya
 * produjo, así que se puede correr sobre las 13 ventanas existentes y comparar.
 *
 * Sale con código 1 si algún invariante falla: una corrida que no cumple la
 * partición no es publicable.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { recordsToCsv } from '../src/etl-core/csv'
import { buildLevels, type MaterializedTable } from '../src/etl-core/levels'

type Row = Record<string, unknown>

const RUNS_ROOT = join(process.cwd(), 'runs', 'windows')

function parseArgs(argv: string[]) {
  const out = { all: false, check: false, runs: [] as string[] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--all') out.all = true
    else if (a === '--check') out.check = true
    else if (a === '--run') {
      const v = argv[++i]
      if (v) out.runs.push(v)
    }
  }
  return out
}

/** Lee una tabla del run. Devuelve [] si no existe (no todas las corridas las tienen). */
function readTable(runDir: string, name: string): Row[] {
  const p = join(runDir, 'tables', `${name}.json`)
  if (!existsSync(p)) return []
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'))
    if (Array.isArray(parsed)) return parsed as Row[]
    return (parsed?.rows ?? []) as Row[]
  } catch (e) {
    throw new Error(`No pude leer ${name}.json del run: ${(e as Error).message}`)
  }
}

function writeTable(runDir: string, t: MaterializedTable) {
  const dir = join(runDir, 'tables')
  mkdirSync(dir, { recursive: true })
  const headers = [...t.headers]
  const rows = t.rows as Row[]
  // CSV es el formato canónico del modelo de niveles.
  writeFileSync(join(dir, `${t.name}.csv`), recordsToCsv(headers, rows), 'utf8')
  // JSON espejo: el endpoint de tablas y el front de 2.0 ya consumen esta forma.
  writeFileSync(
    join(dir, `${t.name}.json`),
    JSON.stringify({ name: t.name, headers, rows }, null, 2),
    'utf8'
  )
}

const n = (x: number) => x.toLocaleString('es-AR')

function procesar(runId: string, check: boolean): boolean {
  const runDir = join(RUNS_ROOT, runId)
  if (!existsSync(runDir)) {
    console.error(`  ✗ ${runId}: no existe`)
    return false
  }

  const excelRows = readTable(runDir, 'excel_operations_with_truckflow')
  const finalCircuits = readTable(runDir, 'final_circuits')
  const cleanJourneys = readTable(runDir, 'clean_journeys_for_analysis')
  const journeyTimeline = readTable(runDir, 'journey_timeline')

  if (!excelRows.length && !finalCircuits.length) {
    console.log(`  – ${runId}: sin tablas base, salteada`)
    return true
  }

  const res = buildLevels({
    excelRows,
    finalCircuits,
    cleanJourneys,
    journeyTimeline,
    circuitTimingJourneys: readTable(runDir, 'circuit_timing_journeys'),
  })
  const { c, d, e } = res.stats

  console.log(`\n▸ ${runId}`)
  console.log(
    `  C  con cámara ${n(c.conCamara)} · sin cámara ${n(c.sinCamara)} · de ${n(c.excelTotal)} movimientos`
  )
  console.log(
    `     tiempos: cámara ${n(c.porTimeSource.CAMARA)} · parcial ${n(
      c.porTimeSource.CAMARA_PARCIAL_EXCEL
    )} · respaldo Excel ${n(c.porTimeSource.EXCEL_RESPALDO)} · sin tiempo ${n(
      c.porTimeSource.SIN_TIEMPO
    )}`
  )
  console.log(
    `  D  válidos ${n(d.validos)} · anómalos ${n(d.anomalos)} · incompletos ${n(
      d.incompletos
    )} (absorbidos ${n(d.absorbidos)}) · sin contrato ${n(d.sinContrato)} · descartados ${n(
      d.descartados
    )}`
  )
  console.log(
    `  E  ${n(e.circuitos)} circuitos · ${n(e.operacionesConTiempo)} operaciones con tiempo · ${
      e.porcentajeCamaraPura
    }% cámara pura`
  )

  let ok = true
  for (const inv of res.invariantes) {
    if (!inv.ok) {
      ok = false
      console.error(`  ✗ INVARIANTE "${inv.nombre}": ${inv.detalle}`)
    }
  }
  if (ok) console.log('  ✓ invariantes OK')

  if (!check) {
    for (const t of Object.values(res.tables)) writeTable(runDir, t)
    console.log(`  → ${Object.keys(res.tables).length} tablas escritas (CSV + JSON)`)
  }
  return ok
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  let runs = args.runs
  if (args.all || !runs.length) {
    runs = existsSync(RUNS_ROOT)
      ? readdirSync(RUNS_ROOT).filter((d) => existsSync(join(RUNS_ROOT, d, 'tables')))
      : []
  }
  if (!runs.length) {
    console.error('No hay corridas en runs/windows/.')
    process.exit(1)
  }

  console.log(`Modelo de niveles v14 — ${runs.length} corrida(s)${args.check ? ' [check]' : ''}`)
  let todasOk = true
  for (const r of runs) {
    try {
      if (!procesar(r, args.check)) todasOk = false
    } catch (err) {
      todasOk = false
      console.error(`  ✗ ${r}: ${(err as Error).message}`)
    }
  }

  console.log(todasOk ? '\n✓ Todas las corridas cumplen los invariantes.' : '\n✗ Hay invariantes rotos.')
  process.exit(todasOk ? 0 : 1)
}

main()
