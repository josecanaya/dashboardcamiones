// Replay de un día por las capas del reconocedor (lámina «El recorrido de una captura»): cada paso de cada
// vehículo termina en una capa — 2 ¿Quién es? (carta de porte, Vehículos Permitidos: bases del back office o
// balanza), 3.1 patentes parecidas, 3.2 metadatos, 3.3 banco de corregidas, 3.4 IA, balanza (SGC) o 4 alerta.
// Mismo armado que scripts/replay-pasos-dia.mjs (ensamblador + reconocedor con la hora de fin del día), pero
// con las bases del back office (MongoDB) como en el servidor y con las lecturas guardadas en data/truckflow.
// Uso: node scripts/replay-capas-dia.mjs 2026-11-02 [salida]
import fs from 'node:fs'
import path from 'node:path'
import { applyIdentifications, identifyFragments, isValidPlate, journeyKeyOf, nodeModelCatalog } from '../server/plantState/plateIdentification.mjs'
import { replayBalanzaRegistry } from '../server/plantState/balanzaRegistry.mjs'
import { getEventLiveInstantMs } from '../server/plantState/liveEventTime.mjs'
import { alertReadEvents, withAlertAttributes } from '../server/plantState/alertReads.mjs'
import { captureKey, ensamblarPasos } from '../server/plantState/pasos.mjs'
import { padronCartas } from '../server/plantState/padronCartas.mjs'
import { logicalLabel } from '../server/plantState/circuitPrefix.mjs'
import { connectBackofficeDb } from '../server/live/padron/padronDb.mjs'
import { createBackofficeIndex } from '../server/live/padron/backofficeIndex.mjs'

const root = process.cwd()
const day = process.argv[2] ?? '2026-11-02'
const outDir = process.argv[3] ?? path.join(root, 'reportes', 'reconocimiento-capas', day)
const DAY_MS = 86_400_000
const start = Date.parse(`${day}T00:00:00-03:00`)
const end = start + DAY_MS
const arDay = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^﻿/, ''))
const tryJson = (p) => (fs.existsSync(path.join(root, p)) ? json(p) : null)

/** Capa de la lámina según la regla del reconocedor. */
const CAPA_DE_REGLA = {
  carta_porte: '2', vehiculo_permitido: '2', acoplado_carta: '2', acoplado_permitido: '2', doble_lectura_carta: '2', doble_lectura_permitido: '2',
  carta_parecida: '3.1', doble_lectura: '3.1', universo: '3.1', cuenta: '3.1', busqueda_atras: '3.1', par_trasera: '3.1',
  atributos_dss: '3.2',
  corregida_antes: '3.3', confirmada_antes: '3.3', no_camion: '3.3',
  ia_imagen: '3.4',
  leida_bien_balanza: 'balanza', doble_lectura_balanza: 'balanza', balanza_parecida: 'balanza', balanza_unica: 'balanza', acoplado_balanza: 'balanza',
}

