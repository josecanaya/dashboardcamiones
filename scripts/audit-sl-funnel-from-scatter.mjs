/** Embudo rápido desde excel_operation_segments_for_scatter.csv */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const csvPath = process.argv[2] || resolve('RUTA/excel_operation_segments_for_scatter.csv')
const text = readFileSync(csvPath, 'utf8')
const lines = text.trim().split(/\r?\n/)
function parseLine(line) {
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
const rows = lines.slice(1).map((line) => {
  const cols = parseLine(line)
  const row = {}
  header.forEach((h, j) => {
    row[h] = cols[j] ?? ''
  })
  return row
})

const R7 = new Set(['R7', 'SL1', 'R26', 'R27'])
const byOp = new Map()
for (const row of rows) {
  const circ = String(row.resolved_executive_circuit_code || row.truckflow_circuit_code || '').trim()
  if (circ && !R7.has(circ)) continue
  const op = String(row.external_operation_id || '').trim()
  if (!op) continue
  let b = byOp.get(op)
  if (!b) {
    b = {
      ready: String(row.analysis_ready_for_scatter ?? 'true').toLowerCase() !== 'false',
      match: row.match_quality,
      route: row.route_quality,
      warn: row.analysis_warning,
      segs: new Set(),
      inferred: false,
    }
    byOp.set(op, b)
  }
  const f = row.segment_from
  const t = row.segment_to
  if (f && t) {
    b.segs.add(`${f}->${t}`)
    if (String(row.truckflow_valid_detail || '').includes('INFERRED')) b.inferred = true
  }
}

const ops = [...byOp.values()]
const n = (fn) => ops.filter(fn).length
const hasLeg = (a, b) => n((x) => x.segs.has(`${a}->${b}`))
const touches = (code) => n((x) => [...x.segs].some((s) => s.includes(code)))

console.log('Archivo:', csvPath)
console.log('Operaciones R7/SL:', ops.length)
console.log('analysis_ready_for_scatter:', n((x) => x.ready))
console.log('')
console.log('--- Tramos (operaciones con al menos un leg) ---')
console.log('EGRESO -> SL_INGRESO:', hasLeg('EGRESO', 'SL_INGRESO'))
console.log('cualquier SL_INGRESO en tramos:', touches('SL_INGRESO'))
console.log('SL_INGRESO -> SL_BALANZA_INGRESO:', hasLeg('SL_INGRESO', 'SL_BALANZA_INGRESO'))
console.log('cualquier SL_BALANZA_INGRESO:', touches('SL_BALANZA_INGRESO'))
console.log('SL_BALANZA_INGRESO -> SL_BALANZA_SALIDA:', hasLeg('SL_BALANZA_INGRESO', 'SL_BALANZA_SALIDA'))
console.log('SL_BALANZA_INGRESO -> SL_EGRESO (rollup):', hasLeg('SL_BALANZA_INGRESO', 'SL_EGRESO'))
console.log('')
console.log('Con SL_INGRESO pero SIN leg SL_INGRESO->SL_BALANZA:', n((x) => [...x.segs].some((s) => s.includes('SL_INGRESO')) && !x.segs.has('SL_INGRESO->SL_BALANZA_INGRESO')))
console.log('Con S1 en tramos pero sin S0->S1:', n((x) => touches('SL_BALANZA_INGRESO') && !x.segs.has('SL_INGRESO->SL_BALANZA_INGRESO')))
console.log('')
console.log('match NO_TRUCKFLOW / sin evidence:', n((x) => x.match === 'NO_TRUCKFLOW_EVIDENCE'))
console.log('route ROUTE_PARTIAL:', n((x) => x.route === 'ROUTE_PARTIAL'))
console.log('route ROUTE_INCOMPLETE:', n((x) => x.route === 'ROUTE_INCOMPLETE'))
console.log('warnings NO_MEASURABLE_SEGMENTS:', n((x) => String(x.warn).includes('NO_MEASURABLE_SEGMENTS')))
