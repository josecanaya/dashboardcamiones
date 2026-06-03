import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const csvPath = path.join(__dirname, '..', 'powerbi-export', '12-16', 'raw_events_api (1).csv')

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      q = !q
      continue
    }
    if (c === ',' && !q) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

const text = fs.readFileSync(csvPath, 'utf8')
const lines = text.split(/\r?\n/).filter(Boolean)
const hdr = parseCsvLine(lines[0])

const byUid = new Map()
for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i])
  const row = Object.fromEntries(hdr.map((h, idx) => [h, (cols[idx] ?? '').replace(/^"|"$/g, '')]))
  const uid = String(row.journey_uid ?? row.journeyUid ?? row.journeyUuid ?? '').trim()
  const plate = String(row.truck_plate ?? row.truckPlate ?? row.plate ?? '').trim()
  const occ = String(row.occurred_at ?? row.occurredAt ?? '').trim()
  if (!uid) continue
  const day = occ.slice(0, 10)
  if (!byUid.has(uid)) {
    byUid.set(uid, { plates: new Set(), days: new Set(), events: [] })
  }
  const r = byUid.get(uid)
  r.plates.add(plate)
  r.days.add(day)
  r.events.push({
    id: row.id,
    sequenceNumber: row.sequenceNumber,
    occurredAt: occ,
    plate,
    sectorCode: row.sector_code ?? row.sectorCode,
    deviceCode: row.device_code ?? row.deviceCode,
  })
}

const multi = [...byUid.entries()]
  .filter(([, v]) => v.days.size > 1)
  .sort((a, b) => b[1].events.length - a[1].events.length)

console.log('=== Auditoría raw_events_api (export Truckflow API) ===')
console.log('Total journeyUid distintos:', byUid.size)
console.log('JourneyUid con eventos en 2+ días:', multi.length)

const ae785cs = [...byUid.entries()].filter(([, v]) => [...v.plates].includes('AE785CS'))
console.log('\n--- AE785CS (todos los UIDs) ---')
for (const [uid, v] of ae785cs) {
  v.events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  console.log(JSON.stringify({
    journeyUid: uid,
    days: [...v.days].sort(),
    eventCount: v.events.length,
    events: v.events,
  }, null, 2))
}

const crossDayPattern = []
for (const [uid, v] of byUid) {
  v.events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  for (let i = 1; i < v.events.length; i++) {
    const prev = v.events[i - 1]
    const next = v.events[i]
    const prevEgress = /RicB2Egreso|RicEgrCam/i.test(prev.deviceCode)
    const nextEntry = /RicIngCamFrente|RicPreIngInFr/i.test(next.deviceCode)
    if (!prevEgress || !nextEntry) continue
    const d1 = prev.occurredAt.slice(0, 10)
    const d2 = next.occurredAt.slice(0, 10)
    crossDayPattern.push({
      journeyUid: uid,
      plates: [...v.plates],
      day1: d1,
      day2: d2,
      sameDay: d1 === d2,
      gapHours: (new Date(next.occurredAt) - new Date(prev.occurredAt)) / 3_600_000,
      after: prev,
      before: next,
      totalEvents: v.events.length,
    })
  }
}

console.log('\n--- Mismo journeyUid: BALANZA_EGRESO → INGRESO (muestra API) ---')
console.log('Casos encontrados:', crossDayPattern.length)
console.log('Casos en días distintos:', crossDayPattern.filter((x) => !x.sameDay).length)
crossDayPattern
  .filter((x) => !x.sameDay)
  .slice(0, 3)
  .forEach((x) => console.log(JSON.stringify(x, null, 2)))

console.log('\n--- Top 8 journeyUid multi-día ---')
multi.slice(0, 8).forEach(([uid, v]) => {
  console.log({
    journeyUid: uid,
    plates: [...v.plates],
    days: [...v.days].sort(),
    events: v.events.length,
  })
})
