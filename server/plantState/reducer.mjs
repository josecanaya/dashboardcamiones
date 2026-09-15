/**
 * Reductor puro de Plant State.
 * Entra: eventos + instante de corte. Sale: snapshot. Sin red, sin disco, sin Date.now().
 */

import { getEventLiveInstantMs, formatArgentinaIsoFromMs } from './liveEventTime.mjs'
import {
  EDGE_LABELS,
  SECTOR_DEVICES,
  SECTOR_PROFILES,
  getSectorProfile,
  resolveCanonicalSectorForLiveFeed,
} from './sectorProfiles.mjs'
import { ZONES, POINTS, pointOfSector, pointOfLogical, resolveZone } from './plantGraph.mjs'
import { buildPointActivity, effectiveDrainRate, drainMinutes } from './drain.mjs'
import { buildLogicalSequence, matchCircuitByPrefix, sectorToLogical } from './circuitPrefix.mjs'

const HOUR_MS = 60 * 60 * 1000
const OPEN_MAX_IDLE_MS = 180 * 60 * 1000
/** En báscula la presencia física es breve; 3 h inflaba “last LPR” vs capacidad del tramo. */
const SCALE_MAX_IDLE_MS = 30 * 60 * 1000
/** Tras egreso de báscula el camión ya no está en la balanza; no anclar presencia ahí. */
const SCALE_EGRESO_DEVICES = new Set(['RicB1Egreso', 'RicB2Egreso', 'RicB3Egreso'])
const DELTA_LOOKBACK_MS = 40 * 60 * 1000
const TWELVE_H_MS = 12 * HOUR_MS

/**
 * @param {{ type?: string }|null|undefined} profile
 * @param {number} idleMs
 * @param {string} lastDevice
 */
export function isJourneyOpenAtSector(profile, idleMs, lastDevice) {
  if (!profile || profile.type === 'exit') return false
  if (profile.type === 'scale') {
    if (SCALE_EGRESO_DEVICES.has(String(lastDevice || '').trim())) return false
    return idleMs < SCALE_MAX_IDLE_MS
  }
  return idleMs < OPEN_MAX_IDLE_MS
}

/**
 * @param {number[]} values
 * @returns {number|null}
 */
function percentile90(values) {
  if (!values.length) return null
  if (values.length < 3) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (sorted.length - 1) * 0.9
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const w = idx - lo
  return sorted[lo] * (1 - w) + sorted[hi] * w
}

