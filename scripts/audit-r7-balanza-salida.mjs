/**
 * Audita R7: tramo SL_BALANZA_INGRESO → SL_EGRESO (balanza ingreso vs salida).
 * Contrasta cámara S1/S7, salida Excel, corrección −2 h y payload comité.
 *
 * Uso:
 *   npx tsx scripts/audit-r7-balanza-salida.mjs ruta/segment_scatter_analysis.csv
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

const root = resolve(import.meta.dirname, '..')
const timingUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/etlSegmentTiming.ts')
).href

const { diagnoseR7SlBalanzaIngresoSalida, r7SlBalanzaSalidaDiagnosticsToCsv } = await import(timingUrl)

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

function groupByOperation(rows) {
  const byOp = new Map()
  for (const row of rows) {
    const circuit = String(row.resolved_executive_circuit_code ?? row.truckflow_circuit_code ?? '').trim()
    if (circuit !== 'R7' && circuit !== 'SL1' && circuit !== 'R26' && circuit !== 'R27') continue
    const op = String(row.external_operation_id ?? row.journey_uid ?? '').trim()
    if (!op) continue
    const bucket = byOp.get(op) ?? {
      operationId: op,
      plate: String(row.plate_normalized ?? '').trim(),
      executiveCircuitCode: circuit,
      externalSalidaAt: String(row.external_salida_at ?? '').trim() || undefined,
      externalCaladoAt: String(row.external_calado_at ?? '').trim() || undefined,
      externalIngresoAt: String(row.external_ingreso_at ?? '').trim() || undefined,
      plantaNormalized: String(row.planta_normalized ?? '').trim() || undefined,
      segments: [],
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
    }
    byOp.set(op, bucket)
  }
  return [...byOp.values()]
}

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Uso: npx tsx scripts/audit-r7-balanza-salida.mjs <segment_scatter.csv>')
  process.exit(1)
}

const rows = parseCsv(readFileSync(resolve(csvPath), 'utf8'))
const groups = groupByOperation(rows.filter((r) => String(r.analysis_ready_for_scatter ?? 'true') !== 'false'))

const diagnostics = []
for (const g of groups) {
  const d = diagnoseR7SlBalanzaIngresoSalida(g)
  if (d) diagnostics.push(d)
}

const flagged = diagnostics.filter((d) => d.flags.length > 0)
console.error(`Operaciones R7/SL rollup: ${diagnostics.length}`)
console.error(`Con flags: ${flagged.length}`)
console.log(r7SlBalanzaSalidaDiagnosticsToCsv(flagged.length ? flagged : diagnostics))
