/**
 * Ingesta de Movimientos por Contrato al backup local particionado por día.
 * Uso: npx tsx scripts/ingest-movimientos.ts --excel <xlsx> [--excel <otro>] [--data-root data/movimientos]
 *
 * Normaliza cada Excel una vez, reparte las filas por día de ingreso, mergea con
 * lo existente deduplicando por external_operation_id, y guarda el crudo en _raw/.
 * Idempotente: re-cargar el mismo archivo no infla las particiones.
 * Ver docs/movimientos-backup.md.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { resolve, basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  readMovimientosContratoXlsx,
  normalizeMovimientosContratoBatch,
  type ExternalMovimientoContratoNormalized,
} from '../src/features/real-truckflow/etlWorkbench/etlExternalMovimientosContrato.ts'
import {
  partitionMovimientosByDay,
  mergeMovimientosDedup,
} from '../src/etl-core/ingest/movimientosDayPartition.ts'

type Args = { excelPaths: string[]; dataRoot: string; help: boolean }

function parseArgs(argv: string[]): Args {
  const out: Args = { excelPaths: [], dataRoot: resolve('data/movimientos'), help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--excel') out.excelPaths.push(resolve(argv[++i] ?? ''))
    else if (a === '--data-root') out.dataRoot = resolve(argv[++i] ?? 'data/movimientos')
  }
  return out
}

function dayFile(dataRoot: string, day: string): string {
  return join(dataRoot, day, 'movimientos.json')
}

function readDay(dataRoot: string, day: string): ExternalMovimientoContratoNormalized[] {
  const f = dayFile(dataRoot, day)
  if (!existsSync(f)) return []
  try {
    const parsed = JSON.parse(readFileSync(f, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeDay(dataRoot: string, day: string, rows: ExternalMovimientoContratoNormalized[]): void {
  const dir = join(dataRoot, day)
  mkdirSync(dir, { recursive: true })
  writeFileSync(dayFile(dataRoot, day), JSON.stringify(rows), 'utf8')
}

/** Ingesta un buffer Excel al backup. Exportada para reuso desde el server. */
export function ingestMovimientosBuffer(
  buf: Uint8Array,
  sourceFile: string,
  dataRoot: string
): { days: { day: string; total: number; added: number; duplicatesRemoved: number }[]; undated: number; totalRows: number } {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const { rows: raw } = readMovimientosContratoXlsx(ab, sourceFile)
  const normalized = normalizeMovimientosContratoBatch(raw)
  const { byDay, undated } = partitionMovimientosByDay(normalized)

  const summary: { day: string; total: number; added: number; duplicatesRemoved: number }[] = []
  for (const [day, incoming] of [...byDay.entries()].sort()) {
    const existing = readDay(dataRoot, day)
    const { merged, added, duplicatesRemoved } = mergeMovimientosDedup(existing, incoming)
    writeDay(dataRoot, day, merged)
    summary.push({ day, total: merged.length, added, duplicatesRemoved })
  }
  return { days: summary, undated: undated.length, totalRows: normalized.length }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.excelPaths.length) {
    console.log('npx tsx scripts/ingest-movimientos.ts --excel <xlsx> [--excel <otro>] [--data-root data/movimientos]')
    process.exit(args.help ? 0 : 1)
  }
  const rawDir = join(args.dataRoot, '_raw')
  mkdirSync(rawDir, { recursive: true })

  const report: Record<string, unknown>[] = []
  for (const p of args.excelPaths) {
    if (!existsSync(p)) {
      console.error(`No existe --excel: ${p}`)
      continue
    }
    const buf = readFileSync(p)
    const name = basename(p)
    copyFileSync(p, join(rawDir, name)) // backup crudo
    const res = ingestMovimientosBuffer(buf, name, args.dataRoot)
    const totalDup = res.days.reduce((a, d) => a + d.duplicatesRemoved, 0)
    console.log(
      `[ingest] ${name}: ${res.totalRows} filas → ${res.days.length} días ` +
        `(sin fecha: ${res.undated}, duplicados colapsados: ${totalDup})`
    )
    report.push({ file: name, ...res })
  }
  console.log(JSON.stringify({ dataRoot: args.dataRoot, files: report }, null, 2))
}

// Ejecutar solo si es el entrypoint (permite importar ingestMovimientosBuffer).
const invoked = process.argv[1] ? resolve(process.argv[1]) : ''
if (invoked && invoked === fileURLToPath(import.meta.url)) {
  main()
}
