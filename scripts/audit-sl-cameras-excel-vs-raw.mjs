/**
 * Diagnóstico San Lorenzo cámara por cámara (S0–S7): Excel vs event-list crudo.
 *
 * Uso:
 *   npx tsx scripts/audit-sl-cameras-excel-vs-raw.mjs RUTA/excel_operation_segments_for_scatter.csv data/truckflow --from 2026-06-04 --to 2026-06-11
 *
 * Opciones:
 *   --por-dispositivo   una columna por deviceCode (SLZIngCamFrente, SLZBalIngFte, …)
 *   --incluir-traseras  cámaras traseras del catálogo
 *   --incluir-liquidos  S10 Renova
 *   --todas-filas       CSV con todas las ops×slots (default: solo gap raw_no_pipeline / fuera ventana)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'
import { pathToFileURL } from 'url'

const root = resolve(import.meta.dirname, '..')
const modUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/auditSlCameraExcelCoverage.ts')
).href

const {
  auditExcelOperationsAgainstSlCameraSlots,
  buildSlKpiCameraAuditSlots,
  buildPerDeviceAuditSlots,
  summarizeSlCameraAuditBySlot,
  slCameraAuditToCsv,
  formatSlCameraAuditSummaryLog,
  isRawEventForSlot,
} = await import(modUrl)

const R7_SL_CIRCUITS = new Set(['R7', 'SL1', 'R26', 'R27'])

function parseCli(argv) {
  let fromDay = ''
  let toDay = ''
  let porDispositivo = false
  let incluirTraseras = false
  let incluirLiquidos = false
  let todasFilas = false
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--from') {
      fromDay = String(argv[++i] ?? '').trim()
      continue
    }
    if (a === '--to') {
      toDay = String(argv[++i] ?? '').trim()
      continue
    }
    if (a === '--por-dispositivo') {
      porDispositivo = true
      continue
    }
    if (a === '--incluir-traseras') {
      incluirTraseras = true
      continue
    }
    if (a === '--incluir-liquidos') {
      incluirLiquidos = true
      continue
    }
    if (a === '--todas-filas') {
      todasFilas = true
      continue
    }
    positional.push(a)
  }
  return { fromDay, toDay, porDispositivo, incluirTraseras, incluirLiquidos, todasFilas, positional }
}

function printUsage() {
  console.error(`
Uso:
  npx tsx scripts/audit-sl-cameras-excel-vs-raw.mjs <scatter.csv> <eventos|data/truckflow> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [ops.csv] [opciones]

Opciones:
  --por-dispositivo    SLZIngCamFrente, SLZBalIngFte, SLZSalidaC1Fte, etc.
  --incluir-traseras
  --incluir-liquidos   S10
  --todas-filas        CSV completo (default: solo fugas raw_no_pipeline y fuera de ventana)

Ejemplo:
  npx tsx scripts/audit-sl-cameras-excel-vs-raw.mjs RUTA/excel_operation_segments_for_scatter.csv data/truckflow --from 2026-06-04 --to 2026-06-11 > RUTA/audit-sl-camaras.csv
`)
}

const DAY_DIR_RE = /^\d{4}-\d{2}-\d{2}$/

function parseDayKey(s) {
  const t = Date.parse(`${s}T12:00:00`)
  return Number.isFinite(t) ? t : Number.NaN
}

function loadJsonEventArray(raw) {
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw.value)) return raw.value
  if (Array.isArray(raw.events)) return raw.events
  if (Array.isArray(raw.records)) return raw.records
  throw new Error('JSON: array, .value[], .events[] o .records[]')
}

function loadEventsFromFile(path) {
  const lower = path.toLowerCase()
  if (lower.endsWith('.csv')) {
    const rows = parseCsv(readFileSync(path, 'utf8'))
    return rows.map(csvRowToJourneyEvent)
  }
  return loadJsonEventArray(JSON.parse(readFileSync(path, 'utf8')))
}

function loadEventsFromTruckflowDir(dir, fromDay, toDay) {
  const fromMs = fromDay ? parseDayKey(fromDay) : Number.NaN
  const toMs = toDay ? parseDayKey(toDay) : Number.NaN
  const dayDirs = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && DAY_DIR_RE.test(e.name))
    .map((e) => e.name)
    .filter((name) => {
      const ms = parseDayKey(name)
      if (!Number.isFinite(ms)) return false
      if (Number.isFinite(fromMs) && ms < fromMs) return false
      if (Number.isFinite(toMs) && ms > toMs) return false
      return true
    })
    .sort()
  const all = []
  for (const day of dayDirs) {
    const file = join(dir, day, 'event-list.json')
    if (!existsSync(file)) continue
    const batch = loadEventsFromFile(file)
    console.error(`  ${day}: ${batch.length} eventos`)
    all.push(...batch)
  }
  return { events: all, dayDirs }
}

function loadEventsInput(path, fromDay, toDay) {
  const st = statSync(path)
  if (st.isDirectory()) {
    const { events, dayDirs } = loadEventsFromTruckflowDir(path, fromDay, toDay)
    return { events, sourceLabel: `${path} [${dayDirs.join(', ')}]` }
  }
  return { events: loadEventsFromFile(path), sourceLabel: path }
}

function resolveInputPath(arg) {
  const trimmed = String(arg ?? '').trim()
  if (!trimmed) return ''
  if (isAbsolute(trimmed)) return trimmed
  return resolve(process.cwd(), trimmed)
}

function assertReadableFile(path, label) {
  if (!path || !existsSync(path)) {
    console.error(`No existe (${label}): ${path}`)
    printUsage()
    process.exit(1)
  }
}

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

function csvRowToJourneyEvent(row) {
  return {
    truckPlate: row.truck_plate ?? row.truckPlate,
    normalizedPlate: row.normalized_plate ?? row.normalizedPlate,
    deviceCode: row.device_code ?? row.deviceCode,
    sectorCode: row.sector_code ?? row.sectorCode,
    occurredAt: row.occurred_at ?? row.occurredAt,
    createdAt: row.created_at ?? row.createdAt,
    recordedAt: row.recorded_at ?? row.recordedAt,
    modifiedAt: row.modified_at ?? row.modifiedAt,
  }
}

function indexOpsExcelTimes(opsRows) {
  const map = new Map()
  for (const row of opsRows) {
    const op = String(row.external_operation_id ?? '').trim()
    if (!op) continue
    map.set(op, {
      externalIngresoAt: String(row.external_ingreso_at ?? '').trim() || undefined,
      externalSalidaAt: String(row.external_salida_at ?? '').trim() || undefined,
    })
  }
  return map
}

function inferWindowFromSegments(segments) {
  let minStart = ''
  let maxEnd = ''
  for (const s of segments) {
    const a = String(s.segment_start_time ?? '').trim()
    const b = String(s.segment_end_time ?? '').trim()
    if (a && (!minStart || a < minStart)) minStart = a
    if (b && (!maxEnd || b > maxEnd)) maxEnd = b
  }
  return { minStart, maxEnd }
}

function groupOperations(rows, opsTimesById) {
  const byOp = new Map()
  for (const row of rows) {
    const circuit = String(
      row.resolved_executive_circuit_code ?? row.truckflow_circuit_code ?? ''
    ).trim()
    if (circuit && !R7_SL_CIRCUITS.has(circuit)) continue
    const op = String(row.external_operation_id ?? row.journey_uid ?? '').trim()
    if (!op) continue
    const ready = String(row.analysis_ready_for_scatter ?? 'true').toLowerCase() !== 'false'
    const fromOps = opsTimesById?.get(op)
    const bucket = byOp.get(op) ?? {
      operationId: op,
      plate: String(row.plate_normalized ?? row.patente ?? '').trim(),
      executiveCircuitCode: circuit || 'R7',
      externalIngresoAt:
        String(row.external_ingreso_at ?? '').trim() || fromOps?.externalIngresoAt || undefined,
      externalSalidaAt:
        String(row.external_salida_at ?? '').trim() || fromOps?.externalSalidaAt || undefined,
      analysisReadyForScatter: ready,
      segments: [],
    }
    const from = String(row.segment_from ?? '').trim()
    const to = String(row.segment_to ?? '').trim()
    if (from && to) {
      bucket.segments.push({
        segment_from: from,
        segment_to: to,
        segment_start_time: String(row.segment_start_time ?? '').trim(),
        segment_end_time: String(row.segment_end_time ?? '').trim(),
      })
    }
    if (!bucket.externalIngresoAt && row.external_ingreso_at) {
      bucket.externalIngresoAt = String(row.external_ingreso_at).trim()
    }
    if (!bucket.externalSalidaAt && row.external_salida_at) {
      bucket.externalSalidaAt = String(row.external_salida_at).trim()
    }
    byOp.set(op, bucket)
  }
  for (const bucket of byOp.values()) {
    if (!bucket.externalIngresoAt || !bucket.externalSalidaAt) {
      const { minStart, maxEnd } = inferWindowFromSegments(bucket.segments)
      if (!bucket.externalIngresoAt && minStart) bucket.externalIngresoAt = minStart
      if (!bucket.externalSalidaAt && maxEnd) bucket.externalSalidaAt = maxEnd
    }
  }
  return [...byOp.values()]
}

const {
  fromDay,
  toDay,
  porDispositivo,
  incluirTraseras,
  incluirLiquidos,
  todasFilas,
  positional,
} = parseCli(process.argv.slice(2))
const csvPath = resolveInputPath(positional[0])
const eventsPath = resolveInputPath(positional[1])
const opsPath = resolveInputPath(positional[2])

if (!csvPath || !eventsPath) {
  printUsage()
  process.exit(1)
}

assertReadableFile(csvPath, 'scatter CSV')
if (!existsSync(eventsPath)) {
  console.error(`No existe: ${eventsPath}`)
  process.exit(1)
}
if (opsPath) assertReadableFile(opsPath, 'ops csv')

const slotOpts = { includeRear: incluirTraseras, includeLiquids: incluirLiquidos }
const slots = porDispositivo
  ? buildPerDeviceAuditSlots(slotOpts)
  : buildSlKpiCameraAuditSlots(slotOpts)

const rows = parseCsv(readFileSync(csvPath, 'utf8'))
const opsTimes = opsPath ? indexOpsExcelTimes(parseCsv(readFileSync(opsPath, 'utf8'))) : undefined
const operations = groupOperations(rows, opsTimes)
if (!operations.length) {
  console.error('Sin operaciones R7/SL en el CSV.')
  process.exit(1)
}

console.error('Cargando eventos Truckflow…')
const { events, sourceLabel } = loadEventsInput(eventsPath, fromDay, toDay)

const rawCountsBySlot = new Map()
for (const slot of slots) {
  let n = 0
  for (const e of events) {
    if (isRawEventForSlot(e, slot)) n++
  }
  rawCountsBySlot.set(slot.deviceCode ?? slot.logicalCode, n)
}

const auditRows = auditExcelOperationsAgainstSlCameraSlots(operations, events, slots, {
  preferCreatedAt: true,
  windowPaddingHours: 6,
})
const summaries = summarizeSlCameraAuditBySlot(auditRows, rawCountsBySlot)

console.error(`Segmentos CSV: ${csvPath}`)
console.error(`Eventos: ${sourceLabel} (${events.length} total)`)
console.error(`Modo: ${porDispositivo ? 'por dispositivo' : 'por punto S0–S7'} | slots=${slots.length}`)
console.error('')
console.error(formatSlCameraAuditSummaryLog(summaries))
console.error('')
console.error(
  'Lectura: crudo_ventana = ops Excel con lectura en ventana ±6h; pipeline = punto lógico en scatter merge; crudo_si_pipeline_no = fuga tipo S1.'
)

const flagged = auditRows.filter(
  (r) => r.gapClass === 'raw_no_pipeline' || r.gapClass === 'raw_outside_window_only'
)
console.log(slCameraAuditToCsv(todasFilas ? auditRows : flagged.length ? flagged : auditRows))
