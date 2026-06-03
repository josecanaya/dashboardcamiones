/** Conteo journeyUid en JSON crudo Truckflow (misma lógica que src/services/truckflowRawJourneyStats.ts). */

export function rawJourneyUidFromRecord(row) {
  if (!row || typeof row !== 'object') return ''
  const r = row
  return String(r.journeyUid ?? r.journeyUuid ?? r.journey_uuid ?? '').trim()
}

export function countUniqueRawJourneyUids(records) {
  const set = new Set()
  for (const row of records) {
    const uid = rawJourneyUidFromRecord(row)
    if (uid) set.add(uid)
  }
  return set.size
}

function occurredAtLocalDayKey(occurredAt) {
  const s = String(occurredAt ?? '').trim()
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function countUniqueRawJourneyUidsByOccurredDay(records) {
  const byDay = new Map()
  for (const row of records) {
    if (!row || typeof row !== 'object') continue
    const uid = rawJourneyUidFromRecord(row)
    const occurred = String(row.occurredAt ?? row.occurred_at ?? '').trim()
    if (!uid || !occurred) continue
    const day = occurredAtLocalDayKey(occurred)
    if (!day) continue
    let set = byDay.get(day)
    if (!set) {
      set = new Set()
      byDay.set(day, set)
    }
    set.add(uid)
  }
  return [...byDay.entries()]
    .map(([day, set]) => ({ day, uniqueJourneyUids: set.size }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

export function buildApiJourneyDayStat(day, ev, al, eventFile, alertFile) {
  return {
    day,
    events: ev.length,
    alerts: al.length,
    uniqueJourneyUids: countUniqueRawJourneyUids(ev),
    uniqueAlertJourneyUids: countUniqueRawJourneyUids(al),
    eventFile,
    alertFile,
  }
}
