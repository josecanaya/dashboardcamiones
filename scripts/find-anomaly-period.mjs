/**
 * Búsqueda exhaustiva de anomalías Truckflow en un período.
 * Uso: npx tsx scripts/find-anomaly-period.mjs [start] [end]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { pathToFileURL } from 'url'
import { resolve, dirname } from 'path'

const startDate = process.argv[2] || '2026-05-29'
const endDate = process.argv[3] || '2026-06-02'
const API_BASE = process.env.TRUCKFLOW_EXPORT_API_BASE?.trim() || 'http://138.36.237.33:8090'

const root = resolve(import.meta.dirname, '..')
const pipelineUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts')
).href
const rearDevicesUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/etlRearDevices.ts')
).href
const { isEtlRearCameraDevice } = await import(rearDevicesUrl)

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

async function fetchEvents(start, end) {
  const url = `${API_BASE}/journey-event/list?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`
  console.log(`Fetching: ${url}`)
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const payload = await res.json()
  const arr = Array.isArray(payload) ? payload : payload.value ?? payload.events ?? []
  return arr.filter((e) => e && e.journeyUid)
}

async function fetchAlerts(start, end) {
  const url = `${API_BASE}/alert/list?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`
  console.log(`Fetching alerts: ${url}`)
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return []
    const payload = await res.json()
    return Array.isArray(payload) ? payload : payload.value ?? payload.alerts ?? []
  } catch {
    return []
  }
}

function plateOf(r, plateByJourney) {
  const uid = String(r.journey_uid || '').split('__cycle')[0]
  return String(r.truck_plate || r.normalized_plate || plateByJourney.get(uid) || '').trim()
}

function hasLogical(seq, code) {
  return String(seq).split('>').includes(code)
}

function missingBalanzaPattern(seq) {
  const s = String(seq)
  // Calada/operación sin balanza ingreso ni egreso
  if (hasLogical(s, 'CALADA') && !hasLogical(s, 'BALANZA_INGRESO') && !hasLogical(s, 'BALANZA_EGRESO')) {
    return 'calada_sin_balanza'
  }
  // Ingreso+egreso Ricardone sin pasar balanza (recepción típica)
  if (
    hasLogical(s, 'INGRESO') &&
    (hasLogical(s, 'EGRESO') || hasLogical(s, 'PREINGRESO')) &&
    !hasLogical(s, 'BALANZA_INGRESO') &&
    !hasLogical(s, 'BALANZA_EGRESO') &&
    !hasLogical(s, 'SL_')
  ) {
    return 'ric_sin_balanza'
  }
  // Balanza egreso sin balanza ingreso
  if (hasLogical(s, 'BALANZA_EGRESO') && !hasLogical(s, 'BALANZA_INGRESO')) {
    return 'egreso_balanza_sin_ingreso'
  }
  // Volcable/celda sin balanza
  if (
    (hasLogical(s, 'VOLCABLE') || hasLogical(s, 'CELDA16_DESCARGA') || hasLogical(s, 'CELDA16_CARGA')) &&
    !hasLogical(s, 'BALANZA_INGRESO')
  ) {
    return 'descarga_sin_balanza_ingreso'
  }
  return ''
}

const events = await fetchEvents(startDate, endDate)
const alerts = await fetchAlerts(startDate, endDate)

const cacheDir = resolve(root, 'data', 'truckflow', '_search_cache')
mkdirSync(cacheDir, { recursive: true })
const cachePath = resolve(cacheDir, `events_${startDate}_${endDate}.json`)
writeFileSync(cachePath, JSON.stringify(events, null, 2))
console.log(`Eventos: ${events.length} | Alertas: ${alerts.length} | cache: ${cachePath}`)

const plateByJourney = new Map()
for (const e of events) {
  const uid = String(e.journeyUid).split('__cycle')[0]
  if (!plateByJourney.has(uid) && e.truckPlate) plateByJourney.set(uid, e.truckPlate)
}

const { runEtlTransform } = await import(pipelineUrl)
const out = await runEtlTransform({
  events,
  alerts,
  mergeWindowHours: 4,
  loadedEventFilesCount: 1,
  loadedAlertFilesCount: alerts.length ? 1 : 0,
})

const parsed = parseCsv(out.csv.final_circuits || '')
const debug = parseCsv(out.csv.debug_matrix_classification || '')

console.log('\n=== RESUMEN PERÍODO ===')
console.log({
  circuitos: parsed.length,
  committee_completos: parsed.filter((r) => r.committee_group === 'COMPLETOS').length,
  committee_anomalias: parsed.filter((r) => r.committee_group === 'ANOMALIAS').length,
  committee_variaciones: parsed.filter((r) => r.committee_group === 'VARIACIONES_OPERATIVAS').length,
  executive_anomalo: parsed.filter((r) => r.executive_status === 'ANOMALO').length,
  matrix_anomalo: parsed.filter((r) => r.matrix_final_status === 'ANOMALO').length,
  no_respeta: parsed.filter(
    (r) =>
      r.executive_reason === 'NO_RESPETA_SECUENCIA' ||
      String(r.committee_reason || '').includes('NO_RESPETA') ||
      String(r.matrix_reason || '').includes('NO_RESPETA')
  ).length,
  incompleto_revision: parsed.filter((r) => r.final_status === 'incompleto_revision').length,
})

const candidates = []

for (const r of parsed) {
  const seq = r.logical_sequence_front || ''
  const plate = plateOf(r, plateByJourney)
  const balanzaMiss = missingBalanzaPattern(seq)
  const isAnom =
    r.committee_group === 'ANOMALIAS' ||
    r.executive_status === 'ANOMALO' ||
    r.matrix_final_status === 'ANOMALO' ||
    r.sequence_respected === 'false'
  const inout = r.has_operational_entry === 'true' && r.has_operational_exit === 'true'

  let score = 0
  const tags = []
  if (balanzaMiss) {
    score += 10
    tags.push(balanzaMiss)
  }
  if (String(r.committee_reason || '').includes('NO_RESPETA')) {
    score += 12
    tags.push('NO_RESPETA')
  }
  if (r.executive_status === 'ANOMALO') {
    score += 8
    tags.push('ANOMALO')
  }
  if (r.committee_group === 'ANOMALIAS') {
    score += 6
    tags.push('ANOMALIAS')
  }
  if (inout) {
    score += 4
    tags.push('completo_in_out')
  }
  if (r.sequence_respected === 'false') {
    score += 5
    tags.push('secuencia_false')
  }
  if ((seq.match(/INGRESO/g) || []).length > 1) {
    score += 7
    tags.push('loop_ingreso')
  }
  if (hasLogical(seq, 'SL_INGRESO') && hasLogical(seq, 'CALADA')) {
    score += 6
    tags.push('mezcla_ric_sl')
  }

  if (score >= 8) {
    candidates.push({ ...r, plate, tags, score, balanzaMiss })
  }
}

candidates.sort((a, b) => b.score - a.score)

console.log(`\n=== CANDIDATOS (${candidates.length}) — top 20 ===`)
candidates.slice(0, 20).forEach((r, i) => {
  console.log(
    `${i + 1}. [${r.score}] ${r.plate || '(sin patente)'} | ${r.executive_circuit_code} | ${r.committee_group} | ${r.committee_reason || r.executive_reason || r.matrix_reason} | tags=${r.tags.join(',')} | ${r.logical_sequence_front}`
  )
})

// Alertas INVALID_ROUTE — solo cámaras frontales (excluir patente/cámara trasera)
const routeAlerts = alerts.filter((a) => {
  const dev = String(a.deviceCode ?? a.payload?.deviceCode ?? '').trim()
  if (isEtlRearCameraDevice(dev)) return false
  const code = String(a.alertCode ?? a.code ?? a.type ?? '').toUpperCase()
  const msg = String(a.message ?? a.description ?? '').toUpperCase()
  return code.includes('INVALID') || code.includes('ROUTE')
})
const rearAlertCount = alerts.filter((a) =>
  isEtlRearCameraDevice(String(a.deviceCode ?? a.payload?.deviceCode ?? '').trim())
).length
console.log(`\n=== ALERTAS ruta inválida — solo frontal (${routeAlerts.length}; traseras excluidas: ${rearAlertCount}) ===`)
routeAlerts.slice(0, 15).forEach((a, i) => {
  console.log(
    `${i + 1}. ${a.truckPlate || a.plate || '?'} | ${a.alertCode || a.code || a.type} | dev=${a.deviceCode || '?'} | journey=${a.journeyUid || '?'} | ${String(a.message || a.description || '').slice(0, 100)}`
  )
})

if (candidates[0]) {
  const best = candidates[0]
  console.log('\n=== MEJOR CASO PARA COMITÉ ===')
  console.log(JSON.stringify({
    patente: best.plate,
    journey_uid: best.journey_uid,
    periodo: `${startDate} → ${endDate}`,
    circuito: best.executive_circuit_code,
    comite: best.committee_group,
    motivo: best.committee_reason || best.executive_reason || best.matrix_reason,
    estado: best.executive_status,
    ingreso: best.has_operational_entry,
    egreso: best.has_operational_exit,
    secuencia: best.logical_sequence_front,
    secuencia_respetada: best.sequence_respected,
    patron_balanza: best.balanzaMiss || '—',
    tags: best.tags,
  }, null, 2))
}

// Export CSV resumido
const exportRows = candidates.slice(0, 50).map((r) => ({
  plate: r.plate,
  journey_uid: r.journey_uid,
  executive_circuit_code: r.executive_circuit_code,
  committee_group: r.committee_group,
  committee_reason: r.committee_reason,
  executive_reason: r.executive_reason,
  logical_sequence: r.logical_sequence_front,
  balanza_pattern: r.balanzaMiss,
  score: r.score,
  tags: r.tags.join('|'),
}))
const exportPath = resolve(cacheDir, `anomalies_${startDate}_${endDate}.json`)
writeFileSync(exportPath, JSON.stringify(exportRows, null, 2))
console.log(`\nExport: ${exportPath}`)
