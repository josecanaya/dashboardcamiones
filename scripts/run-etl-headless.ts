/**
 * Runner ETL headless con persistencia por ventana estable (pisado).
 * Carpeta: runs/windows/<from>_<to>/ — una sola fuente de verdad por rango.
 * Uso: npx tsx scripts/run-etl-headless.ts --events <json> --from-day <d> --to-day <d> [--out runs/]
 */
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { resolve, basename, join, dirname } from 'node:path'
import { dedupeMovimientosByOperationId } from '../src/etl-core/ingest/dedupeMovimientos.ts'
import { parsePayloadToJourneyEvents } from '../src/services/realJourneyEventsDataSource.ts'
import {
  runEtlTransform,
  ETL_TRANSFORM_RULES_VERSION,
} from '../src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts'
import { buildKpiTiemposArtifacts } from '../src/features/real-truckflow/etlWorkbench/etlKpiTiemposBuild.ts'
import { parseCsvToRecords } from '../src/etl-core/csvParse.ts'
import { CIRCUIT_CATALOG } from '../src/etl-core/domain/circuitCatalog.ts'
import {
  isEtlRunCoreTable,
  stableWindowRunId,
  windowKeyFromDays,
} from '../src/etl-core/runs/etlRunsLayout.ts'
import type { RealJourneyEventDto } from '../src/services/realJourneyEvents.types.ts'

type Args = {
  eventsPaths: string[]
  outRoot: string
  movimientosRoot: string
  fromDay: string
  toDay: string
  persistDebug: boolean
  help: boolean
}

function printHelp() {
  console.log(`Uso:
  npx tsx scripts/run-etl-headless.ts --events <ruta.json> [--events <otra.json>] --from-day <d> --to-day <d> [--out runs/]

Opciones:
  --events           JSON de eventos Truckflow (repetible). Obligatorio al menos uno.
  --from-day/--to-day  Rango YYYY-MM-DD (ventana estable; se pisa runs/windows/<from>_<to>/).
  --movimientos-root Carpeta del backup (default: data/movimientos).
  --out              Raíz de corridas (default: runs/).
  --persist-debug    También escribe tablas de diagnóstico en debug/ (default: no).
  --help             Esta ayuda.

Los movimientos se toman del backup local; no se pasa Excel por corrida.
La última línea de stdout es el runId estable (from_to).
`)
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    eventsPaths: [],
    outRoot: resolve('runs'),
    movimientosRoot: resolve('data/movimientos'),
    fromDay: '',
    toDay: '',
    persistDebug: false,
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
    else if (a === '--persist-debug') out.persistDebug = true
  }
  return out
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

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

/**
 * Índice by-window: clave `<from>..<to>` → runId estable. Se pisa; la carpeta
 * windows/<runId>/ también se pisa (única fuente de verdad).
 */
function updateWindowIndex(opts: {
  outRoot: string
  fromDay: string
  toDay: string
  runId: string
  inputHash: string
  rulesVersion: string
}): void {
  const indexPath = join(opts.outRoot, '_index', 'by-window.json')
  mkdirSync(dirname(indexPath), { recursive: true })
  let doc: { version: number; entries: Record<string, unknown> } = { version: 1, entries: {} }
  if (existsSync(indexPath)) {
    try {
      const raw = JSON.parse(readFileSync(indexPath, 'utf8'))
      if (raw && typeof raw === 'object' && raw.entries) doc = raw
    } catch {
      /* índice corrupto: se reescribe */
    }
  }
  const key = windowKeyFromDays(opts.fromDay, opts.toDay)
  doc.entries[key] = {
    runId: opts.runId,
    inputHash: opts.inputHash,
    rulesVersion: opts.rulesVersion,
    createdAt: new Date().toISOString(),
    path: `windows/${opts.runId}`,
  }
  writeFileSync(indexPath, JSON.stringify(doc, null, 2), 'utf8')
}

function wipeAndCreateRunDir(runDir: string) {
  if (existsSync(runDir)) {
    rmSync(runDir, { recursive: true, force: true })
  }
  mkdirSync(join(runDir, 'tables'), { recursive: true })
}

type TableBag = {
  name?: string
  headers?: readonly string[]
  rows?: readonly Record<string, unknown>[]
}

function materializeTableJson(
  dir: string,
  key: string,
  csvText: string,
  typed: TableBag | undefined
) {
  let rows: readonly Record<string, unknown>[] = typed?.rows ?? []
  let headers: readonly string[] = typed?.headers ?? []
  if ((!rows.length || !headers.length) && csvText.trim()) {
    const parsed = parseCsvToRecords(csvText)
    headers = parsed.headers
    rows = parsed.rows
  }
  writeFileSync(
    join(dir, `${key}.json`),
    JSON.stringify({ name: key, headers, rows }, null, 2),
    'utf8'
  )
}

