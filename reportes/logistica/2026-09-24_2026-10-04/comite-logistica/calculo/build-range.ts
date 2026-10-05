/**
 * Temporal: compone 24/09–04/10 con 21–27 (24–27), 28–04 versionada (28–30)
 * y 28–04 reprocesada con datos nuevos (01–04, en scratch).
 * Uso: npx tsx scripts/_tmp-build-range-oct.ts <dirRunNuevo>
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { buildLogisticsReportPackage } from '../src/features/real-truckflow/logisticsReport/logisticsReportPackage'
import { composeRunsIntoTransformOutput } from '../src/features/real-truckflow/etlWorkbench/etlComposeRuns'
import { RAIZ, serializeCsv } from './lib/loadRunHeadless'
// @ts-expect-error módulo .mjs del servidor, sin tipos
import { writeReportRevision } from '../server/logisticsReport/reportRevision.mjs'

async function cargarDir(dir: string) {
  const nombres = (await fs.readdir(path.join(dir, 'tables'))).filter((f) => f.endsWith('.json'))
  const tables: Record<string, any> = {}
  const csv: Record<string, string> = {}
  for (const archivo of nombres) {
    const t = JSON.parse(await fs.readFile(path.join(dir, 'tables', archivo), 'utf8'))
    const n = archivo.replace(/\.json$/, '')
    tables[n] = { headers: t.headers ?? [], rows: t.rows ?? [] }
    csv[n] = serializeCsv(t.headers ?? [], t.rows ?? [])
  }
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'))
  let stats: any = {}
  try { stats = JSON.parse(await fs.readFile(path.join(dir, 'stats.json'), 'utf8')) } catch {}
  return { csv, tables, stats, rulesVersion: String(manifest.rulesVersion ?? '') } as any
}

const nuevo = process.argv[2]
const from = process.argv[3] ?? '2026-09-24'
const to = process.argv[4] ?? '2026-10-04'
const W = path.join(RAIZ, 'runs', 'windows')
const all = [
  { runId: '2026-09-21_2026-09-27', output: await cargarDir(path.join(W, '2026-09-21_2026-09-27')), spanFrom: '2026-09-24', spanTo: '2026-09-27' },
  { runId: '2026-09-28_2026-10-04', output: await cargarDir(path.join(W, '2026-09-28_2026-10-04')), spanFrom: '2026-09-28', spanTo: '2026-09-30' },
  { runId: '2026-09-28_2026-10-04', output: await cargarDir(nuevo), spanFrom: '2026-10-01', spanTo: '2026-10-04' },
]
const runs = all.filter((r) => r.spanTo >= from && r.spanFrom <= to).map((r) => ({
  ...r, spanFrom: r.spanFrom < from ? from : r.spanFrom, spanTo: r.spanTo > to ? to : r.spanTo,
}))
const composed = composeRunsIntoTransformOutput(runs as any, from, to)
const label = `${from}..${to} = ` + runs.map((r, i) => `${r.runId}${i === 2 ? '(reproc. 05/10, cámaras 30/09–04/10)' : ''}:${r.spanFrom}:${r.spanTo}`).join(' + ')
if (process.env.DUMP_DIR) {
  await fs.mkdir(process.env.DUMP_DIR, { recursive: true })
  for (const n of ['excel_operations_with_truckflow', 'circuit_timing_journeys', 'segment_timing_legs', 'final_circuits', 'liquid_movements_summary']) {
    const t = (composed.output.tables as any)[n]
    if (t) await fs.writeFile(path.join(process.env.DUMP_DIR, `${n}.json`), JSON.stringify(t))
  }
  process.exit(0)
}
const paquete = buildLogisticsReportPackage(composed.output, { from, to, runIds: composed.usedRunIds, composedRange: label })
if (paquete.controles.sinDatos) { console.error('sin datos'); process.exit(1) }
const r = await writeReportRevision({ projectRoot: RAIZ, pkg: paquete })
console.log(`Revisión ${r.revision}: ${r.revisionDir}`)
