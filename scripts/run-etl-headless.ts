/**
 * Runner ETL headless con persistencia por runId.
 * Los movimientos se nutren SOLO del backup local (data/movimientos/<día>/), leído
 * por rango. La ingesta al backup es aparte (scripts/ingest-movimientos.ts o UI).
 * Uso: npx tsx scripts/run-etl-headless.ts --events <json> [--from-day <d>] [--to-day <d>] [--out runs/]
 */
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, basename, join } from 'node:path'
import { dedupeMovimientosByOperationId } from '../src/etl-core/ingest/dedupeMovimientos.ts'
import { parsePayloadToJourneyEvents } from '../src/services/realJourneyEventsDataSource.ts'
import {
  runEtlTransform,
  ETL_TRANSFORM_RULES_VERSION,
} from '../src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts'
import { buildKpiTiemposArtifacts } from '../src/features/real-truckflow/etlWorkbench/etlKpiTiemposBuild.ts'
import { parseCsvToRecords } from '../src/etl-core/csvParse.ts'
import { CIRCUIT_CATALOG } from '../src/etl-core/domain/circuitCatalog.ts'
import type { RealJourneyEventDto } from '../src/services/realJourneyEvents.types.ts'

type Args = {
  eventsPaths: string[]
  outRoot: string
  movimientosRoot: string
  fromDay: string
  toDay: string
  help: boolean
}

function printHelp() {
  console.log(`Uso:
  npx tsx scripts/run-etl-headless.ts --events <ruta.json> [--events <otra.json>] [--from-day <d>] [--to-day <d>] [--out runs/]

Opciones:
  --events           JSON de eventos Truckflow (repetible). Obligatorio al menos uno.
  --from-day/--to-day  Rango YYYY-MM-DD para leer el backup de movimientos (default: min/max de eventos).
  --movimientos-root Carpeta del backup (default: data/movimientos).
  --out              Raíz de corridas (default: runs/).
  --help             Esta ayuda.

Los movimientos se toman del backup local; no se pasa Excel por corrida.
La última línea de stdout es el runId.
`)
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    eventsPaths: [],
    outRoot: resolve('runs'),
    movimientosRoot: resolve('data/movimientos'),
    fromDay: '',
    toDay: '',
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--events') out.eventsPaths.push(resolve(argv[++i] ?? ''))
    else if (a === '--out') out.outRoot = resolve(argv[++i] ?? 'runs')
    else if (a === '--movimientos-root') out.movimientosRoot = resolve(argv[++i] ?? 'data/movimientos')
    else if (a === '--from-day') out.fromDay = String(argv[++i] ?? '').trim()
    else if (a === '--to-day') out.toDay = String(argv[++i] ?? '').trim()
  }
  return out
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Lee las particiones de movimientos del backup entre fromDay y toDay (inclusive). */
function readMovimientosRange(
  root: string,
  fromDay: string,
  toDay: string
): import('../src/features/real-truckflow/etlWorkbench/etlExternalMovimientosContrato.ts').ExternalMovimientoContratoNormalized[] {
  if (!existsSync(root)) return []
  const days = readdirSync(root)
    .filter((d) => DAY_RE.test(d) && (!fromDay || d >= fromDay) && (!toDay || d <= toDay))
    .sort()
  const all: import('../src/features/real-truckflow/etlWorkbench/etlExternalMovimientosContrato.ts').ExternalMovimientoContratoNormalized[] =
    []
  for (const day of days) {
    const f = join(root, day, 'movimientos.json')
    if (!existsSync(f)) continue
    try {
      const rows = JSON.parse(readFileSync(f, 'utf8'))
      if (Array.isArray(rows)) all.push(...rows)
    } catch {
      /* partición ilegible: se omite */
    }
  }
  return dedupeMovimientosByOperationId(all).deduped
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

  // Movimientos: la corrida se nutre SOLO del backup local particionado por día.
  // Rango: --from-day/--to-day explícitos, o inferido del min/max de los eventos.
  let preNormalizedMovimientos:
    | import('../src/features/real-truckflow/etlWorkbench/etlExternalMovimientosContrato.ts').ExternalMovimientoContratoNormalized[]
    | undefined
  if (existsSync(args.movimientosRoot)) {
    const eventDays = events
      .map((e) => String(e.occurredAt ?? '').slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
    const fromDay = args.fromDay || eventDays[0] || ''
    const toDay = args.toDay || eventDays[eventDays.length - 1] || ''
    const mov = readMovimientosRange(args.movimientosRoot, fromDay, toDay)
    if (mov.length) {
      preNormalizedMovimientos = mov
      log(`[etl-headless] movimientos backup: ${mov.length} filas (${fromDay || '?'}→${toDay || '?'})`)
    }
  }

  const inputHash = createHash('sha256')
    .update(JSON.stringify({ events: args.eventsPaths, movimientosRows: preNormalizedMovimientos?.length ?? 0 }))
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
          movimientosRows: preNormalizedMovimientos?.length ?? 0,
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
      preNormalizedMovimientos,
    })

    // KPI tiempos (tramos Preingreso→Calada, etc.) — necesario para el agente / pestaña KPI
    if (out.kpiTiemposPrepared) {
      log('[etl-headless] construyendo KPI tiempos…')
      const kpi = await buildKpiTiemposArtifacts(out.kpiTiemposPrepared)
      Object.assign(out.csv, kpi.csv)
      out.stats = {
        ...out.stats,
        segmentTiming: kpi.segmentTiming,
        circuitTiming: kpi.circuitTiming,
        kpiTiemposBuilt: true,
      }
      for (const line of kpi.logs) log(`[etl-headless] ${line}`)
    } else {
      log('[etl-headless] sin kpiTiemposPrepared — se omite segment_timing_kpi')
    }

    const statsForDisk = {
      ...out.stats,
      segmentTiming:
        out.stats.segmentTiming ?
          {
            journeyCount: out.stats.segmentTiming.journeyCount,
            legCount: out.stats.segmentTiming.legs.length,
            aggregateCount: out.stats.segmentTiming.aggregates.filter((a) => a.stats.count > 0).length,
          }
        : null,
      circuitTiming:
        out.stats.circuitTiming ?
          {
            journeyCount: out.stats.circuitTiming.journeys.length,
            summaryCount: out.stats.circuitTiming.summaries.length,
          }
        : null,
    }
    writeFileSync(join(runDir, 'stats.json'), JSON.stringify(statsForDisk, null, 2), 'utf8')
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
            movimientosRows: preNormalizedMovimientos?.length ?? 0,
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
            movimientosRows: preNormalizedMovimientos?.length ?? 0,
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
