/**
 * Paquete del informe de logística para un rango que cruza varias corridas semanales
 * (p. ej. comité jueves→miércoles), componiendo las corridas guardadas como el dashboard
 * ("Cargar rango (guardado)") y escribiendo una revisión nueva.
 *
 * Uso: npx tsx scripts/build-report-package-range.ts <desde> <hasta> <run1>:<spanDesde>:<spanHasta> [<run2>:...]
 */
import process from 'node:process'
import { buildLogisticsReportPackage } from '../src/features/real-truckflow/logisticsReport/logisticsReportPackage'
import { composeRunsIntoTransformOutput } from '../src/features/real-truckflow/etlWorkbench/etlComposeRuns'
import { cargarCorrida, RAIZ } from './lib/loadRunHeadless'
// @ts-expect-error módulo .mjs del servidor, sin tipos
import { writeReportRevision } from '../server/logisticsReport/reportRevision.mjs'

const [from, to, ...specs] = process.argv.slice(2)
if (!from || !to || !specs.length) {
  console.error('Uso: npx tsx scripts/build-report-package-range.ts <desde> <hasta> <run>:<spanDesde>:<spanHasta> ...')
  process.exit(1)
}
const runs = []
for (const s of specs) {
  const [runId, spanFrom, spanTo] = s.split(':')
  runs.push({ runId, output: await cargarCorrida(runId), spanFrom, spanTo })
}
const composed = composeRunsIntoTransformOutput(runs, from, to)
const label = `${from}..${to} = ` + specs.join(' + ')
const paquete = buildLogisticsReportPackage(composed.output, { from, to, runIds: composed.usedRunIds, composedRange: label })
if (paquete.controles.sinDatos) {
  console.error(`El período ${from} → ${to} no tiene datos.`)
  process.exit(1)
}
const r = await writeReportRevision({ projectRoot: RAIZ, pkg: paquete })
console.log(`Revisión ${r.revision}: ${r.revisionDir}`)
