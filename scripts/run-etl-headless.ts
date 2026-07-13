/**
 * Runner ETL headless con persistencia por runId.
 * Uso: npx tsx scripts/run-etl-headless.ts --events <json> [--excel <xlsx>] [--out runs/]
 */
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, basename, join } from 'node:path'
import { parsePayloadToJourneyEvents } from '../src/services/realJourneyEventsDataSource.ts'
import {
  runEtlTransform,
  ETL_TRANSFORM_RULES_VERSION,
} from '../src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts'
import { parseCsvToRecords } from '../src/etl-core/csvParse.ts'
import { CIRCUIT_CATALOG } from '../src/etl-core/domain/circuitCatalog.ts'
import type { RealJourneyEventDto } from '../src/services/realJourneyEvents.types.ts'

type Args = {
  eventsPaths: string[]
  excelPath: string
  outRoot: string
  help: boolean
}

function printHelp() {
  console.log(`Uso:
  npx tsx scripts/run-etl-headless.ts --events <ruta.json> [--events <otra.json>] [--excel <xlsx>] [--out runs/]

Opciones:
  --events   JSON de eventos Truckflow (repetible). Obligatorio al menos uno.
  --excel    XLSX Movimientos por Contrato (opcional).
  --out      Raíz de corridas (default: runs/).
  --help     Esta ayuda.

La última línea de stdout es el runId.
`)
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    eventsPaths: [],
    excelPath: '',
    outRoot: resolve('runs'),
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--events') out.eventsPaths.push(resolve(argv[++i] ?? ''))
    else if (a === '--excel') out.excelPath = resolve(argv[++i] ?? '')
    else if (a === '--out') out.outRoot = resolve(argv[++i] ?? 'runs')
  }
  return out
}

function makeRunId(): string {
  const d = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  const hash6 = randomBytes(3).toString('hex')
  return `${stamp}-${hash6}`
}

async function loadEventsFromFile(file: string): Promise<RealJourneyEventDto[]> {
  const raw = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  return parsePayloadToJourneyEvents(raw)
}

function writeCatalog(outRoot: string) {
  const catalogDir = join(outRoot, '_catalog')
  mkdirSync(catalogDir, { recursive: true })
  const path = join(catalogDir, 'circuits.json')
  writeFileSync(path, JSON.stringify(CIRCUIT_CATALOG, null, 2), 'utf8')
  return path
}

