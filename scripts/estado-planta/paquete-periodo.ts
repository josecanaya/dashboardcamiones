/**
 * Paquete del dashboard («Cargar rango») para un período cualquiera, componiendo corridas por tramo de días.
 * Generaliza reportes/logistica/2026-09-24_2026-10-04/comite-logistica/calculo/build-range.ts (que tenía las corridas fijas).
 * Uso: npx tsx scripts/estado-planta/paquete-periodo.ts <salida.json> <desde> <hasta> <dirCorrida>:<spanDesde>:<spanHasta> [...]
 *   dirCorrida = carpeta con manifest.json y tables/ (p. ej. runs/windows/2026-10-05_2026-10-11).
 * Sin planilla en la corrida, el paquete trae la actividad de sectores (cámaras) y los tiempos quedan vacíos.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { buildLogisticsReportPackage } from '../../src/features/real-truckflow/logisticsReport/logisticsReportPackage'
import { composeRunsIntoTransformOutput } from '../../src/features/real-truckflow/etlWorkbench/etlComposeRuns'
import { serializeCsv } from '../lib/loadRunHeadless'

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
  return { output: { csv, tables, stats, rulesVersion: String(manifest.rulesVersion ?? '') } as any, manifest }
}

const [salida, from, to, ...specs] = process.argv.slice(2)
if (!salida || !from || !to || !specs.length) {
  console.error('Uso: paquete-periodo.ts <salida.json> <desde> <hasta> <dirCorrida>:<spanDesde>:<spanHasta> [...]')
  process.exit(2)
}
const runs = []
for (const s of specs) {
  const m = s.match(/^(.*):(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/)
  if (!m) throw new Error(`Corrida mal escrita: ${s}`)
  const { output, manifest } = await cargarDir(m[1])
  runs.push({ runId: String(manifest.runId), output, spanFrom: m[2] < from ? from : m[2], spanTo: m[3] > to ? to : m[3],
    rulesVersion: String(manifest.rulesVersion ?? ''), movimientosRows: manifest.input?.movimientosRows ?? null })
}
const composed = composeRunsIntoTransformOutput(runs as any, from, to)
const label = `${from}..${to} = ` + runs.map((r) => `${r.runId}:${r.spanFrom}:${r.spanTo}`).join(' + ')
const paquete: any = buildLogisticsReportPackage(composed.output, { from, to, runIds: composed.usedRunIds, composedRange: label })
paquete.corridas = runs.map((r) => ({ runId: r.runId, spanFrom: r.spanFrom, spanTo: r.spanTo, rulesVersion: r.rulesVersion, movimientosRows: r.movimientosRows }))
await fs.mkdir(path.dirname(path.resolve(salida)), { recursive: true })
await fs.writeFile(salida, JSON.stringify(paquete, null, 1))
console.log(`${salida} · ${label} · sinDatos=${paquete.controles?.sinDatos ?? false}`)
