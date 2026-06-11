/**
 * Camiones con salida San Lorenzo (egreso o balanza salida) y vuelta a Ricardone
 * (ingreso / preingreso / calada) en menos de N minutos (default 40).
 *
 * Uso:
 *   npx tsx scripts/find-sl-exit-ric-return.mjs [ruta-json-o-startDate] [endDate|minutos]
 *   npx tsx scripts/find-sl-exit-ric-return.mjs 2026-05-29 2026-06-02
 *   npx tsx scripts/find-sl-exit-ric-return.mjs public/mock-data/realdata/journey-events_2026-05-04_2026-05-10.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { pathToFileURL } from 'url'
import { resolve, dirname } from 'path'

const root = resolve(import.meta.dirname, '..')
const auditUrl = pathToFileURL(resolve(root, 'src/services/realPlateAudit.ts')).href
const dsUrl = pathToFileURL(resolve(root, 'src/services/realJourneyEventsDataSource.ts')).href
const { detectSanLorenzoEgressToRicardoneReturnFromEvents, SL_EGRESS_RIC_RETURN_WINDOW_MS_DEFAULT } =
  await import(auditUrl)
const { parsePayloadToJourneyEvents } = await import(dsUrl)

const API_BASE = process.env.TRUCKFLOW_EXPORT_API_BASE?.trim() || 'http://138.36.237.33:8090'
const DEFAULT_JSON = resolve(root, 'public/mock-data/realdata/journey-events_2026-05-04_2026-05-10.json')

const arg1 = process.argv[2]
const arg2 = process.argv[3]
const arg3 = process.argv[4]

function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''))
}

async function loadEventsFromFile(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  return parsePayloadToJourneyEvents(raw)
}

async function fetchEvents(start, end) {
  const url = `${API_BASE}/journey-event/list?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`
  console.log(`Fetching: ${url}`)
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const payload = await res.json()
  return parsePayloadToJourneyEvents(payload)
}

function fmtLocal(iso) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
}

let events = []
let label = ''
let windowMs = SL_EGRESS_RIC_RETURN_WINDOW_MS_DEFAULT

if (arg1 && (arg1.endsWith('.json') || arg1.includes('journey-events'))) {
  const file = resolve(arg1)
  events = await loadEventsFromFile(file)
  label = file
  if (arg2 && /^\d+$/.test(arg2)) windowMs = Number(arg2) * 60 * 1000
} else if (isDate(arg1)) {
  const end = isDate(arg2) ? arg2 : arg1
  const start = arg1
  events = await fetchEvents(start, end)
  label = `${start}..${end}`
  const minArg = isDate(arg2) ? arg3 : arg2
  if (minArg && /^\d+$/.test(minArg)) windowMs = Number(minArg) * 60 * 1000
} else {
  events = await loadEventsFromFile(arg1 ? resolve(arg1) : DEFAULT_JSON)
  label = arg1 ? resolve(arg1) : DEFAULT_JSON
  if (arg2 && /^\d+$/.test(arg2)) windowMs = Number(arg2) * 60 * 1000
}

console.log(`Eventos: ${events.length} | Fuente: ${label}`)
console.log(`Ventana máxima SL salida → Ric ingreso/preingreso/calada: ${(windowMs / 60000).toFixed(0)} min\n`)

const hits = detectSanLorenzoEgressToRicardoneReturnFromEvents(events, windowMs)
console.log(`Casos detectados: ${hits.length}`)

const byDay = {}
for (const h of hits) {
  byDay[h.day] = (byDay[h.day] || 0) + 1
}
console.log('Por día:', byDay)

console.log('\n--- Detalle (patente | día | salida SL | vuelta Ric | Δ min) ---')
for (const h of hits) {
  const dm = (h.deltaMs / 60000).toFixed(1)
  console.log(
    `${h.plate} | ${h.day} | ${fmtLocal(h.slExitAt)} (${h.slExitLogical}) → ${fmtLocal(h.ricReturnAt)} (${h.ricReturnLogical}) | ${dm} min`
  )
  console.log(`   journeys: exit=${h.journeyUidAtExit} return=${h.journeyUidAtReturn}`)
}

const outDir = resolve(root, 'scripts/output')
mkdirSync(outDir, { recursive: true })
const stamp = label.replace(/[^\w.-]+/g, '_').slice(0, 80)
const outPath = resolve(outDir, `sl-exit-ric-return_${stamp}.json`)
writeFileSync(outPath, JSON.stringify(hits, null, 2), 'utf8')
console.log(`\nJSON guardado: ${outPath}`)
