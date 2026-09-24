/**
 * Arma una revisión del informe de logística desde una corrida ya guardada, sin navegador.
 *
 * Es lo mismo que hace el dashboard al exportar (`useLogisticsReportExport`), pero leyendo
 * `runs/windows/<runId>/tables/*.json` en vez del resultado cargado en pantalla. No corre el
 * ETL: usa las tablas que la corrida ya materializó, con la misma conversión a CSV que
 * `loadTransformOutputFromRun`, el mismo `buildLogisticsReportPackage` y la misma escritura
 * de revisión que el endpoint (`writeReportRevision`).
 *
 * Sirve para regenerar el paquete cuando cambia el exportador (un campo nuevo, una regla),
 * sin depender de que alguien abra el dashboard y reexporte.
 *
 * Uso:
 *   npx tsx scripts/build-report-package.ts <runId> [desde] [hasta]
 *
 * Sin `desde`/`hasta` usa el rango de la corrida (`2026-09-17_2026-09-22` → 17 al 22).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { buildLogisticsReportPackage } from '../src/features/real-truckflow/logisticsReport/logisticsReportPackage'
import type { EtlTransformOutput } from '../src/features/real-truckflow/etlWorkbench/etlTransformContracts'
// @ts-expect-error módulo .mjs del servidor, sin tipos
import { writeReportRevision } from '../server/logisticsReport/reportRevision.mjs'

const RAIZ = path.resolve(import.meta.dirname, '..')

/** Misma serialización que `loadTransformOutputFromRun`: el builder recibe CSV. */
function serializeCsv(headers: string[], rows: Record<string, unknown>[]): string {
  if (!headers.length) return ''
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','))
  return lines.join('\n')
}

async function cargarCorrida(runId: string): Promise<EtlTransformOutput> {
  const dir = path.join(RAIZ, 'runs', 'windows', runId)
  const nombres = (await fs.readdir(path.join(dir, 'tables'))).filter((f) => f.endsWith('.json'))
  const tables: Record<string, { headers: string[]; rows: Record<string, unknown>[] }> = {}
  const csv: Record<string, string> = {}
  for (const archivo of nombres) {
    const t = JSON.parse(await fs.readFile(path.join(dir, 'tables', archivo), 'utf8'))
    const nombre = archivo.replace(/\.json$/, '')
    tables[nombre] = { headers: t.headers ?? [], rows: t.rows ?? [] }
    csv[nombre] = serializeCsv(t.headers ?? [], t.rows ?? [])
  }
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'))
  let stats: unknown = {}
  try {
    stats = JSON.parse(await fs.readFile(path.join(dir, 'stats.json'), 'utf8'))
  } catch {
    stats = {}
  }
  return {
    csv,
    tables: tables as unknown as EtlTransformOutput['tables'],
    stats: stats as EtlTransformOutput['stats'],
    rulesVersion: String(manifest.rulesVersion ?? '') as EtlTransformOutput['rulesVersion'],
  }
}

const [runId, desdeArg, hastaArg] = process.argv.slice(2)
if (!runId) {
  console.error('Uso: npx tsx scripts/build-report-package.ts <runId> [desde] [hasta]')
  process.exit(1)
}
const [desdeRun, hastaRun] = runId.split('_')
const from = desdeArg ?? desdeRun
const to = hastaArg ?? hastaRun

const tr = await cargarCorrida(runId)
console.log(`Corrida ${runId}: ${Object.keys(tr.csv).length} tablas, reglas ${tr.rulesVersion}`)

const paquete = buildLogisticsReportPackage(tr, { from, to, runIds: [runId], composedRange: null })
if (paquete.controles.sinDatos) {
  console.error(`El período ${from} → ${to} no tiene datos en la corrida ${runId}.`)
  process.exit(1)
}

const r = await writeReportRevision({ projectRoot: RAIZ, pkg: paquete })
console.log(`Revisión ${r.revision}: ${r.revisionDir}`)
console.log(
  `Gráficos: ${r.cobertura.graficos.completados} completos, ${r.cobertura.graficos.pendientes} pendientes · ` +
    `Textos: ${r.cobertura.textos.conectados} conectados, ${r.cobertura.textos.sinDato} s/d`,
)
