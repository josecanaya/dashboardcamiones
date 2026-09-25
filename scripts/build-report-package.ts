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
import process from 'node:process'
import { buildLogisticsReportPackage } from '../src/features/real-truckflow/logisticsReport/logisticsReportPackage'
import { cargarCorrida, RAIZ } from './lib/loadRunHeadless'
// @ts-expect-error módulo .mjs del servidor, sin tipos
import { writeReportRevision } from '../server/logisticsReport/reportRevision.mjs'

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