/** Persiste núcleo en tables/; opcionalmente el resto en debug/. Sin CSV en disco. */
function persistTables(
  runDir: string,
  csv: Record<string, string>,
  tables: Record<string, TableBag> | undefined,
  persistDebug: boolean
): { coreCount: number; debugCount: number; persistedKeys: string[] } {
  const tablesDir = join(runDir, 'tables')
  mkdirSync(tablesDir, { recursive: true })
  const keys = new Set([...Object.keys(csv), ...Object.keys(tables ?? {})])
  let coreCount = 0
  let debugCount = 0
  const persistedKeys: string[] = []

  let debugDir: string | null = null
  if (persistDebug) {
    debugDir = join(runDir, 'debug')
    mkdirSync(debugDir, { recursive: true })
  }

  for (const key of [...keys].sort()) {
    const csvText = csv[key] ?? ''
    const typed = tables?.[key]
    const isCore = isEtlRunCoreTable(key)
    if (isCore) {
      materializeTableJson(tablesDir, key, csvText, typed)
      coreCount++
      persistedKeys.push(key)
    } else if (persistDebug && debugDir) {
      materializeTableJson(debugDir, key, csvText, typed)
      debugCount++
      persistedKeys.push(`debug/${key}`)
    }
  }
  return { coreCount, debugCount, persistedKeys }
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

  let events: RealJourneyEventDto[] = []
  for (const p of args.eventsPaths) {
    const chunk = await loadEventsFromFile(p)
    console.info(`[etl-headless] cargados ${chunk.length} eventos de ${basename(p)}`)
    events = events.concat(chunk)
  }
  if (events.length === 0) {
    throw new Error(
      `0 eventos parseados de ${args.eventsPaths.length} archivo(s). ` +
        `Si son exports locales, deben tener array "records" (data/truckflow/<día>/event-list.json).`
    )
  }

  const eventDaysSorted = events
    .map((e) => String(e.occurredAt ?? '').slice(0, 10))
    .filter((d) => DAY_RE.test(d))
    .sort()
  const effectiveFrom = args.fromDay || eventDaysSorted[0] || ''
  const effectiveTo = args.toDay || eventDaysSorted[eventDaysSorted.length - 1] || ''
  if (!DAY_RE.test(effectiveFrom) || !DAY_RE.test(effectiveTo)) {
    console.error('No se pudo resolver --from-day/--to-day (ni inferir de eventos).')
    process.exit(1)
  }

  const runId = stableWindowRunId(effectiveFrom, effectiveTo)
  const runDir = join(args.outRoot, 'windows', runId)
  wipeAndCreateRunDir(runDir)

  const startedAt = new Date().toISOString()
  const logLines: string[] = []
  const log = (msg: string) => {
    logLines.push(msg)
    console.info(msg)
  }

  log(`[etl-headless] runId=${runId} (ventana ${effectiveFrom}..${effectiveTo}, pisado)`)
  log(`[etl-headless] path=windows/${runId}`)
  log(`[etl-headless] events=${args.eventsPaths.join(', ')}`)
  if (args.persistDebug) log('[etl-headless] persist-debug=ON')

  let preNormalizedMovimientos:
    | import('../src/features/real-truckflow/etlWorkbench/etlExternalMovimientosContrato.ts').ExternalMovimientoContratoNormalized[]
    | undefined
  if (existsSync(args.movimientosRoot)) {
    const mov = readMovimientosRange(args.movimientosRoot, effectiveFrom, effectiveTo)
    if (mov.length) {
      preNormalizedMovimientos = mov
      log(`[etl-headless] movimientos backup: ${mov.length} filas (${effectiveFrom}→${effectiveTo})`)
    }
  }

  const inputHash = createHash('sha256')
    .update(
      JSON.stringify({
        events: args.eventsPaths,
        movimientosRows: preNormalizedMovimientos?.length ?? 0,
        rulesVersion: ETL_TRANSFORM_RULES_VERSION,
        from: effectiveFrom,
        to: effectiveTo,
      })
    )
    .digest('hex')
    .slice(0, 12)

  writeFileSync(
    join(runDir, 'manifest.json'),
    JSON.stringify(
      {
        runId,
        status: 'running',
        startedAt,
        fromDay: effectiveFrom,
        toDay: effectiveTo,
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
    const { coreCount, debugCount, persistedKeys } = persistTables(
      runDir,
      out.csv,
      out.tables,
      args.persistDebug
    )
    const finishedAt = new Date().toISOString()
    log(
      `[etl-headless] tablas núcleo=${coreCount}` +
        (args.persistDebug ? ` debug=${debugCount}` : ' (sin debug)') +
        ` rules=${out.rulesVersion}`
    )

    writeFileSync(join(runDir, 'logs.txt'), logLines.join('\n') + '\n', 'utf8')
    writeFileSync(
      join(runDir, 'manifest.json'),
      JSON.stringify(
        {
          runId,
          status: 'ok',
          startedAt,
          finishedAt,
          fromDay: effectiveFrom,
          toDay: effectiveTo,
          rulesVersion: out.rulesVersion ?? ETL_TRANSFORM_RULES_VERSION,
          layout: 'windows_stable_v1',
          persistDebug: args.persistDebug,
          input: {
            eventsPaths: args.eventsPaths,
            movimientosRows: preNormalizedMovimientos?.length ?? 0,
            inputHash,
            eventCount: events.length,
          },
          output: {
            tableCount: coreCount + debugCount,
            coreTableCount: coreCount,
            debugTableCount: debugCount,
            tableKeys: persistedKeys,
          },
        },
        null,
        2
      ),
      'utf8'
    )

    updateWindowIndex({
      outRoot: args.outRoot,
      fromDay: effectiveFrom,
      toDay: effectiveTo,
      runId,
      inputHash,
      rulesVersion: out.rulesVersion ?? ETL_TRANSFORM_RULES_VERSION,
    })

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
          fromDay: effectiveFrom,
          toDay: effectiveTo,
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
