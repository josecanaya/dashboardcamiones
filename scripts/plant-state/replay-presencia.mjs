// Mide la regla de presencia de En vivo contra días guardados: cuántos camiones da por adentro la regla
// anterior (3 h sin egreso) y cuántos la nueva, y cuántos de los que la nueva saca estaban de verdad.
//
//   node scripts/plant-state/replay-presencia.mjs 2026-10-27 [2026-10-26 …]
//
// Cada 15 min de 06:00 a 22:00 se arma la foto con las lecturas hasta ese momento (día anterior incluido).
// «Sacado por error» = la regla nueva lo dio por ido y su mismo journey se volvió a leer después en esa
// planta: seguía adentro.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEventLiveInstantMs, parseLiveMillis } from '../../server/plantState/liveEventTime.mjs'
import { getSectorProfile, resolveCanonicalSectorForLiveFeed } from '../../server/plantState/sectorProfiles.mjs'
import { buildSightings, isJourneyOpen, rowPlate } from '../../server/plantState/reducer.mjs'
// Solo para rotular el motivo (el corte por una lectura sola se descartó en el reductor).
const SINGLE_READ_MAX_IDLE_MS = 90 * 60_000

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const STEP_MS = 15 * 60_000

const readDay = (day) => {
  const f = path.join(ROOT, 'data', 'truckflow', day, 'event-list.json')
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).records ?? [] : []
}
const prevDay = (day) => new Date(Date.parse(`${day}T12:00:00Z`) - 86400e3).toISOString().slice(0, 10)

function reason(withSector, nowMs, ctx) {
  const last = withSector[withSector.length - 1]
  if (!isJourneyOpen(withSector, nowMs, { legacy: true })) return 'cerrado_antes'
  if (!isJourneyOpen(withSector, nowMs, { ...ctx, sightings: null })) {
    return withSector.length === 1 && getSectorProfile(last.sector)?.type !== 'gate' && nowMs - last.t >= SINGLE_READ_MAX_IDLE_MS ? 'una_lectura' : 'limite_sector'
  }
  return ctx.sightings.seenAfter(ctx.key, ctx.plate, last.t) ?? 'abierto'
}

const days = process.argv.slice(2)
if (!days.length) { console.error('uso: replay-presencia.mjs <día> [día…]'); process.exit(1) }

for (const day of days) {
  const rows = []
  for (const e of [...readDay(prevDay(day)), ...readDay(day)]) {
    const t = getEventLiveInstantMs(e)
    const sector = resolveCanonicalSectorForLiveFeed(e.sectorCode, String(e.deviceCode ?? '').trim())
    const profile = getSectorProfile(sector)
    if (!Number.isFinite(t) || !profile || !e.journeyUid) continue
    rows.push({ e, t, sector, device: String(e.deviceCode ?? '').trim(), site: profile.site })
  }
  rows.sort((a, b) => a.t - b.t)
  const start = parseLiveMillis(`${day}T06:00:00-03:00`)
  const end = parseLiveMillis(`${day}T22:00:00-03:00`)

  for (const site of ['ricardone', 'san_lorenzo']) {
    const totals = { antes: 0, ahora: 0, una_lectura: 0, limite_sector: 0, otra_visita: 0, otra_planta: 0 }
    const wrong = { una_lectura: 0, limite_sector: 0, otra_visita: 0, otra_planta: 0 }
    const wrongExamples = []
    let snaps = 0
    for (let now = start; now <= end; now += STEP_MS) {
      snaps++
      const byJourney = new Map()
      const otherSite = []
      for (const r of rows) {
        if (r.t > now) break
        if (r.site !== site) { otherSite.push({ plate: rowPlate(r.e), t: r.t }); continue }
        if (!byJourney.has(r.e.journeyUid)) byJourney.set(r.e.journeyUid, [])
        byJourney.get(r.e.journeyUid).push(r)
      }
      const journeyLast = [...byJourney].map(([key, list]) => ({ key, plate: rowPlate(list[list.length - 1].e), lastT: list[list.length - 1].t }))
      const sightings = buildSightings(journeyLast, otherSite)
      for (const [key, list] of byJourney) {
        const last = list[list.length - 1]
        const why = reason(list, now, { key, plate: rowPlate(last.e), sightings })
        if (why === 'cerrado_antes') continue
        totals.antes++
        if (why === 'abierto') { totals.ahora++; continue }
        totals[why]++
        // ¿Seguía adentro? Su mismo journey se lee de nuevo en esta planta después de la foto.
        const later = rows.find((r) => r.t > now && r.site === site && r.e.journeyUid === key)
        if (later) {
          wrong[why]++
          if (wrongExamples.length < 6) wrongExamples.push(`${rowPlate(last.e)} ${why} en ${last.sector} (sin lectura ${Math.round((now - last.t) / 60000)} min, volvió a leerse ${Math.round((later.t - now) / 60000)} min después)`)
        }
      }
    }
    const avg = (n) => (n / snaps).toFixed(1)
    const removed = totals.antes - totals.ahora
    const wrongTotal = Object.values(wrong).reduce((a, b) => a + b, 0)
    console.log(`\n${day} · ${site} · ${snaps} fotos (06–22 h, cada 15 min)`)
    console.log(`  camiones adentro por foto: antes ${avg(totals.antes)} → ahora ${avg(totals.ahora)}  (saca ${avg(removed)} por foto)`)
    for (const k of ['una_lectura', 'limite_sector', 'otra_visita', 'otra_planta']) {
      console.log(`    ${k.padEnd(14)} saca ${avg(totals[k]).padStart(5)} por foto · por error ${wrong[k]} de ${totals[k]}${totals[k] ? ` (${((100 * wrong[k]) / totals[k]).toFixed(1)} %)` : ''}`)
    }
    console.log(`  sacados por error: ${wrongTotal} de ${removed} (${removed ? ((100 * wrongTotal) / removed).toFixed(1) : 0} %)`)
    for (const ex of wrongExamples) console.log(`    · ${ex}`)
  }
}
