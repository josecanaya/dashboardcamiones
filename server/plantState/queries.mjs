/**
 * Consultas de sector y camiones sobre el buffer de Plant State.
 * Endpoints: /live/sectors/:code · /live/trucks · /live/trucks/:plate
 */

import { getEventLiveInstantMs, formatArgentinaIsoFromMs } from './liveEventTime.mjs'
import { isJourneyOpenAtSector, reducePlantState } from './reducer.mjs'
import { quarterOf } from './baselines.mjs'
import { resolveSectorStatus } from './status.mjs'
import {
  SECTOR_DEVICES,
  SECTOR_PROFILES,
  getSectorProfile,
  resolveCanonicalSectorForLiveFeed,
} from './sectorProfiles.mjs'
import {
  buildLogicalSequence,
  logicalLabel,
  matchCircuitByPrefix,
  provisionalSegmentCapMin,
  sectorToLogical,
} from './circuitPrefix.mjs'
import { PlantStateError } from './service.mjs'

const TWELVE_H_MS = 12 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const SERIES_HOURS = 3
const SERIES_STEP_MS = 10 * 60 * 1000

function round1(n) {
  if (n == null || !Number.isFinite(n)) return null
  return Math.round(n * 10) / 10
}

/**
 * Agrupa eventos en journeys abiertos (misma lógica que el reductor).
 * @param {object[]} events
 * @param {number} nowMs
 */
function collectOpenJourneys(events, nowMs) {
  /** @type {{ e: object, t: number, sector: string|null, device: string }[]} */
  const normalized = []
  for (const e of events || []) {
    const t = getEventLiveInstantMs(e)
    if (!Number.isFinite(t) || t > nowMs) continue
    const device = String(e.deviceCode ?? '').trim()
    const sector = resolveCanonicalSectorForLiveFeed(e.sectorCode, device)
    const profile = getSectorProfile(sector)
    normalized.push({
      e,
      t,
      sector: profile ? sector : null,
      device,
    })
  }

  /** @type {Map<string, typeof normalized>} */
  const byJourney = new Map()
  for (const row of normalized) {
    const uid = String(row.e.journeyUid ?? '').trim()
    let key = uid
    if (!key) {
      const plate = String(row.e.normalizedPlate || row.e.truckPlate || 'NOPLATE').trim() || 'NOPLATE'
      const bucket = Math.floor(row.t / TWELVE_H_MS)
      key = `${plate}#${bucket}`
    }
    const list = byJourney.get(key)
    if (list) list.push(row)
    else byJourney.set(key, [row])
  }

  /** @type {object[]} */
  const open = []
  for (const [journeyKey, list] of byJourney) {
    list.sort((a, b) => a.t - b.t || (a.e.sequenceNumber ?? 0) - (b.e.sequenceNumber ?? 0))
    const withSector = list.filter((r) => r.sector)
    if (!withSector.length) continue
    const last = withSector[withSector.length - 1]
    const lastProfile = getSectorProfile(last.sector)
    const idle = nowMs - last.t
    if (!isJourneyOpenAtSector(lastProfile, idle, last.device)) continue

    let enteredAt = last.t
    for (let i = withSector.length - 1; i >= 0; i--) {
      if (withSector[i].sector !== last.sector) break
      enteredAt = withSector[i].t
    }

    const plate = String(
      last.e.normalizedPlate || last.e.truckPlate || last.e.rawTruckPlate || ''
    )
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()

    const sectorSeq = withSector.map((r) => r.sector)
    const logicalSeq = buildLogicalSequence(sectorSeq)
    const match = matchCircuitByPrefix(logicalSeq)

    open.push({
      journeyKey,
      plate: plate || 'SIN_PATENTE',
      journeyUid: String(last.e.journeyUid ?? '').trim() || journeyKey,
      sectorCode: last.sector,
      enteredSectorAt: enteredAt,
      firstAt: withSector[0].t,
      lastAt: last.t,
      lastDevice: last.device,
      lastEvent: last.e,
      events: withSector,
      logicalSeq,
      match,
      dwellSectorMin: (nowMs - enteredAt) / 60000,
      dwellPlantMin: (nowMs - withSector[0].t) / 60000,
      minutesSinceLastDetection: (nowMs - last.t) / 60000,
    })
  }
  return open
}

/**
 * @param {object} truck
 * @param {object|null} baseline
 */
function truckStatus(truck, baseline) {
  const dwell = truck.dwellSectorMin
  const ref = baseline?.dwellP90Min
  if (ref != null && Number.isFinite(ref) && ref > 0) {
    if (dwell > 2 * ref) return 'critical'
    if (dwell > 1.5 * ref) return 'attention'
  }
  const type = getSectorProfile(truck.sectorCode)?.type ?? null
  const cap = provisionalSegmentCapMin(
    truck.logicalSeq[truck.logicalSeq.length - 1] ?? null,
    truck.match.nextExpectedPoint,
    type
  )
  if (cap != null && truck.minutesSinceLastDetection > cap) return 'critical'
  if (cap != null && truck.minutesSinceLastDetection > cap * 0.75) return 'attention'
  return 'normal'
}