function avg(values) {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function round1(n) {
  if (n == null || !Number.isFinite(n)) return null
  return Math.round(n * 10) / 10
}

/**
 * @param {object[]} events
 * @param {number} nowMs
 * @param {{ site?: string, skipDelta?: boolean, alerts?: object[] }} options
 */
export function reducePlantState(events, nowMs, options = {}) {
  const t0 = performance.now()
  const site = options.site || 'ricardone'
  const skipDelta = Boolean(options.skipDelta)
  const alerts = Array.isArray(options.alerts) ? options.alerts : []

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
      rawSector: sector,
    })
  }

  /** @type {Map<string, typeof normalized>} */
  const byJourney = new Map()
  for (let i = 0; i < normalized.length; i++) {
    const row = normalized[i]
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

  for (const list of byJourney.values()) {
    list.sort((a, b) => a.t - b.t || (a.e.sequenceNumber ?? 0) - (b.e.sequenceNumber ?? 0))
  }

  /** @type {Record<string, number>} */
  const present = Object.fromEntries(Object.keys(SECTOR_PROFILES).map((k) => [k, 0]))
  /** @type {Record<string, number>} */
  const in60 = Object.fromEntries(Object.keys(SECTOR_PROFILES).map((k) => [k, 0]))
  /** @type {Record<string, number>} */
  const out60 = Object.fromEntries(Object.keys(SECTOR_PROFILES).map((k) => [k, 0]))
  /** @type {Record<string, number[]>} */
  const dwells = Object.fromEntries(Object.keys(SECTOR_PROFILES).map((k) => [k, []]))
  /** @type {number[]} */
  const plantDwells = []

  const windowStart = nowMs - HOUR_MS
  let trucksOpen = 0

  // —— Zonas: el camión espera en el espacio DESPUÉS del punto que lo leyó.
  /** @type {Record<string, number>} */
  const backlog = Object.fromEntries(ZONES.map((z) => [z.id, 0]))
  /** @type {Record<string, number>} */
  const zoneIn60 = Object.fromEntries(ZONES.map((z) => [z.id, 0]))
  /** @type {Record<string, number>} */
  const zoneOut60 = Object.fromEntries(ZONES.map((z) => [z.id, 0]))
  /** @type {Record<string, number[]>} */
  const zoneDwells = Object.fromEntries(ZONES.map((z) => [z.id, []]))

  for (const list of byJourney.values()) {
    const withSector = list.filter((r) => r.sector)
    if (!withSector.length) continue

    // Transiciones entre sectores (para el panel de sector, que sigue existiendo)
    let prevSector = null
    for (const row of withSector) {
      if (prevSector == null) {
        if (row.t > windowStart) in60[row.sector] = (in60[row.sector] || 0) + 1
      } else if (prevSector !== row.sector) {
        if (row.t > windowStart) {
          in60[row.sector] = (in60[row.sector] || 0) + 1
          out60[prevSector] = (out60[prevSector] || 0) + 1
        }
      }
      prevSector = row.sector
    }

    // Recorrido por zonas: se alinea la secuencia observada contra la plantilla del
    // circuito para saber, en cada lectura, cuál era el próximo punto esperado.
    const match = matchCircuitByPrefix(buildLogicalSequence(withSector.map((r) => r.sector)))
    const seq = Array.isArray(match?.matchedSequence) ? match.matchedSequence : []
    let seqPos = 0
    let prevZoneId = null
    let zoneEnteredAt = withSector[0].t
    let lastZone = null

    for (const row of withSector) {
      const logical = sectorToLogical(row.sector)
      while (seqPos < seq.length && seq[seqPos] !== logical) seqPos += 1
      const nextLogical = seqPos < seq.length ? seq[seqPos + 1] ?? null : null
      if (seqPos < seq.length) seqPos += 1

      const zone = resolveZone(pointOfSector(row.sector), pointOfLogical(nextLogical))
      if (zone.id !== prevZoneId) {
        if (row.t > windowStart) {
          zoneIn60[zone.id] = (zoneIn60[zone.id] || 0) + 1
          if (prevZoneId) zoneOut60[prevZoneId] = (zoneOut60[prevZoneId] || 0) + 1
        }
        zoneEnteredAt = row.t
        prevZoneId = zone.id
      }
      lastZone = zone
    }

    const last = withSector[withSector.length - 1]
    const lastProfile = getSectorProfile(last.sector)
    const idle = nowMs - last.t
    const open = isJourneyOpenAtSector(lastProfile, idle, last.device)

    if (open) {
      trucksOpen += 1
      present[last.sector] = (present[last.sector] || 0) + 1
      // Permanencia en sector actual: desde el evento que lo puso ahí
      let enteredAt = last.t
      for (let i = withSector.length - 1; i >= 0; i--) {
        if (withSector[i].sector !== last.sector) break
        enteredAt = withSector[i].t
      }
      dwells[last.sector].push((nowMs - enteredAt) / 60000)
      plantDwells.push((nowMs - withSector[0].t) / 60000)

      if (lastZone) {
        backlog[lastZone.id] = (backlog[lastZone.id] || 0) + 1
        zoneDwells[lastZone.id].push((nowMs - zoneEnteredAt) / 60000)
      }
    }
  }

  /** @type {Record<string, number>|null} */
  let delta40 = null
  /** @type {Record<string, number>|null} */
  let zoneDelta40 = null
  if (!skipDelta) {
    const before = reducePlantState(events, nowMs - DELTA_LOOKBACK_MS, {
      ...options,
      skipDelta: true,
    })
    delta40 = {}
    for (const code of Object.keys(SECTOR_PROFILES)) {
      const cur = present[code] || 0
      const prev = before.sectors.find((s) => s.sectorCode === code)?.present ?? 0
      delta40[code] = cur - prev
    }
    zoneDelta40 = {}
    for (const z of ZONES) {
      const prev = before.zones?.find((x) => x.id === z.id)?.backlog ?? 0
      zoneDelta40[z.id] = (backlog[z.id] || 0) - prev
    }
  }

  // Salud de Edge
  /** @type {Map<string, { devices: Set<string>, sectorCodes: string[] }>} */
  const edgeMeta = new Map()
  for (const [sectorCode, profile] of Object.entries(SECTOR_PROFILES)) {
    const edgeId = profile.edgeId
    let meta = edgeMeta.get(edgeId)
    if (!meta) {
      meta = { devices: new Set(), sectorCodes: [] }
      edgeMeta.set(edgeId, meta)
    }
    meta.sectorCodes.push(sectorCode)
    for (const d of SECTOR_DEVICES[sectorCode] || []) meta.devices.add(d)
  }

  const edges = []
  for (const [edgeId, meta] of edgeMeta.entries()) {
    const camerasExpected = meta.devices.size
    /** @type {Set<string>} */
    const okDevices = new Set()
    let lastEventT = Number.NaN
    let detections60 = 0
    let lprBad = 0
    for (const row of normalized) {
      if (!meta.devices.has(row.device)) continue
      if (!Number.isFinite(lastEventT) || row.t > lastEventT) lastEventT = row.t
      if (row.t > windowStart) {
        detections60 += 1
        okDevices.add(row.device)
      }
    }
    for (const a of alerts) {
      const t = getEventLiveInstantMs(a)
      if (!Number.isFinite(t) || t <= windowStart || t > nowMs) continue
      const dev = String(a.deviceCode ?? '').trim()
      if (!meta.devices.has(dev)) continue
      const code = String(a.alertCode || a.eventType || '').toUpperCase()
      if (code.includes('LPR_MALFUNCTION') || code.includes('LPR')) lprBad += 1
    }
    const camerasOk = okDevices.size
    let status = 'offline'
    if (camerasOk === camerasExpected && camerasExpected > 0) status = 'online'
    else if (camerasOk > 0) status = 'degraded'
    const ocrQuality =
      detections60 >= 10 ? Math.max(0, Math.min(1, 1 - lprBad / detections60)) : null
    edges.push({
      id: edgeId,
      label: EDGE_LABELS[edgeId] || edgeId,
      status,
      camerasOk,
      camerasExpected,
      lastEventAgeS: Number.isFinite(lastEventT) ? Math.round((nowMs - lastEventT) / 1000) : null,
      detections60,
      ocrQuality: ocrQuality == null ? null : round1(ocrQuality),
    })
  }

  const sectors = Object.entries(SECTOR_PROFILES).map(([sectorCode, profile]) => {
    const p = present[sectorCode] || 0
    const o60 = out60[sectorCode] || 0
    const i60 = in60[sectorCode] || 0
    const sectorDwells = dwells[sectorCode] || []
    return {
      sectorCode,
      label: profile.label,
      type: profile.type,
      present: p,
      capacity: profile.capacity,
      in60: i60,
      out60: o60,
      rate60: o60,
      delta40: delta40 ? delta40[sectorCode] ?? 0 : 0,
      dwellAvgMin: round1(avg(sectorDwells)),
      dwellP90Min: round1(percentile90(sectorDwells)),
      status: 'normal',
      edgeId: profile.edgeId,
    }
  })

  const gateCodes = Object.entries(SECTOR_PROFILES)
    .filter(([, p]) => p.type === 'gate')
    .map(([c]) => c)
  const exitCodes = Object.entries(SECTOR_PROFILES)
    .filter(([, p]) => p.type === 'exit')
    .map(([c]) => c)
  // Ingresos a planta = entradas al gate; egresos = llegadas al sector exit (no salidas desde él).
  const inflow60 = gateCodes.reduce((s, c) => s + (in60[c] || 0), 0)
  const outflow60 = exitCodes.reduce((s, c) => s + (in60[c] || 0), 0)

  // —— Zonas con tasa efectiva y tiempo de drenaje
  const pointActivity = buildPointActivity(normalized, nowMs)
  const zones = ZONES.map((z) => {
    const n = backlog[z.id] || 0
    const { rate, nominal, activePoints, idlePoints } = effectiveDrainRate(z, pointActivity)
    const zd = zoneDwells[z.id] || []
    return {
      id: z.id,
      label: z.label,
      from: z.from,
      fromLabel: z.from && POINTS[z.from] ? POINTS[z.from].label : null,
      to: z.to,
      drainPoints: z.to.map((p) => ({
        id: p,
        label: POINTS[p]?.label ?? p,
        sectorCode: POINTS[p]?.sectorCode ?? null,
        ratePerHour: POINTS[p]?.ratePerHour ?? null,
      })),
      backlog: n,
      capacityPhysical: z.capacityPhysical,
      capacityOperational: z.capacityOperational,
      in60: zoneIn60[z.id] || 0,
      out60: zoneOut60[z.id] || 0,
      delta40: zoneDelta40 ? zoneDelta40[z.id] ?? 0 : 0,
      dwellAvgMin: round1(avg(zd)),
      dwellP90Min: round1(percentile90(zd)),
      drainRatePerHour: rate == null ? null : round1(rate),
      drainRateNominalPerHour: nominal == null ? null : round1(nominal),
      drainMinutes: drainMinutes(z, n, pointActivity),
      activePoints,
      idlePoints,
      status: 'normal',
      note: z.note ?? null,
      pending: z.pending ?? null,
    }
  })

  return {
    site,
    at: formatArgentinaIsoFromMs(nowMs),
    plant: {
      trucksInPlant: trucksOpen,
      inflow60,
      outflow60,
      balance60: inflow60 - outflow60,
      dwellAvgMin: round1(avg(plantDwells)),
      dwellP90Min: round1(percentile90(plantDwells)),
      bottleneck: null,
    },
    sectors,
    zones,
    edges,
    pointActivity,
    trucksOpen,
    generatedInMs: Math.round(performance.now() - t0),
  }
}
