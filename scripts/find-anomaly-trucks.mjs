/**
 * Búsqueda rápida de camiones anómalos en JSON de eventos Truckflow.
 * Uso: node scripts/find-anomaly-trucks.mjs [ruta-json]
 */
import { readFileSync } from 'fs'
import { pathToFileURL } from 'url'
import { resolve } from 'path'

const jsonPath =
  process.argv[2] ||
  resolve('public/mock-data/realdata/journey-events_2026-05-04_2026-05-10.json')

const root = resolve(import.meta.dirname, '..')
const pipelineUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts')
).href

const { runEtlTransform } = await import(pipelineUrl)

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  if (!lines.length) return []
  const rows = []
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
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i])
    const row = {}
    header.forEach((h, j) => {
      row[h] = cols[j] ?? ''
    })
    rows.push(row)
  }
  return rows
}

function loadEvents(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  const arr = Array.isArray(raw) ? raw : raw.value ?? raw.events ?? []
  return arr.filter((e) => e && e.journeyUid)
}

const events = loadEvents(jsonPath)
const plateByJourney = new Map()
for (const e of events) {
  const uid = String(e.journeyUid).split('__cycle')[0]
  if (!plateByJourney.has(uid) && e.truckPlate) plateByJourney.set(uid, e.truckPlate)
}
console.log(`Eventos cargados: ${events.length} desde ${jsonPath}`)

const out = await runEtlTransform({
  events,
  alerts: [],
  mergeWindowHours: 4,
  loadedEventFilesCount: 1,
  loadedAlertFilesCount: 0,
})

const parsed = parseCsv(out.csv.final_circuits || '')
const debug = parseCsv(out.csv.debug_matrix_classification || '')

console.log(`\nCircuitos finales: ${parsed.length}`)
console.log(`Stats comité:`, {
  committee_completos: out.stats.executive?.committee_completos,
  committee_anomalias: out.stats.executive?.committee_anomalias,
  anomalos: out.stats.executive?.anomalos,
  incompletos_revision: out.stats.coherence?.final_incompletos_revision,
})

const isAnomaly = (r) =>
  r.committee_group === 'ANOMALIAS' ||
  r.executive_status === 'ANOMALO' ||
  r.matrix_final_status === 'ANOMALO' ||
  r.final_status === 'incompleto_revision'

const anomalies = parsed.filter(isAnomaly)
const completeAnomalies = anomalies.filter(
  (r) => r.has_operational_entry === 'true' && r.has_operational_exit === 'true'
)
const noRespeta = anomalies.filter(
  (r) =>
    r.executive_reason === 'NO_RESPETA_SECUENCIA' ||
    String(r.committee_reason || '').includes('NO_RESPETA_SECUENCIA') ||
    String(r.matrix_reason || '').includes('NO_RESPETA_SECUENCIA')
)

const groupCounts = {}
for (const r of parsed) {
  const g = r.committee_group || '(vacío)'
  groupCounts[g] = (groupCounts[g] || 0) + 1
}
console.log('committee_group:', groupCounts)

console.log(`ANOMALIAS (filtro amplio): ${anomalies.length}`)
console.log(`Completas ingreso+egreso: ${completeAnomalies.length}`)
console.log(`NO_RESPETA_SECUENCIA: ${noRespeta.length}`)

const score = (r) => {
  let s = 0
  if (r.has_operational_entry === 'true') s += 3
  if (r.has_operational_exit === 'true') s += 3
  if (r.executive_status === 'ANOMALO') s += 5
  if (String(r.committee_reason || '').includes('NO_RESPETA')) s += 4
  s += Math.min(Number(r.event_count_front || 0), 10)
  return s
}

const ranked = [...anomalies].sort((a, b) => score(b) - score(a))
const pick = ranked[0]

function plateOf(r) {
  const uid = String(r.journey_uid || '').split('__cycle')[0]
  return String(r.truck_plate || r.normalized_plate || plateByJourney.get(uid) || '').trim()
}

const wrongRoute = parsed.filter((r) => {
  if (r.committee_group !== 'ANOMALIAS') return false
  if (r.has_operational_entry !== 'true' || r.has_operational_exit !== 'true') return false
  const seq = String(r.logical_sequence_front || '')
  const loops = (seq.match(/INGRESO/g) || []).length > 1
  const noResp =
    r.executive_reason === 'NO_RESPETA_SECUENCIA' ||
    String(r.committee_reason || '').includes('NO_RESPETA_SECUENCIA')
  const wrongOrder = r.sequence_respected === 'false' && r.executive_circuit_code !== 'SIN_PUNTO'
  return noResp || loops || wrongOrder
})

console.log(`\nRecorridos equivocados (ingreso+egreso): ${wrongRoute.length}`)
wrongRoute.slice(0, 12).forEach((r, i) => {
  console.log(
    `${i + 1}. ${plateOf(r) || '(sin patente)'} | ${r.executive_circuit_code} | ${r.committee_reason || r.executive_reason} | ${r.logical_sequence_front}`
  )
})

const withPlate = wrongRoute.filter((r) => plateOf(r))
if (withPlate.length) {
  console.log(`\nCon patente identificada: ${withPlate.length}`)
  withPlate.slice(0, 5).forEach((r, i) => {
    console.log(`${i + 1}. ${plateOf(r)} | uid=${r.journey_uid} | ${r.logical_sequence_front}`)
  })
}

if (pick) {
  console.log('\n=== CANDIDATO PARA COMITÉ ===')
  console.log({
    patente: plateOf(pick) || '(sin patente)',
    journey_uid: pick.journey_uid,
    circuito: pick.executive_circuit_code,
    comité: pick.committee_group,
    motivo: pick.committee_reason || pick.executive_reason || pick.matrix_reason,
    estado: pick.executive_status,
    ingreso: pick.has_operational_entry,
    egreso: pick.has_operational_exit,
    eventos: pick.event_count_front,
    secuencia: pick.logical_sequence_front,
    secuencia_respetada: pick.sequence_respected,
  })
} else {
  console.log('\nSin anomalías en este archivo.')
}

console.log('\n--- Top 10 candidatos ---')
ranked.slice(0, 10).forEach((r, i) => {
  console.log(
    `${i + 1}. ${r.truck_plate} | ${r.executive_circuit_code} | ${r.committee_group} | ${r.committee_reason || r.executive_reason} | in=${r.has_operational_entry} out=${r.has_operational_exit} | ${(r.logical_sequence_front || '').slice(0, 70)}`
  )
})

if (debug.length) {
  const dbgAnom = debug.filter(
    (r) => r.committee_group === 'ANOMALIAS' || r.executive_status === 'ANOMALO'
  )
  console.log(`\ndebug_matrix ANOMALIAS: ${dbgAnom.length}`)
  if (dbgAnom[0]) {
    console.log('debug sample:', {
      plate: dbgAnom[0].plate,
      circuit: dbgAnom[0].executive_circuit_code,
      detected: dbgAnom[0].detected_sequence,
      reason: dbgAnom[0].committee_reason,
    })
  }
}
