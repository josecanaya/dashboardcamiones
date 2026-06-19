/**
 * Por operación R7/SL: por qué no entra al KPI ingreso→balanza (misma lógica que scatter, sin ETL).
 * Uso: npx tsx scripts/audit-sl-ingreso-balanza-drop.mjs RUTA/excel_operation_segments_for_scatter.csv
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

const root = resolve(import.meta.dirname, '..')
const timingUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/etlSegmentTiming.ts')
).href
const { synthesizeSlRollupLegsFromTimedSegments, SL_INGRESO_BALANZA_ROLLUP_TRANSITION } =
  await import(timingUrl)

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  const parseLine = (line) => {
    const out = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (ch === '"') inQ = false
        else cur += ch
      } else if (ch === '"') inQ = true
      else if (ch === ',') {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out
  }
  const header = parseLine(lines[0])
  return lines.slice(1).map((line) => {
    const cols = parseLine(line)
    const row = {}
    header.forEach((h, j) => {
      row[h] = cols[j] ?? ''
    })
    return row
  })
}

const csvPath = process.argv[2] || resolve('RUTA/excel_operation_segments_for_scatter.csv')
const rows = parseCsv(readFileSync(csvPath, 'utf8'))
const R7 = new Set(['R7', 'SL1', 'R26', 'R27'])
const byOp = new Map()

for (const row of rows) {
  const circ = (row.resolved_executive_circuit_code || row.truckflow_circuit_code || '').trim()
  if (circ && !R7.has(circ)) continue
  const op = (row.external_operation_id || '').trim()
  if (!op) continue
  let b = byOp.get(op)
  if (!b) {
    b = {
      plate: row.plate_normalized,
      circuit: circ || 'R7',
      ready: row.analysis_ready_for_scatter !== 'false',
      hasSlIngreso: false,
      hasMeasuredLeg: false,
      segments: [],
      ingreso: row.external_ingreso_at,
      salida: row.external_salida_at,
      calado: row.external_calado_at,
      planta: row.planta_normalized,
    }
    byOp.set(op, b)
  }
  const f = row.segment_from
  const t = row.segment_to
  if (f === 'SL_INGRESO' || t === 'SL_INGRESO') b.hasSlIngreso = true
  if (f === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.from && t === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.to) {
    b.hasMeasuredLeg = true
  }
  if (f && t && row.segment_start_time && row.segment_end_time) {
    b.segments.push({
      segment_from: f,
      segment_to: t,
      segment_start_time: row.segment_start_time,
      segment_end_time: row.segment_end_time,
    })
  }
}

const counts = {
  total: 0,
  not_ready_scatter: 0,
  sin_sl_ingreso_en_tramos: 0,
  ya_tiene_leg_medido: 0,
  synth_genera_leg: 0,
  synth_sin_leg: 0,
}

for (const [opId, b] of byOp) {
  counts.total++
  if (!b.ready) {
    counts.not_ready_scatter++
    continue
  }
  if (!b.hasSlIngreso) {
    counts.sin_sl_ingreso_en_tramos++
    continue
  }
  if (b.hasMeasuredLeg) {
    counts.ya_tiene_leg_medido++
    counts.synth_genera_leg++
    continue
  }
  const legs = synthesizeSlRollupLegsFromTimedSegments({
    operationId: opId,
    plate: b.plate,
    executiveCircuitCode: b.circuit,
    segments: b.segments,
    externalIngresoAt: b.ingreso,
    externalSalidaAt: b.salida,
    externalCaladoAt: b.calado,
    plantaNormalized: b.planta,
  })
  const leg = legs.find(
    (l) =>
      l.fromCode === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.from &&
      l.toCode === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.to
  )
  if (leg) counts.synth_genera_leg++
  else counts.synth_sin_leg++
}

console.error('=== Dónde se pierde ingreso → balanza (KPI) ===')
console.error(`Archivo: ${csvPath}`)
console.error(`Operaciones R7/SL: ${counts.total}`)
console.error(`  analysis_ready_for_scatter=false: ${counts.not_ready_scatter}`)
console.error(`  sin SL_INGRESO en tramos merge: ${counts.sin_sl_ingreso_en_tramos}`)
console.error(`  ya con leg SL_INGRESO→SL_BALANZA en CSV: ${counts.ya_tiene_leg_medido}`)
console.error(`  synth OK (entrarían al KPI): ${counts.synth_genera_leg}`)
console.error(`  con SL_INGRESO pero synth NO arma leg: ${counts.synth_sin_leg}`)
console.error('')
console.error(
  'Si synth_sin_leg es alto tras re-ETL, falta S1/S7 en segmentos merge o timeline (no ventana KPI).'
)
