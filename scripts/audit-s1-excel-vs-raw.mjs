/**
 * Cruza movimientos Excel con eventos Truckflow crudos (S1 = SLZBalIngFte).
 *
 * Uso:
 *   npx tsx scripts/audit-s1-excel-vs-raw.mjs <scatter.csv> <eventos.json|eventos.csv|carpeta-truckflow> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [ops.csv]
 *
 * Carpeta truckflow: subcarpetas YYYY-MM-DD con event-list.json (export día a día).
 * Ejemplo período 04–11 jun 2026:
 *   npx tsx scripts/audit-s1-excel-vs-raw.mjs RUTA/excel_operation_segments_for_scatter.csv data/truckflow --from 2026-06-04 --to 2026-06-11
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'
import { pathToFileURL } from 'url'

const root = resolve(import.meta.dirname, '..')
const modUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/auditSlS1ExcelCoverage.ts')
).href

const {
  auditExcelOperationsAgainstRawS1,
  summarizeSlS1Audit,
  slS1AuditToCsv,
  isRawS1Event,
} = await import(modUrl)

const R7_SL_CIRCUITS = new Set(['R7', 'SL1', 'R26', 'R27'])

function printUsage() {
  console.error(`
Uso:
  npx tsx scripts/audit-s1-excel-vs-raw.mjs <excel_operation_segments_for_scatter.csv> <eventos|data/truckflow> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [excel_operations_with_truckflow.csv]

Eventos:
  - Un JSON (API .value[], .records[] de event-list.json) o CSV clean_events
  - Carpeta data/truckflow con subcarpetas por día y event-list.json

Ejemplo (04–11 jun 2026):
  npx tsx scripts/audit-s1-excel-vs-raw.mjs RUTA/excel_operation_segments_for_scatter.csv data/truckflow --from 2026-06-04 --to 2026-06-11 > RUTA/audit-s1.csv
`)
}

function parseCli(argv) {
  let fromDay = ''
  let toDay = ''
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
    positional.push(a)
  }
  return { fromDay, toDay, positional }
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
  throw new Error('JSON: array, .value[], .events[] o .records[] (event-list.json)')
}

function loadEventsFromFile(path) {
  const lower = path.toLowerCase()
  if (lower.endsWith('.csv')) {
    const rows = parseCsv(readFileSync(path, 'utf8'))
    return rows.map(csvRowToJourneyEvent)
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  return loadJsonEventArray(raw)
}

function loadEventsFromTruckflowDir(dir, fromDay, toDay) {
  const fromMs = fromDay ? parseDayKey(fromDay) : Number.NaN
  const toMs = toDay ? parseDayKey(toDay) : Number.NaN
  const entries = readdirSync(dir, { withFileTypes: true })
  const dayDirs = entries
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

  if (!dayDirs.length) {
    throw new Error(
      `En ${dir} no hay carpetas YYYY-MM-DD` +
        (fromDay || toDay ? ` entre ${fromDay || '…'} y ${toDay || '…'}` : '')
    )
  }

  const all = []
  for (const day of dayDirs) {
    const file = join(dir, day, 'event-list.json')
    if (!existsSync(file)) {
      console.error(`  (omitido ${day}: sin event-list.json)`)
      continue
    }
    const batch = loadEventsFromFile(file)
    console.error(`  ${day}: ${batch.length} eventos`)
    all.push(...batch)
  }
  return { events: all, dayDirs }
}

function loadEventsInput(path, fromDay, toDay) {
  let st
  try {
    st = statSync(path)
  } catch {
    throw new Error(`No se puede leer: ${path}`)
  }
  if (st.isDirectory()) {
    if (!fromDay && !toDay) {
      console.error(
        'Aviso: carpeta truckflow sin --from/--to; se cargan TODAS las fechas (puede ser lento).'
      )
    }
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
  if (!path) {
    console.error(`Falta ruta de ${label}.`)
    printUsage()
    process.exit(1)
  }
  if (!existsSync(path)) {
    console.error(`No existe el archivo (${label}):`)
    console.error(`  ${path}`)
    if (/\\RUTA\\|\/RUTA\//i.test(path) || path.includes('RUTA\\')) {
      console.error('')
      console.error(
        'Parece que copiaste el ejemplo literal "RUTA\\...". Reemplazalo por la carpeta real (Downloads, export ETL, etc.).'
      )
    }
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

const { fromDay, toDay, positional } = parseCli(process.argv.slice(2))
const csvPath = resolveInputPath(positional[0])
const eventsPath = resolveInputPath(positional[1])
const opsPath = resolveInputPath(positional[2])

if (!csvPath || !eventsPath) {
  printUsage()
  process.exit(1)
}

assertReadableFile(csvPath, 'CSV de segmentos Excel-first')
if (!existsSync(eventsPath)) {
  console.error(`No existe: ${eventsPath}`)
  process.exit(1)
}
if (opsPath) assertReadableFile(opsPath, 'excel_operations_with_truckflow (opcional)')

const rows = parseCsv(readFileSync(csvPath, 'utf8'))
const opsTimes = opsPath ? indexOpsExcelTimes(parseCsv(readFileSync(opsPath, 'utf8'))) : undefined
const operations = groupOperations(rows, opsTimes)
if (!operations.length) {
  console.error(
    'El CSV no tiene filas R7/SL1/R26/R27 con external_operation_id. ¿Es excel_operation_segments_for_scatter del período correcto?'
  )
  process.exit(1)
}

console.error('Cargando eventos Truckflow…')
const { events, sourceLabel } = loadEventsInput(eventsPath, fromDay, toDay)
const rawS1Total = events.filter((e) => isRawS1Event(e)).length
const auditRows = auditExcelOperationsAgainstRawS1(operations, events, {
  preferCreatedAt: true,
  windowPaddingHours: 6,
})
const summary = summarizeSlS1Audit(auditRows)

console.error('=== Auditoría S1: Excel vs Truckflow crudo ===')
console.error(`Segmentos CSV: ${csvPath}`)
console.error(`Eventos: ${sourceLabel} (${events.length} total, ${rawS1Total} lecturas S1 crudas)`)
console.error(`Operaciones R7/SL en CSV: ${summary.operations}`)
console.error(`Con S1 crudo en ventana Excel (±6h): ${summary.rawS1InWindow}`)
console.error(`Con segmento pipeline S1: ${summary.pipelineS1Segment}`)
console.error(`Con tramo SL_INGRESO→SL_BALANZA_INGRESO: ${summary.pipelineSlIngresoBalanza}`)
console.error(`CRUDO SÍ / PIPELINE NO (filtro merge): ${summary.rawYesPipelineNo}`)
console.error(
  `CRUDO SÍ + segmento S1 pero SIN tramo S0→S1: ${summary.rawYesNoSlIngresoBalanzaLeg}`
)
console.error(`S1 crudo solo fuera de ventana Excel: ${summary.rawOutsideWindowOnly}`)
console.error('')
console.error(
  'Si raw_s1_in_window >> pipeline_sl_ingreso_balanza, el cuello es merge/journey match, no cámara.'
)

const flagged = auditRows.filter(
  (r) => r.gapClass === 'raw_s1_no_pipeline' || r.gapClass === 'raw_outside_window_only'
)
console.log(slS1AuditToCsv(flagged.length ? flagged : auditRows))