/** @param {{ getEvents: (site: string) => Promise<object[]>, getBaselines: (site: string) => Promise<object> }} service */
export function createPlantStateQueries(service) {
  /**
   * @param {string} site
   * @param {string} sectorCode
   */
  async function getSectorDetail(site, sectorCode) {
    const code = String(sectorCode ?? '').trim()
    const profile = getSectorProfile(code)
    if (!profile) throw new PlantStateError('sector_unknown', 404, `sector desconocido: ${code}`)

    const events = await service.getEvents(site)
    const baselines = await service.getBaselines(site)
    const nowMs = Date.now()
    const snap = reducePlantState(events, nowMs, { site })
    const q = quarterOf(snap.at) || quarterOf(formatArgentinaIsoFromMs(nowMs))
    const edgeById = Object.fromEntries(snap.edges.map((e) => [e.id, e]))
    const rawSector = snap.sectors.find((s) => s.sectorCode === code)
    if (!rawSector) throw new PlantStateError('sector_unknown', 404, `sector desconocido: ${code}`)

    const bl = q && baselines?.[code]?.[q] ? baselines[code][q] : null
    const edge = edgeById[profile.edgeId] || null
    const sector = { ...rawSector, status: resolveSectorStatus(rawSector, bl, edge) }

    /** Serie presencia 3 h, punto cada 10 min. */
    const seriesPoints = Math.floor((SERIES_HOURS * 60) / 10)
    /** @type {{ at: string, present: number }[]} */
    const presenceSeries = []
    for (let i = seriesPoints; i >= 0; i--) {
      const t = nowMs - i * SERIES_STEP_MS
      const slice = reducePlantState(events, t, { site, skipDelta: true })
      const s = slice.sectors.find((x) => x.sectorCode === code)
      presenceSeries.push({
        at: formatArgentinaIsoFromMs(t),
        present: s?.present ?? 0,
      })
    }

    /** Cámaras del Edge con salud. */
    const edgeDevices = new Set()
    for (const [sc, p] of Object.entries(SECTOR_PROFILES)) {
      if (p.edgeId !== profile.edgeId) continue
      for (const d of SECTOR_DEVICES[sc] || []) edgeDevices.add(d)
    }

    /** @type {Map<string, { lastT: number, detections60: number }>} */
    const camStats = new Map()
    const windowStart = nowMs - HOUR_MS
    for (const e of events) {
      const device = String(e.deviceCode ?? '').trim()
      if (!edgeDevices.has(device)) continue
      const t = getEventLiveInstantMs(e)
      if (!Number.isFinite(t) || t > nowMs) continue
      let st = camStats.get(device)
      if (!st) {
        st = { lastT: t, detections60: 0 }
        camStats.set(device, st)
      }
      if (t > st.lastT) st.lastT = t
      if (t > windowStart) st.detections60 += 1
    }

    const cameras = [...edgeDevices].sort().map((deviceCode) => {
      const st = camStats.get(deviceCode)
      const lastEventAgeS =
        st && Number.isFinite(st.lastT) ? Math.round((nowMs - st.lastT) / 1000) : null
      let health = 'offline'
      if (st && st.detections60 > 0) health = 'ok'
      else if (st && lastEventAgeS != null && lastEventAgeS < 3600) health = 'stale'
      return {
        deviceCode,
        health,
        detections60: st?.detections60 ?? 0,
        lastEventAgeS,
      }
    })

    return {
      site: String(site || 'ricardone').toLowerCase(),
      at: snap.at,
      sector,
      presenceSeries,
      cameras,
      edge,
      baseline: bl
        ? {
            quarter: q,
            rate60: bl.rate60 ?? null,
            dwellP90Min: bl.dwellP90Min ?? null,
            samples: bl.samples ?? null,
          }
        : null,
    }
  }

  /**
   * @param {string} site
   * @param {{ sector?: string, order?: string }} opts
   */
  async function listTrucks(site, opts = {}) {
    const sectorFilter = opts.sector ? String(opts.sector).trim() : ''
    const order = opts.order === 'plate' ? 'plate' : 'dwell'
    if (sectorFilter && !getSectorProfile(sectorFilter)) {
      throw new PlantStateError('sector_unknown', 404, `sector desconocido: ${sectorFilter}`)
    }

    const events = await service.getEvents(site)
    const baselines = await service.getBaselines(site)
    const nowMs = Date.now()
    const q = quarterOf(formatArgentinaIsoFromMs(nowMs))
    const open = collectOpenJourneys(events, nowMs)

    let rows = open
    if (sectorFilter) rows = rows.filter((t) => t.sectorCode === sectorFilter)

    const trucks = rows.map((t) => {
      const bl =
        q && baselines?.[t.sectorCode]?.[q] ? baselines[t.sectorCode][q] : null
      return {
        plate: t.plate,
        circuit: t.match.circuit,
        circuitLabel: t.match.circuitLabel,
        provisional: true,
        sectorCode: t.sectorCode,
        dwellSectorMin: round1(t.dwellSectorMin),
        dwellPlantMin: round1(t.dwellPlantMin),
        nextExpectedPoint: t.match.nextExpectedPoint,
        nextExpectedLabel: t.match.nextExpectedLabel,
        status: truckStatus(t, bl),
        lastDevice: t.lastDevice || null,
        minutesSinceLastDetection: round1(t.minutesSinceLastDetection),
      }
    })

    if (order === 'plate') {
      trucks.sort((a, b) => a.plate.localeCompare(b.plate))
    } else {
      trucks.sort((a, b) => (b.dwellSectorMin ?? 0) - (a.dwellSectorMin ?? 0))
    }

    return {
      site: String(site || 'ricardone').toLowerCase(),
      at: formatArgentinaIsoFromMs(nowMs),
      sector: sectorFilter || null,
      order,
      count: trucks.length,
      trucks,
    }
  }

  /**
   * @param {string} site
   * @param {string} plate
   */
  async function getTruckJourney(site, plate) {
    const want = String(plate ?? '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
    if (!want) throw new PlantStateError('plate_required', 400, 'patente requerida')

    const events = await service.getEvents(site)
    const baselines = await service.getBaselines(site)
    const nowMs = Date.now()
    const q = quarterOf(formatArgentinaIsoFromMs(nowMs))
    const open = collectOpenJourneys(events, nowMs)
    const truck = open.find((t) => t.plate === want)
    if (!truck) {
      throw new PlantStateError('truck_not_open', 404, `sin journey abierto para ${want}`)
    }

    const bl =
      q && baselines?.[truck.sectorCode]?.[q] ? baselines[truck.sectorCode][q] : null
    const type = getSectorProfile(truck.sectorCode)?.type ?? null
    const fromLog = truck.logicalSeq[truck.logicalSeq.length - 1] ?? null
    const segmentCapMin = provisionalSegmentCapMin(fromLog, truck.match.nextExpectedPoint, type)
    const status = truckStatus(truck, bl)

    /** @type {object|null} */
    let anomaly = null
    if (segmentCapMin != null && truck.minutesSinceLastDetection > segmentCapMin) {
      const to = truck.match.nextExpectedPoint || '?'
      anomaly = {
        code: 'SIN_ACTUALIZACION',
        rule: `el tramo ${fromLog || '?'}→${to} superó su tope de ${segmentCapMin} min`,
        minutesSinceLastDetection: round1(truck.minutesSinceLastDetection),
        segmentCapMin,
        since: formatArgentinaIsoFromMs(truck.lastAt),
      }
    } else if (status === 'critical' || status === 'attention') {
      anomaly = {
        code: status === 'critical' ? 'DWELL_OVER_BASELINE' : 'DWELL_ATTENTION',
        rule:
          bl?.dwellP90Min != null
            ? `permanencia en sector ${round1(truck.dwellSectorMin)} min vs P90 habitual ${bl.dwellP90Min} min`
            : `permanencia elevada en ${truck.sectorCode}`,
        minutesSinceLastDetection: round1(truck.minutesSinceLastDetection),
        segmentCapMin,
        since: formatArgentinaIsoFromMs(truck.enteredSectorAt),
      }
    }

    /** Timeline: tiempo de cada fila = del tramo anterior. */
    const timeline = truck.events.map((row, idx) => {
      const prev = idx > 0 ? truck.events[idx - 1] : null
      const legMin = prev ? (row.t - prev.t) / 60000 : null
      const profile = getSectorProfile(row.sector)
      return {
        at: formatArgentinaIsoFromMs(row.t),
        sectorCode: row.sector,
        logicalSector: sectorToLogical(row.sector),
        label: profile?.label || row.sector,
        deviceCode: row.device || null,
        edgeId: profile?.edgeId || null,
        /** Minutos del tramo anterior (llegada a este punto desde el previo). */
        legFromPreviousMin: legMin == null ? null : round1(legMin),
      }
    })

    return {
      site: String(site || 'ricardone').toLowerCase(),
      at: formatArgentinaIsoFromMs(nowMs),
      plate: truck.plate,
      journeyUid: truck.journeyUid,
      open: true,
      sectorCode: truck.sectorCode,
      sectorLabel: getSectorProfile(truck.sectorCode)?.label || truck.sectorCode,
      circuit: truck.match.circuit,
      circuitLabel: truck.match.circuitLabel,
      provisional: true,
      nextExpectedPoint: truck.match.nextExpectedPoint,
      nextExpectedLabel: truck.match.nextExpectedLabel,
      dwellSectorMin: round1(truck.dwellSectorMin),
      dwellPlantMin: round1(truck.dwellPlantMin),
      minutesSinceLastDetection: round1(truck.minutesSinceLastDetection),
      segmentCapMin,
      lastDevice: truck.lastDevice || null,
      status,
      anomaly,
      timeline,
      note: 'El tiempo de cada fila del timeline es el del tramo anterior.',
    }
  }

  return { getSectorDetail, listTrucks, getTruckJourney }
}
