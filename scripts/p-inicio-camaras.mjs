// p_inicio medido solo con cámaras (septiembre): por nodo, qué parte de las lecturas válidas es la
// PRIMERA lectura de esa patente en las 8 h anteriores, en cualquiera de las dos plantas. Sirve
// para los nodos de partida, donde el modelo no alcanza (Ingreso SL mezcla R7 y directos al puerto).
// También guarda la flota: patentes válidas leídas en 2 días distintos o más.
// Uso: node scripts/p-inicio-camaras.mjs
import fs from 'node:fs'
import path from 'node:path'
import { getEventLiveInstantMs } from '../server/plantState/liveEventTime.mjs'
import { resolveCanonicalSectorForLiveFeed } from '../server/plantState/sectorProfiles.mjs'
import { sectorToLogical } from '../server/plantState/circuitPrefix.mjs'
import { isValidPlate } from '../server/plantState/plateIdentification.mjs'

const root = process.cwd()
const GAP = 8 * 3600_000
const franja = (ms) => { const h = new Date(ms - 3 * 3600_000).getUTCHours(); return h >= 6 && h < 18 ? 'dia' : 'noche' }
const rows = []
const daysByPlate = new Map()
for (const d of fs.readdirSync(path.join(root, 'data/truckflow')).filter((d) => d.startsWith('2026-09')).sort()) {
  const f = path.join(root, 'data/truckflow', d, 'event-list.json')
  if (!fs.existsSync(f)) continue
  const obj = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''))
  for (const e of Array.isArray(obj) ? obj : obj.records ?? []) {
    if (e.inferred || e.manualCorrection || (e.eventCategory && e.eventCategory !== 'physical')) continue
    const plate = String(e.normalizedPlate || e.truckPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!isValidPlate(plate)) continue
    const t = getEventLiveInstantMs(e)
    const logical = sectorToLogical(resolveCanonicalSectorForLiveFeed(e.sectorCode, String(e.deviceCode ?? '')))
    if (!Number.isFinite(t) || !logical || logical === 'ESPERA') continue
    rows.push({ plate, t, logical })
    if (!daysByPlate.has(plate)) daysByPlate.set(plate, new Set())
    daysByPlate.get(plate).add(d)
  }
}
// Autos, camionetas y servicio entran en San Lorenzo por Egreso o Renova, que para un camión son el
// final del recorrido: inflan las «primeras lecturas» justo ahí. Camión = patente que pasó al menos una
// vez por un nodo de proceso (calada, balanza, descarga o carga), por donde no pasa un particular.
const PROCESS_NODES = new Set(['S2', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'SL_S1', 'SL_S2', 'SL_S4', 'SL_S5', 'SL_S6', 'SL_S10'])
const truckPlates = new Set(rows.filter((r) => PROCESS_NODES.has(r.logical)).map((r) => r.plate))
const allRows = rows.length
// Parte de los pasos de cada nodo que son de vehículos que no son camiones (nunca pasaron por proceso).
const nonTruck = {}
{
  const lastAt = new Map()
  for (const r of [...rows].sort((a, b) => a.t - b.t)) {
    const k = `${r.plate}|${r.logical}`
    const prev = lastAt.get(k)
    lastAt.set(k, r.t)
    if (prev != null && r.t - prev < 30 * 60_000) continue
    const a = (nonTruck[r.logical] ??= { dia: { n: 0, otros: 0 }, noche: { n: 0, otros: 0 } })[franja(r.t)]
    a.n++
    if (!truckPlates.has(r.plate)) a.otros++
  }
}
rows.splice(0, rows.length, ...rows.filter((r) => truckPlates.has(r.plate)))
rows.sort((a, b) => a.t - b.t)
// Una lectura válida que aparece una sola vez puede ser un error de la cámara con formato válido
// (OJO501 por OJD501). Cuenta como camión nuevo solo si esa patente se lee después en otro nodo.
const byPlate = new Map()
for (const r of rows) { if (!byPlate.has(r.plate)) byPlate.set(r.plate, []); byPlate.get(r.plate).push(r) }
const confirmedLater = (r) => byPlate.get(r.plate).some((x) => x.t > r.t && x.t - r.t <= GAP && x.logical !== r.logical)
const last = new Map()
const agg = {}
for (const r of rows) {
  const prev = last.get(r.plate)
  // Varias lecturas del mismo nodo seguidas = un solo paso: cuenta la primera.
  if (prev && prev.logical === r.logical && r.t - prev.t < 30 * 60_000) { last.set(r.plate, r); continue }
  const first = !prev || r.t - prev.t > GAP
  const a = (agg[r.logical] ??= { dia: { n: 0, first: 0, conf: 0 }, noche: { n: 0, first: 0, conf: 0 } })[franja(r.t)]
  a.n++
  if (first) a.first++
  if (first && confirmedLater(r)) a.conf++
  last.set(r.plate, r)
}
const out = Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, {
  dia: { pasos: v.dia.n, primera: v.dia.first, confirmada: v.dia.conf, p: v.dia.n ? v.dia.first / v.dia.n : null, pConfirmada: v.dia.n ? v.dia.conf / v.dia.n : null },
  noche: { pasos: v.noche.n, primera: v.noche.first, confirmada: v.noche.conf, p: v.noche.n ? v.noche.first / v.noche.n : null, pConfirmada: v.noche.n ? v.noche.conf / v.noche.n : null } }]))
for (const [k, v] of Object.entries(nonTruck)) {
  out[k] ??= {}
  out[k].noCamion = Object.fromEntries(['dia', 'noche'].map((f) => [f, { pasos: v[f].n, otros: v[f].otros, p: v[f].n ? v[f].otros / v[f].n : null }]))
}
const fleet = [...daysByPlate].filter(([p, s]) => s.size >= 2 && truckPlates.has(p)).map(([p]) => p).sort()
fs.writeFileSync(path.join(root, 'docs/auditoria-patentes-2026-10-08/teorema/p-inicio-camaras.json'), JSON.stringify({ generatedAt: new Date().toISOString(), lecturasValidas: allRows, lecturasDeCamiones: rows.length, patentesCamion: truckPlates.size, nodos: out }, null, 2) + '\n')
fs.writeFileSync(path.join(root, 'server/plantState/data/flotaPatentes.json'), JSON.stringify({ generatedAt: new Date().toISOString(), source: 'scripts/p-inicio-camaras.mjs', criterio: 'patente válida leída en 2 días distintos o más de septiembre y que pasó por un nodo de proceso (calada, balanza, descarga o carga)', plates: fleet }) + '\n')
console.log('lecturas válidas', allRows, 'de camiones', rows.length, 'patentes', daysByPlate.size, 'camiones', truckPlates.size, 'flota (≥2 días)', fleet.length)
const pc = (x) => (x == null ? '   -  ' : (x * 100).toFixed(1).padStart(5) + '%')
console.log('nodo     primera día/noche   confirmada después día/noche')
for (const [k, v] of Object.entries(out).sort()) console.log(k.padEnd(7), pc(v.dia?.p), pc(v.noche?.p), '   ', pc(v.dia?.pConfirmada), pc(v.noche?.pConfirmada), '   no camión', pc(v.noCamion?.dia.p), pc(v.noCamion?.noche.p))