// Lecturas guardadas: el día, el anterior (historia del reconocedor) y el siguiente (lo que llega tarde).
const lecturas = { ricardone: { ev: [], al: [] }, san_lorenzo: { ev: [], al: [] } }
for (const d of [arDay(start - DAY_MS + 3600_000), day, arDay(end + 3600_000)]) {
  for (const [f, k] of [['event-list.json', 'ev'], ['alert-list.json', 'al']]) {
    for (const r of tryJson(`data/truckflow/${d}/${f}`)?.records ?? []) {
      if (k === 'ev' && r.eventCategory !== 'physical') continue
      const site = /^SLZ/.test(String(r.deviceCode ?? '')) ? 'san_lorenzo' : 'ricardone'
      lecturas[site][k].push(k === 'ev' ? { ...r, normalizedPlate: String(r.truckPlate || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase() } : r)
    }
  }
}
for (const s of Object.values(lecturas)) for (const k of ['ev', 'al']) s[k] = [...new Map(s[k].map((r) => [r.id, r])).values()]

// Cartas del día y vecinas, Vehículos Permitidos como en el servidor (bases del back office, después la
// lista armada con la balanza), aprendizaje.
const notes = new Map()
for (let k = -2; k <= 1; k++) for (const n of tryJson(`data/padron/${arDay(start + 12 * 3600_000 + k * DAY_MS)}.json`)?.notes ?? []) notes.set(n.ctg, n)
const byPlate = new Map()
for (const n of notes.values()) for (const p of n.plates ?? []) byPlate.set(p, [...(byPlate.get(p) ?? []), n])
const padronMem = { lookup: (p) => byPlate.get(p) ?? [], notes: () => notes.values() }
const balanzaLista = new Map((tryJson('data/padron/vehiculos-permitidos.json')?.entries ?? []).map((e) => [String(e.plate).toUpperCase(), e]))
const bases = { particulares: await connectBackofficeDb('particulares'), sin_carta: await connectBackofficeDb('sin_carta') }
const backoffice = createBackofficeIndex({ padronDb: bases, projectRoot: root, log: {} })
await backoffice.start()
const permitidos = { lookup: (p) => backoffice.lookup(p) ?? balanzaLista.get(p) ?? null }
const padron = padronCartas(padronMem, permitidos)
const corr = tryJson('data/padron/corregidos.json') ?? { pairs: [], real: [] }
const pairsByRead = new Map()
for (const p of corr.pairs ?? []) if (!p.readIsReal) pairsByRead.set(p.read, [...(pairsByRead.get(p.read) ?? []), p])
const realSet = new Set((corr.real ?? []).map((r) => r.plate))
const corregidos = { realOf: (read) => [...(pairsByRead.get(read) ?? [])].sort((a, b) => b.count - a.count), isReal: (p) => realSet.has(p) }
const noCamBy = new Map((tryJson('data/padron/no-camiones.json')?.entries ?? []).map((v) => [v.plate, v]))
const noCamiones = { lookup: (p) => noCamBy.get(p) ?? null }
const catalog = nodeModelCatalog()
const balanza = replayBalanzaRegistry(day)

/** Quién es la patente final: carta, base de particulares, base sin carta, lista de balanza o nadie. */
function quienEs(plate, t) {
  if (!isValidPlate(plate)) return 'sin patente'
  const h = padron.at(plate, t)
  if (h?.source === 'carta') return 'carta de porte'
  if (h?.source === 'permitido') {
    const b = backoffice.lookup(plate)
    return b ? (b.backoffice.base === 'particulares' ? 'base particulares' : 'base sin carta') : 'lista de balanza'
  }
  return 'nadie'
}
const esGranos = (p) => backoffice.esCamionDeGranos(p) || padronMem.lookup(p).length > 0

const pasos = []
for (const site of ['ricardone', 'san_lorenzo']) {
  const { ev, al } = lecturas[site]
  const events = withAlertAttributes([...ev, ...alertReadEvents(al, ev)], al).filter((e) => getEventLiveInstantMs(e) < end)
  const acopladoChasis = (plate, t) => { const h = padron.at(plate, t); return h?.role === 'acoplado' && h.source === 'carta' ? h.chasis : null }
  const ens = ensamblarPasos(events, { acopladoChasis })
  const other = site === 'ricardone' ? 'san_lorenzo' : 'ricardone'
  const { items } = identifyFragments(ens.events, end, { catalog, balanza, padron, corregidos, noCamiones, otherSiteEvents: lecturas[other].ev.filter((e) => getEventLiveInstantMs(e) < end) })
  const itemBy = new Map(items.map((it) => [it.fragmentKey, it]))
  const evBy = new Map(ens.events.map((e) => [captureKey(e), e]))
  const identified = new Map(applyIdentifications(ens.events, items).map((e) => [captureKey(e), e]))
  for (const p of ens.pasos) {
    const t = Date.parse(p.at)
    if (t < start || t >= end) continue
    const e0 = evBy.get(p.anchorKey)
    const it = e0 ? itemBy.get(journeyKeyOf(e0, getEventLiveInstantMs(e0))) : null
    const read = String(p.plate ?? '').toUpperCase()
    const final = String(identified.get(p.anchorKey)?.truckPlate ?? read).toUpperCase()
    let capa, detalle
    if (!it) {
      // No fue un caso: la lectura alcanzó (está en una carta, en Permitidos o en un recorrido conocido).
      const q = quienEs(read, t)
      capa = q === 'nadie' ? (balanza.truckAt(read, t) ? 'balanza' : 'leida') : '2'
      detalle = q === 'nadie' ? (capa === 'balanza' ? 'balanza (SGC)' : 'recorrido de cámaras') : q
    } else if (it.level === 'provisorio' || it.level === 'pendiente') {
      capa = '4'
      detalle = 'lectura dudosa'
    } else if (it.level === 'fuera_sistema' && it.rule !== 'no_camion') {
      capa = '4'
      detalle = it.validFormat && esGranos(it.readPlate) ? 'camión de granos sin carta' : it.validFormat ? 'sin registro' : 'sin patente legible'
    } else {
      capa = CAPA_DE_REGLA[it.rule] ?? 'otra'
      detalle = it.rule === 'no_camion' ? 'no es camión' : capa === '2' ? quienEs(it.assignedPlate ?? read, t) : it.rule
    }
    pasos.push({
      site, at: p.at, node: p.node, nodo: logicalLabel(p.node), device: p.anchorKey.split('|')[1], captures: p.captures,
      leida: read, final: isValidPlate(final) ? final : null, corregida: isValidPlate(final) && final !== read,
      capa, detalle, regla: it?.rule ?? null, motivo: it?.reason ?? null,
      // Después de una corrección, la patente vuelve a la capa 2: quién es la patente final.
      vuelveA: capa.startsWith('3') && isValidPlate(final) ? quienEs(final, t) : null,
      candidatos: (it?.candidates ?? []).slice(0, 3).map((c) => ({ plate: c.plate, similarity: c.similarity ?? null })),
    })
  }
}
for (const b of Object.values(bases)) await b.close()

const cuenta = (l, f) => l.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {})
const resumen = {
  dia: day,
  pasos: pasos.length,
  porCapa: cuenta(pasos, (x) => x.capa),
  porDetalle: cuenta(pasos, (x) => `${x.capa} · ${x.detalle}`),
  correccionesVuelvenA: cuenta(pasos.filter((x) => x.vuelveA), (x) => x.vuelveA),
  porPlanta: Object.fromEntries(['ricardone', 'san_lorenzo'].map((s) => [s, cuenta(pasos.filter((x) => x.site === s), (x) => x.capa)])),
}
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'capas.json'), JSON.stringify({ ...resumen, pasosDetalle: pasos }, null, 1))
console.log(JSON.stringify(resumen, null, 1))
console.log(`→ ${path.join(outDir, 'capas.json')}`)