function persistTables(
  tablesDir: string,
  csv: Record<string, string>,
  tables: Record<string, { name?: string; headers?: readonly string[]; rows?: readonly Record<string, unknown>[] }> | undefined
) {
  mkdirSync(tablesDir, { recursive: true })
  const keys = new Set([...Object.keys(csv), ...Object.keys(tables ?? {})])
  for (const key of keys) {
    const csvText = csv[key] ?? ''
    if (csvText) writeFileSync(join(tablesDir, `${key}.csv`), csvText, 'utf8')

    const typed = tables?.[key]
    let rows: readonly Record<string, unknown>[] = typed?.rows ?? []
    let headers: readonly string[] = typed?.headers ?? []
    if ((!rows.length || !headers.length) && csvText.trim()) {
      const parsed = parseCsvToRecords(csvText)
      headers = parsed.headers
      rows = parsed.rows
    }
    writeFileSync(
      join(tablesDir, `${key}.json`),
      JSON.stringify({ name: key, headers, rows }, null, 2),
      'utf8'
    )
  }
  return keys.size
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.eventsPaths.length) {
    printHelp()
    process.exit(args.help ? 0 : 1)
  }

  for (const p of args.eventsPaths) {
    if (!existsSync(p)) {
      console.error(`No existe --events: ${p}`)
      process.exit(1)
    }
  }
  if (args.excelPath && !existsSync(args.excelPath)) {
    console.error(`No existe --excel: ${args.excelPath}`)
    process.exit(1)
  }

  mkdirSync(args.outRoot, { recursive: true })
  writeCatalog(args.outRoot)

  const runId = makeRunId()
  const runDir = join(args.outRoot, runId)
  const tablesDir = join(runDir, 'tables')
  mkdirSync(tablesDir, { recursive: true })

  const startedAt = new Date().toISOString()
  const logLines: string[] = []
  const log = (msg: string) => {
    logLines.push(msg)
    console.info(msg)
  }

  log(`[etl-headless] runId=${runId}`)
  log(`[etl-headless] events=${args.eventsPaths.join(', ')}`)
  if (args.excelPath) log(`[etl-headless] excel=${args.excelPath}`)

  let events: RealJourneyEventDto[] = []
  for (const p of args.eventsPaths) {
    const chunk = await loadEventsFromFile(p)
    log(`[etl-headless] cargados ${chunk.length} eventos de ${basename(p)}`)
    events = events.concat(chunk)
  }
  if (events.length === 0) {
    throw new Error(
      `0 eventos parseados de ${args.eventsPaths.length} archivo(s). ` +
        `Si son exports locales, deben tener array "records" (data/truckflow/<día>/event-list.json).`
    )
  }

  const movimientosContratoFiles =
    args.excelPath ?
      (() => {
        const buf = readFileSync(args.excelPath)
        return [
          {
            sourceFile: basename(args.excelPath),
            arrayBuffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
          },
        ]
      })()
    : undefined

  const inputHash = createHash('sha256')
    .update(JSON.stringify({ events: args.eventsPaths, excel: args.excelPath || null }))
    .digest('hex')
    .slice(0, 12)

  writeFileSync(
    join(runDir, 'manifest.json'),
    JSON.stringify(
      {
        runId,
        status: 'running',
        startedAt,
        rulesVersion: ETL_TRANSFORM_RULES_VERSION,
        input: {
          eventsPaths: args.eventsPaths,
          excelPath: args.excelPath || null,
          inputHash,
          eventCount: events.length,
        },
      },
      null,
      2
    ),
    'utf8'
  )

  try {
    const out = await runEtlTransform({
      events,
      alerts: [],
      mergeWindowHours: 4,
      loadedEventFilesCount: args.eventsPaths.length,
      loadedAlertFilesCount: 0,
      movimientosContratoFiles,
    })

    writeFileSync(join(runDir, 'stats.json'), JSON.stringify(out.stats, null, 2), 'utf8')
    const tableCount = persistTables(tablesDir, out.csv, out.tables)
    const finishedAt = new Date().toISOString()
    log(`[etl-headless] tablas=${tableCount} rules=${out.rulesVersion}`)

    writeFileSync(join(runDir, 'logs.txt'), logLines.join('\n') + '\n', 'utf8')
    writeFileSync(
      join(runDir, 'manifest.json'),
      JSON.stringify(
        {
          runId,
          status: 'ok',
          startedAt,
          finishedAt,
          rulesVersion: out.rulesVersion ?? ETL_TRANSFORM_RULES_VERSION,
          input: {
            eventsPaths: args.eventsPaths,
            excelPath: args.excelPath || null,
            inputHash,
            eventCount: events.length,
          },
          output: {
            tableCount,
            csvKeys: Object.keys(out.csv).sort(),
            tableKeys: Object.keys(out.tables ?? {}).sort(),
          },
        },
        null,
        2
      ),
      'utf8'
    )

    // Última línea: runId (contrato CLI / API)
    console.log(runId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`[etl-headless] ERROR: ${message}`)
    writeFileSync(join(runDir, 'logs.txt'), logLines.join('\n') + '\n', 'utf8')
    writeFileSync(
      join(runDir, 'manifest.json'),
      JSON.stringify(
        {
          runId,
          status: 'error',
          startedAt,
          finishedAt: new Date().toISOString(),
          rulesVersion: ETL_TRANSFORM_RULES_VERSION,
          error: message,
          input: {
            eventsPaths: args.eventsPaths,
            excelPath: args.excelPath || null,
            inputHash,
            eventCount: events.length,
          },
        },
        null,
        2
      ),
      'utf8'
    )
    console.error(err)
    process.exit(1)
  }
}

await main()
