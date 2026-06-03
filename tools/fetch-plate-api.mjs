const plate = process.argv[2] || 'AE785CS'
const start = process.argv[3] || '2026-05-01T00:00:00'
const end = process.argv[4] || '2026-06-07T23:59:59'
const base = process.env.TRUCKFLOW_EXPORT_API_BASE || 'http://138.36.237.33:8090'
const url = `${base.replace(/\/$/, '')}/journey-event/list?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&plate=${encodeURIComponent(plate)}`

const res = await fetch(url, { headers: { Accept: 'application/json' } })
if (!res.ok) {
  console.error('HTTP', res.status, await res.text())
  process.exit(1)
}
const payload = await res.json()
const arr = Array.isArray(payload) ? payload : payload.value ?? payload.data ?? payload.events ?? []
const byUid = new Map()
for (const e of arr) {
  const u = String(e.journeyUid ?? e.journeyUuid ?? '').trim()
  if (!byUid.has(u)) byUid.set(u, [])
  byUid.get(u).push(e)
}

const out = {
  query: { plate, start, end, url },
  totalEvents: arr.length,
  journeyUidCount: byUid.size,
  journeys: [],
}

for (const [uid, ev] of byUid) {
  ev.sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)))
  const days = [...new Set(ev.map((x) => String(x.occurredAt).slice(0, 10)))]
  out.journeys.push({
    journeyUid: uid,
    days: days.sort(),
    eventCount: ev.length,
    events: ev.map((x) => ({
      id: x.id,
      sequenceNumber: x.sequenceNumber,
      occurredAt: x.occurredAt,
      truckPlate: x.truckPlate,
      sectorCode: x.sectorCode,
      deviceCode: x.deviceCode,
      eventType: x.eventType,
    })),
  })
}

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', `audit-${plate}-api.json`)
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8')
console.log('Wrote', outPath)
console.log(JSON.stringify(out, null, 2))
