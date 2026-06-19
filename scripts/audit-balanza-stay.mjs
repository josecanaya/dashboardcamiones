/**
 * Audita tramo KPI balanza ingreso → balanza egreso (R1/R3/R4/R5/R6).
 * Compara tiempo de cámara vs candidatos template/rollup/Excel y lista flags.
 *
 * Uso:
 *   npx tsx scripts/audit-balanza-stay.mjs [ruta_segment_scatter.csv]
 *
 * Si no pasás CSV, intenta leer desde stdin un export de segment_scatter_analysis
 * (mismas columnas que Excel-first: external_operation_id, segment_from, …).
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

const root = resolve(import.meta.dirname, '..')
const timingUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/etlSegmentTiming.ts')
).href

const {
  diagnoseBalanzaStayFromTimedSegments,
  balanzaStayDiagnosticsToCsv,
} = await import(timingUrl)

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  if (!lines.length) return []
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

function groupScatterRows(rows) {
  const byOp = new Map()
  for (const row of rows) {
    const op = String(row.external_operation_id ?? row.journey_uid ?? '').trim()
    if (!op) continue
    const bucket = byOp.get(op) ?? {
      operationId: op,
      plate: String(row.plate_normalized ?? '').trim(),
      circuitCode: String(row.resolved_executive_circuit_code ?? row.truckflow_circuit_code ?? '').trim(),
      externalSalidaAt: String(row.external_salida_at ?? '').trim() || undefined,
      externalCaladoAt: String(row.external_calado_at ?? '').trim() || undefined,
      externalIngresoAt: String(row.external_ingreso_at ?? '').trim() || undefined,
      platformNormalized: String(row.platform_normalized ?? '').trim() || undefined,
      segments: [],
      measuredBalanzaStay: null,
    }
    const from = String(row.segment_from ?? '').trim()
    const to = String(row.segment_to ?? '').trim()
    const start = String(row.segment_start_time ?? '').trim()
    const end = String(row.segment_end_time ?? '').trim()
    if (from && to && start && end) {
      bucket.segments.push({
        segment_from: from,
        segment_to: to,
        segment_start_time: start,
        segment_end_time: end,
      })
      if (from === 'BALANZA_INGRESO' && to === 'BALANZA_EGRESO') {
        bucket.measuredBalanzaStay = {
          segment_start_time: start,
          segment_end_time: end,
          durationMinutes: Number(row.segment_duration_min),
        }
      }
    }
    byOp.set(op, bucket)
  }
  return [...byOp.values()]
}

const csvPath = process.argv[2]
let raw = ''
if (csvPath) {
  raw = readFileSync(resolve(csvPath), 'utf8')
} else {
  console.error('Pegá o redirigí un CSV de segment_scatter_analysis (o pasá ruta como 1er argumento).')
  process.exit(1)
}

const rows = parseCsv(raw)
const ready = rows.filter((r) => String(r.analysis_ready_for_scatter ?? 'true') !== 'false')
const groups = groupScatterRows(ready.length ? ready : rows)

const diagnostics = []
for (const g of groups) {
  if (!g.circuitCode) continue
  const d = diagnoseBalanzaStayFromTimedSegments(
    {
      operationId: g.operationId,
      plate: g.plate,
      executiveCircuitCode: g.circuitCode,
      segments: g.segments,
      externalSalidaAt: g.externalSalidaAt,
      externalCaladoAt: g.externalCaladoAt,
      externalIngresoAt: g.externalIngresoAt,
      platformNormalized: g.platformNormalized,
    },
    { measuredBalanzaStay: g.measuredBalanzaStay ?? undefined }
  )
  if (d) diagnostics.push(d)
}

const flagged = diagnostics.filter((d) => d.flags.length > 0)
console.log(`Operaciones analizadas: ${diagnostics.length}`)
console.log(`Con flags de riesgo: ${flagged.length}`)
console.log('')
console.log(balanzaStayDiagnosticsToCsv(flagged.length ? flagged : diagnostics))
