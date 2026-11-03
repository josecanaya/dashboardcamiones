// Replay de un día entero con el ensamblador de pasos + reconocedor, camión por camión.
// Baja eventos y alertas del microservicio (TRUCKFLOW_EXPORT_API_BASE), arma los pasos, identifica cada paso
// con la hora de fin del día (balanza del día, cartas, Vehículos Permitidos, aprendizaje) y cuenta los pasos
// de cada camión entre 00:00 y 24:00 (hora operativa).
// Uso: node scripts/replay-pasos-dia.mjs 2026-11-02 [salida]
import fs from 'node:fs'
import path from 'node:path'
import { applyIdentifications, identifyFragments, isValidPlate, nodeModelCatalog } from '../server/plantState/plateIdentification.mjs'
import { replayBalanzaRegistry } from '../server/plantState/balanzaRegistry.mjs'
import { getEventLiveInstantMs } from '../server/plantState/liveEventTime.mjs'
import { alertReadEvents, withAlertAttributes } from '../server/plantState/alertReads.mjs'
import { captureKey, ensamblarPasos } from '../server/plantState/pasos.mjs'
import { padronCartas } from '../server/plantState/padronCartas.mjs'
import { logicalLabel } from '../server/plantState/circuitPrefix.mjs'

const root = process.cwd()
const day = process.argv[2] ?? '2026-11-02'
const outDir = process.argv[3] ?? path.join(root, 'reportes', 'reconocimiento-pasos', day)
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).map((l) => /^([A-Z_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
const BASE = (process.env.TRUCKFLOW_EXPORT_API_BASE || env.TRUCKFLOW_EXPORT_API_BASE || 'http://100.54.73.142:8090').replace(/\/$/, '')
const SKEW = 206 * 60_000
const DAY_MS = 86_400_000
const start = Date.parse(`${day}T00:00:00-03:00`)
const end = start + DAY_MS
const ar = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 19)
const arDay = (ms) => ar(ms).slice(0, 10)
const hhmm = (ms) => ar(ms).slice(11, 16)
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^﻿/, ''))

/** Lista del microservicio en tramos de 12 h (rangos largos se cortan). */
async function list(kind, site, fromMs, toMs) {
  const out = new Map()
  for (let t = fromMs; t < toMs; t += 12 * 3600_000) {
    const u = `${BASE}/${kind}/list?startDate=${ar(t)}&endDate=${ar(Math.min(toMs, t + 12 * 3600_000))}&site=${site}`
    const j = await (await fetch(u)).json()
    for (const r of Array.isArray(j) ? j : Object.values(j).find(Array.isArray) ?? []) out.set(r.id, r)
  }
  return [...out.values()]
}

// Cartas del día y los vecinos (la vigencia mira ±1 día de turno), Vehículos Permitidos y aprendizaje.
const notes = new Map()
for (let k = -2; k <= 1; k++) {
  const f = `data/padron/${arDay(start + 12 * 3600_000 + k * DAY_MS)}.json`
  if (fs.existsSync(path.join(root, f))) for (const n of json(f).notes) notes.set(n.ctg, n)
}
const byPlate = new Map()
for (const n of notes.values()) for (const p of n.plates ?? []) byPlate.set(p, [...(byPlate.get(p) ?? []), n])
const permitidosDoc = fs.existsSync(path.join(root, 'data/padron/vehiculos-permitidos.json')) ? json('data/padron/vehiculos-permitidos.json') : { entries: [] }
const permitidosBy = new Map((permitidosDoc.entries ?? []).map((e) => [String(e.plate).toUpperCase(), e]))
const padron = padronCartas({ lookup: (p) => byPlate.get(p) ?? [], notes: () => notes.values() }, { lookup: (p) => permitidosBy.get(p) ?? null })
const corr = fs.existsSync(path.join(root, 'data/padron/corregidos.json')) ? json('data/padron/corregidos.json') : { pairs: [], real: [] }
const pairsByRead = new Map()
for (const p of corr.pairs ?? []) if (!p.readIsReal) pairsByRead.set(p.read, [...(pairsByRead.get(p.read) ?? []), p])
const realSet = new Set((corr.real ?? []).map((r) => r.plate))
// Mismo índice que server/live/padron/aprendizaje.mjs, leído de los archivos (sin rearmarlos).
const corregidos = { realOf: (read) => [...(pairsByRead.get(read) ?? [])].sort((a, b) => b.count - a.count), isReal: (p) => realSet.has(p) }
const noCamDoc = fs.existsSync(path.join(root, 'data/padron/no-camiones.json')) ? json('data/padron/no-camiones.json') : { entries: [] }
const noCamBy = new Map((noCamDoc.entries ?? []).map((v) => [v.plate, v]))
const noCamiones = { lookup: (p) => noCamBy.get(p) ?? null }
/** Clasificación manual por foto: camiones que no están en cartas, Permitidos ni SGC. */
const clasificados = new Map((fs.existsSync(path.join(root, 'data/padron/clasificacion-manual.json')) ? json('data/padron/clasificacion-manual.json').entries : []).map((e) => [e.plate, e.tipo]))

