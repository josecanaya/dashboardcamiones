/**
 * Perfil ETL Workbench. Ejecutar: ETL_PROFILE=true npx vite-node scripts/etl-profile-run.ts [json]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { runEtlTransform } from '../src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts'
import { resetGlobalEtlProfiler } from '../src/features/real-truckflow/etlWorkbench/etlProfile.ts'

const jsonPath =
  process.argv.find((a) => !a.startsWith('--') && a.endsWith('.json')) ||
  resolve('public/mock-data/realdata/journey-events_2026-05-04_2026-05-10.json')
const outArg = process.argv.indexOf('--out')
const outPath =
  outArg >= 0 ?
    resolve(process.argv[outArg + 1] ?? 'scripts/output/etl-profile-last.json')
  : resolve('scripts/output/etl-profile-last.json')

function loadEvents(file: string): unknown[] {
  const raw = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  const arr = Array.isArray(raw) ? raw : (raw as { value?: unknown[] }).value ?? (raw as { events?: unknown[] }).events ?? []
  return arr.filter((e) => e && (e as { journeyUid?: string }).journeyUid)
}

const events = loadEvents(jsonPath) as import('../src/services/realJourneyEvents.types').RealJourneyEventDto[]
const profiler = resetGlobalEtlProfiler()
const t0 = performance.now()

const out = await runEtlTransform(
  {
    events,
    alerts: [],
    mergeWindowHours: 4,
    loadedEventFilesCount: 1,
    loadedAlertFilesCount: 0,
  },
  { profiler }
)

const payload = {
  ranAt: new Date().toISOString(),
  eventsFile: jsonPath,
  eventCount: events.length,
  finalCircuitRows: Math.max(0, (out.csv.final_circuits || '').split(/\r?\n/).length - 1),
  executive: out.stats.executive,
  totalWallMs: Math.round(performance.now() - t0),
  spans: profiler.getSpans(),
  heapMb: profiler.heapMbApprox(),
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8')
console.info(`Perfil guardado en ${outPath}`)