const catalog = nodeModelCatalog()
const balanza = replayBalanzaRegistry(day)
const SITES = { ricardone: 'Ricardone', san_lorenzo: 'PUERTO_SAN_LORENZO' }
const raw = {}
for (const [site, q] of Object.entries(SITES)) {
  // Un día antes de historia para el reconocedor; los eventos se piden por occurredAt (206 min atrás).
  const ev = (await list('journey-event', q, start - DAY_MS - SKEW - 3600_000, end - SKEW + 3600_000))
    .filter((e) => e.eventCategory === 'physical')
    .map((r) => ({ ...r, normalizedPlate: String(r.truckPlate || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase() }))
  const al = await list('alert', q, start - DAY_MS, end + 1800_000)
  raw[site] = { ev, al }
}

const trucks = new Map()
const resumen = {}
const sueltos = []
for (const site of Object.keys(SITES)) {
  const { ev, al } = raw[site]
  const events = withAlertAttributes([...ev, ...alertReadEvents(al, ev)], al).filter((e) => getEventLiveInstantMs(e) < end)
  const acopladoChasis = (plate, t) => { const h = padron.at(plate, t); return h?.role === 'acoplado' && h.source === 'carta' ? h.chasis : null }
  const ens = ensamblarPasos(events, { acopladoChasis })
  const other = site === 'ricardone' ? 'san_lorenzo' : 'ricardone'
  const { items } = identifyFragments(ens.events, end, {
    catalog,
    balanza,
    padron,
    corregidos,
    noCamiones,
    otherSiteEvents: raw[other].ev.filter((e) => getEventLiveInstantMs(e) < end),
  })
  const identified = new Map(applyIdentifications(ens.events, items).map((e) => [captureKey(e), e]))
  const r = { pasos: 0, capturas: 0, identificados: 0, sinIdentificar: 0, porRegla: {} }
  for (const p of ens.pasos) {
    const t = Date.parse(p.at)
    if (t < start || t >= end) continue
    r.pasos++
    r.capturas += p.captures
    const e = identified.get(p.anchorKey)
    const plate = String(e?.truckPlate ?? p.plate ?? '').toUpperCase()
    const how = e?.identificationLevel ? (items.find((i) => i.assignedPlate === plate && i.fragmentKey && i.readPlate === (e.identifiedFromPlate ?? ''))?.rule ?? 'corregida') : 'leida'
    if (!isValidPlate(plate)) {
      r.sinIdentificar++
      // Para ver si un paso que le falta a un camión estaba en una captura que nadie asignó.
      sueltos.push({ site, at: p.at, node: p.node, device: p.anchorKey.split('|')[1], read: p.plate, captures: p.captures, brand: p.brand })
      continue
    }
    r.identificados++
    r.porRegla[how] = (r.porRegla[how] ?? 0) + 1
    const k = plate
    if (!trucks.has(k)) trucks.set(k, { plate: k, pasos: 0, capturas: 0, sitios: new Set(), recorrido: [], corregidos: 0, acoplado: new Set() })
    const tr = trucks.get(k)
    tr.pasos++
    tr.capturas += p.captures
    tr.sitios.add(site === 'ricardone' ? 'Ric' : 'SL')
    // Cámara y hora del feed de la captura ancla: para pedir la foto al DSS (/camera-captures/find).
    tr.recorrido.push({ t, node: p.node, label: logicalLabel(p.node), device: p.anchorKey.split('|')[1], at: p.at, read: p.plate, captures: p.captures, how })
    if (how !== 'leida') tr.corregidos++
    if (p.acoplado) tr.acoplado.add(p.acoplado)
  }
  resumen[site] = r
}

// Qué es cada vehículo: carta de porte del día, Vehículo Permitido, balanza (SGC), no camión o nada.
const rows = [...trucks.values()].map((tr) => {
  const t0 = Math.min(...tr.recorrido.map((x) => x.t))
  const hit = padron.at(tr.plate, t0)
  const tipo = noCamiones.lookup(tr.plate) ? 'no camión' : clasificados.get(tr.plate) === 'camion' ? 'camión (clasificado)' : hit?.source === 'carta' ? `carta (${hit.grain ?? hit.direction ?? ''})` : hit?.source === 'permitido' ? `Permitido${hit.category ? ` (${hit.category.replace(/_/g, ' ')})` : ''}` : balanza.truckAt(tr.plate, t0) ? 'balanza (SGC)' : 'sin registro'
  const rec = tr.recorrido.sort((a, b) => a.t - b.t)
  return {
    patente: tr.plate,
    tipo,
    plantas: [...tr.sitios].join('+'),
    pasos: tr.pasos,
    capturas: tr.capturas,
    corregidos: tr.corregidos,
    primero: hhmm(rec[0].t),
    ultimo: hhmm(rec.at(-1).t),
    acoplado: [...tr.acoplado].join(' '),
    recorrido: rec.map((x) => `${hhmm(x.t)} ${x.label}`).join(' › '),
    // Cada paso con su nodo lógico (para armar el recorrido por visita: scripts/recorridos-faltantes.mjs).
    pasosDetalle: rec.map((x) => ({ at: x.at, node: x.node, device: x.device, read: x.read, captures: x.captures, how: x.how })),
    // Primero las frontales que leyeron la patente tal cual.
    fotos: [...rec].sort((x, y) => Number(/Tr|Tras|Traser/.test(x.device)) - Number(/Tr|Tras|Traser/.test(y.device)) || Number(y.read === tr.plate) - Number(x.read === tr.plate)).slice(0, 4).map(({ device, at, read }) => ({ device, at, read })),
  }
}).sort((a, b) => b.pasos - a.pasos || a.patente.localeCompare(b.patente))

fs.mkdirSync(outDir, { recursive: true })
const cols = ['patente', 'tipo', 'plantas', 'pasos', 'capturas', 'corregidos', 'primero', 'ultimo', 'acoplado', 'recorrido'] // fotos: solo en el .json
const csv = [cols.join(';'), ...rows.map((r) => cols.map((c) => String(r[c]).replace(/;/g, ',')).join(';'))].join('\n')
fs.writeFileSync(path.join(outDir, 'pasos-por-camion.csv'), `﻿${csv}\n`)
fs.writeFileSync(path.join(outDir, 'pasos-por-camion.json'), JSON.stringify({ dia: day, resumen, camiones: rows, sueltos }, null, 1))
const tipos = rows.reduce((m, r) => ((m[r.tipo.replace(/ \(.*/, '')] = (m[r.tipo.replace(/ \(.*/, '')] ?? 0) + 1), m), {})
console.log(JSON.stringify({ dia: day, resumen, vehiculos: rows.length, porTipo: tipos }, null, 1))
console.log(`→ ${path.join(outDir, 'pasos-por-camion.csv')}`)
