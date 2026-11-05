// Replay de un día por las capas del reconocedor (lámina «El recorrido de una captura»): cada paso de cada
// vehículo termina en una capa — 2 ¿Quién es? (carta de porte, Vehículos Permitidos: bases del back office o
// balanza, y como respaldo el SGC), 3.1 patentes parecidas, 3.2 metadatos, 3.3 banco de corregidas, 3.4 IA o 4
// alerta. Aparte, la captura errónea: texto sin formato de patente que solo llegó como alerta del DSS.
// Mismo armado que scripts/replay-pasos-dia.mjs (ensamblador + reconocedor con la hora de fin del día), pero
// con las bases del back office (MongoDB) como en el servidor y con las lecturas guardadas en data/truckflow.
// 3.2 Metadatos: como en vivo (server/dssPhotoLookup.mjs, evidencia automática), los casos elegibles se
// comparan con color/marca/tipo del DSS de la lectura y de los candidatos, pedidos al servidor 8787; el que
// pasa el umbral vuelve a correr como veredicto. METADATOS=0 lo saltea. Las consultas quedan en caché.
// Vínculo: como en vivo (server/live/vinculo/vinculoLive.mjs), scripts/vinculo/cobertura.mjs sobre el día con las
// cartas del padrón; asigna lo que quedó abierto si la probabilidad llega a 50 %. VINCULO=0 lo saltea.
// Igual que el servidor, una captura errónea (sin formato de patente, solo llegó como alerta del DSS) no va a la
// bandeja: no es alerta.
// Lote (server/plantState/loteLive.mjs): el lote de ingreso (balanza del día + camiones con carta vigente o de
// la base sin carta que se leyeron al entrar) avanza nodo por nodo con peso por tiempo de tramo y marca/color;
// lo que reconstruye con P ≥ 0,6 se aplica (regla «lote», capa 3.1), también a capturas erróneas. LOTE=0 lo saltea.
// Marca/color de cada captura: si existe data/dss-capturas/<día>.json (scripts/estado-planta/dss-capturas-camaras.mjs,
// todas las capturas del DSS), de ahí; si no, solo las que trajo la alerta. DSS_CAPTURAS=0 lo ignora.
// Recorrido objetivo (docs/RECONOCEDOR_RECORRIDO_CAPTURA.md):
// - Lote = vínculo con universo carta → base sin carta → SGC (último recurso). LOTE_UNIVERSO=0: solo cartas.
// - 3.1 compara la lectura mala con todas las patentes esperadas (cartas, bases, SGC del día). UNIVERSO_31=0: solo cartas.
// - El vínculo (3.2) mira también las capturas erróneas antes de descartarlas; las que nadie asigna son alerta.
//   VINCULO_ANTES=0: como antes (se descartan primero y no son alerta).
// - El lote viejo (balanza + recorrido por producto) queda apagado: LOTE=1 lo prende para comparar.
// Uso: node scripts/replay-capas-dia.mjs 2026-11-02 [salida]
import fs from 'node:fs'
import path from 'node:path'
import { applyIdentifications, identifyFragments, isValidPlate, journeyKeyOf, learnConfusions, nodeModelCatalog, setLearnedConfusions } from '../server/plantState/plateIdentification.mjs'
import { replayBalanzaRegistry } from '../server/plantState/balanzaRegistry.mjs'
import { getEventLiveInstantMs } from '../server/plantState/liveEventTime.mjs'
import { alertReadEvents, withAlertAttributes } from '../server/plantState/alertReads.mjs'
import { captureKey, ensamblarPasos } from '../server/plantState/pasos.mjs'
import { padronCartas } from '../server/plantState/padronCartas.mjs'
import { logicalLabel } from '../server/plantState/circuitPrefix.mjs'
import { connectBackofficeDb } from '../server/live/padron/padronDb.mjs'
import { createBackofficeIndex } from '../server/live/padron/backofficeIndex.mjs'
import { AUTO_EVIDENCE_PROBABILITY, AUTO_EVIDENCE_SAME_NODE_PROBABILITY, scoreCandidates } from '../server/plantState/identificationEvidence.mjs'
import { scoreWithNodeModel } from '../server/plantState/nodeModelScore.mjs'
import { CUENTA_AUTO_PROBABILITY } from '../server/plantState/plateIdentification.mjs'
import { applyVinculo, assignmentsFromCobertura, indexAssignments } from '../server/live/vinculo/vinculoLive.mjs'
import { applyLoteToItems, buildLiveLote, captureAttrsLookup, dssExportAttrs, loteVerdict } from '../server/plantState/loteLive.mjs'
import { finalSteps } from '../server/plantState/loteCore.mjs'
import { lecturasVistas, universoExtra31, viajesSinCarta as armarViajesSinCarta } from '../server/live/vinculo/viajesSinCarta.mjs'
import { clasificarErroneas } from '../server/plantState/erroneasConfirmadas.mjs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'

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
  carta_parecida: '3.1', vinculo: '3.1', lote: '3.1', doble_lectura: '3.1', universo: '3.1', cuenta: '3.1', busqueda_atras: '3.1', par_trasera: '3.1',
  atributos_dss: '3.2',
  corregida_antes: '3.3', confirmada_antes: '3.3', no_camion: '3.3',
  ia_imagen: '3.4',
  // Respaldo SGC: la balanza resuelve lo que no está en una carta ni en las bases (capa 2).
  leida_bien_balanza: '2', doble_lectura_balanza: '2', balanza_parecida: '2', balanza_unica: '2', acoplado_balanza: '2',
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

// Cartas del día y vecinas, Vehículos Permitidos como en el servidor (bases del back office), aprendizaje.
const notes = new Map()
for (let k = -2; k <= 1; k++) for (const n of tryJson(`data/padron/${arDay(start + 12 * 3600_000 + k * DAY_MS)}.json`)?.notes ?? []) notes.set(n.ctg, n)
const byPlate = new Map()
for (const n of notes.values()) for (const p of n.plates ?? []) byPlate.set(p, [...(byPlate.get(p) ?? []), n])
const padronMem = { lookup: (p) => byPlate.get(p) ?? [], notes: () => notes.values() }
const bases = { particulares: await connectBackofficeDb('particulares'), sin_carta: await connectBackofficeDb('sin_carta') }
const backoffice = createBackofficeIndex({ padronDb: bases, projectRoot: root, log: {} })
await backoffice.start()
const permitidos = { lookup: (p) => backoffice.lookup(p) }
const padron = padronCartas(padronMem, permitidos)
const corr = tryJson('data/padron/corregidos.json') ?? { pairs: [], real: [] }
const pairsByRead = new Map()
for (const p of corr.pairs ?? []) if (!p.readIsReal) pairsByRead.set(p.read, [...(pairsByRead.get(p.read) ?? []), p])
const realSet = new Set((corr.real ?? []).map((r) => r.plate))
setLearnedConfusions(learnConfusions(corr.pairs))
const corregidos = { realOf: (read) => [...(pairsByRead.get(read) ?? [])].sort((a, b) => b.count - a.count), isReal: (p) => realSet.has(p) }
const noCamBy = new Map((tryJson('data/padron/no-camiones.json')?.entries ?? []).map((v) => [v.plate, v]))
const noCamiones = { lookup: (p) => noCamBy.get(p) ?? null }
const catalog = nodeModelCatalog()
const balanza = replayBalanzaRegistry(day)

// ── 3.2 Metadatos: atributos del DSS por medio del servidor (misma cuenta que computeEvidence/autoEvidenceTick).
const API = (process.env.LOCAL_API ?? 'http://127.0.0.1:8787') + '/api/truckflow/camera-captures/find'
const cacheFile = path.join(outDir, 'metadatos-cache.json')
const attrsCache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {}
async function attrsAt(device, at, plate) {
  if (!device || !at) return null
  const k = `${device}|${at}|${plate}`
  if (!(k in attrsCache)) {
    try {
      const j = await (await fetch(`${API}?${new URLSearchParams({ device, at, plate })}`)).json()
      attrsCache[k] = j.found ? { plate: j.capture.plate, vehicleColor: j.capture.vehicleColor ?? null, vehicleBrand: j.capture.vehicleBrand ?? null, vehicleCategory: j.capture.vehicleCategory ?? null } : null
    } catch {
      return null
    }
  }
  return attrsCache[k]
}
async function veredictos(items) {
  const out = {}
  const cola = items.filter((it) => it.evidenceEligible && it.candidates?.[0])
  let consultados = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cola.length) {
      const item = cola.shift()
      const shown = item.candidates.filter((c) => c.similarity >= 0.4 || c.nodeProbability >= 0.5 || c.plate === item.cuenta?.plate).slice(0, 3)
      const readAttrs = await attrsAt(item.deviceCode, item.at, item.readPlate)
      const withAttrs = []
      for (const c of shown) withAttrs.push({ ...c, attrs: await attrsAt(c.photoDevice, c.photoAt, c.plate) })
      consultados++
      const scored = scoreCandidates({ readPlate: item.readPlate, validFormat: item.validFormat, readAttrs }, withAttrs)
      const attrLrOf = new Map(withAttrs.map((c, i) => [c.plate, scored.candidates[i].attrLr]))
      const pending = item.candidates.filter((c) => !c.seenAfter && c.inventory?.status === 'expected')
      const nodeModel = scoreWithNodeModel(item, (pending.length ? pending : item.candidates).map((c) => ({ ...c, attrLr: attrLrOf.get(c.plate) ?? 1 })), { ignorePlate: Boolean(item.cuenta?.ignorePlate) })
      const best = item.candidates[0]
      const top = [...scored.candidates].sort((a, b) => b.probability - a.probability)[0]
      const nmTop = [...(nodeModel?.candidates ?? [])].sort((a, b) => b.probability - a.probability)[0]
      const umbral = item.validFormat ? AUTO_EVIDENCE_SAME_NODE_PROBABILITY : AUTO_EVIDENCE_PROBABILITY
      if (top && top.plate === best.plate && top.probability >= umbral) out[item.fragmentKey] = { plate: top.plate, probability: top.probability }
      else if (nmTop && item.cuenta?.plate === nmTop.plate && nmTop.probability >= CUENTA_AUTO_PROBABILITY) out[item.fragmentKey] = { plate: nmTop.plate, probability: nmTop.probability, rule: 'cuenta' }
    }
  }))
  return { verdicts: out, consultados }
}
const metadatos = { elegibles: 0, aplicados: 0 }

// ── Lote (paso 0): viajes sin carta para el vínculo, carta → base sin carta → SGC como última instancia.
const vistas = lecturasVistas(Object.values(lecturas).flatMap((s) => s.ev), Object.values(lecturas).flatMap((s) => s.al), start - 6 * 3600_000, end)
const conCarta = (p) => padronMem.lookup(p).length > 0
const viajesSinCarta = armarViajesSinCarta({ vistas, desdeMs: start - 6 * 3600_000, hastaMs: end, conCarta, baseDe: (p) => backoffice.lookup(p)?.backoffice.base ?? null, visits: balanza.visits ?? [] })
/** Estado de cada paso esperado de los viajes del lote (vínculo): cámara, reconstruido, deducido, falta… */
function resumenLote(cob) {
  const porOrigen = {}
  for (const tr of cob.camiones ?? []) {
    const o = (porOrigen[tr.origen ?? 'carta'] ??= { viajes: 0 })
    o.viajes++
    for (const st of Object.values(tr.status ?? {})) o[st] = (o[st] ?? 0) + 1
  }
  return porOrigen
}
let loteVinculo = null

// ── Vínculo del día (mismo script y entradas que en vivo: lecturas guardadas y cartas del padrón, sin DSS).
let vinculoIndex = null
if (process.env.VINCULO !== '0') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vinculo-replay-'))
  try {
    fs.writeFileSync(path.join(tmp, 'cartas.json'), JSON.stringify([...notes.values()]))
    fs.writeFileSync(path.join(tmp, 'extra.json'), JSON.stringify(process.env.LOTE_UNIVERSO === '0' ? [] : viajesSinCarta))
    execFileSync(process.execPath, ['--max-old-space-size=8192', path.join(root, 'scripts', 'vinculo', 'cobertura.mjs'), day, day], {
      cwd: root, stdio: 'ignore', env: { ...process.env, VINCULO_CARTAS: path.join(tmp, 'cartas.json'), VINCULO_EXTRA: path.join(tmp, 'extra.json'), VINCULO_OUT: path.join(tmp, 'out'), VINCULO_SIN_DSS: '1' },
    })
    const cob = JSON.parse(fs.readFileSync(path.join(tmp, 'out', 'cobertura.json'), 'utf8'))
    vinculoIndex = indexAssignments(assignmentsFromCobertura(cob))
    loteVinculo = resumenLote(cob)
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'cobertura.json'), JSON.stringify(cob))
  } catch (e) {
    console.warn(`[vínculo] no corrió: ${e instanceof Error ? e.message : e}`)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** Quién es la patente final: carta, base de particulares, base sin carta o nadie. */
function quienEs(plate, t) {
  if (!isValidPlate(plate)) return 'sin patente'
  const h = padron.at(plate, t)
  if (h?.source === 'carta') return 'carta de porte'
  if (h?.source === 'permitido') {
    const b = backoffice.lookup(plate)
    return b?.backoffice.base === 'particulares' ? 'base particulares' : 'base sin carta'
  }
  return 'nadie'
}
// 3.1 · Primera corrección contra todas las patentes esperadas: cartas vigentes, bases y SGC del día.
const extraUniverso = process.env.UNIVERSO_31 === '0' ? () => [] : universoExtra31(viajesSinCarta, backoffice.todas(), vistas)
const padron31 = { ...padron, platesAt: (t) => [...padron.platesAt(t), ...extraUniverso(t)] }
const esGranos = (p) => backoffice.esCamionDeGranos(p) || padronMem.lookup(p).length > 0

const pasos = []
const acopladoChasis = (plate, t) => { const h = padron.at(plate, t); return h?.role === 'acoplado' && h.source === 'carta' ? h.chasis : null }
const ensambles = {}
for (const site of ['ricardone', 'san_lorenzo']) {
  const { ev, al } = lecturas[site]
  ensambles[site] = ensamblarPasos(withAlertAttributes([...ev, ...alertReadEvents(al, ev)], al).filter((e) => getEventLiveInstantMs(e) < end), { acopladoChasis })
}
// Todas las capturas del DSS del día (hora de cámara + 240 s = hora del feed), para marca/color de cada lectura.
// Primero el export del DSS (data/dss-export/<desde>_<dd hasta>/capturas.csv, «Vehicle Search»).
let dssAttrs = process.env.DSS_CAPTURAS === '0' ? null : dssExportAttrs(day, day, root)
const dssFile = path.join(root, 'data', 'dss-capturas', `${day}.json`)
if (!dssAttrs && process.env.DSS_CAPTURAS !== '0' && fs.existsSync(dssFile)) {
  const byDev = new Map()
  for (const [dev, rows] of Object.entries(JSON.parse(fs.readFileSync(dssFile, 'utf8')).capturas ?? {})) {
    byDev.set(dev.toLowerCase(), rows.map((r) => ({ t: Date.parse(r.at) + 240_000, plate: String(r.plate ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''), vehicleColor: r.vehicleColor, vehicleBrand: r.vehicleBrand, vehicleCategory: r.vehicleCategory })).sort((a, b) => a.t - b.t))
  }
  dssAttrs = captureAttrsLookup(byDev)
}
// El lote recorre las dos plantas juntas (un camión pasa de Ricardone al puerto).
const lote = process.env.LOTE !== '1' ? null : buildLiveLote({
  events: [...ensambles.ricardone.events, ...ensambles.san_lorenzo.events],
  nowMs: end,
  balanza,
  attrsAt: dssAttrs,
  conocido: (p, t) => Boolean(padron.cartaAt(p, t)) || backoffice.lookup(p)?.backoffice.base === 'sin_carta',
  root,
})
// Como en lote.mjs: cada paso esperado de cada camión del lote que entró ese día, con su estado final.
const pasosLote = {}
if (lote) {
  for (const m of lote.lote) {
    if (m.ing < start || m.ing >= end || !m.status) continue
    for (const e of finalSteps(m, lote.front, end)) pasosLote[e] = (pasosLote[e] ?? 0) + 1
  }
}
const loteResumen = lote ? { dssCapturas: Boolean(dssAttrs), camiones: lote.lote.length, porFuente: lote.lote.reduce((m, x) => ((m[x.source] = (m[x.source] ?? 0) + 1), m), {}), pasosDelLote: pasosLote } : null
for (const site of ['ricardone', 'san_lorenzo']) {
  const ens = ensambles[site]
  const other = site === 'ricardone' ? 'san_lorenzo' : 'ricardone'
  const ctxBase = { catalog, balanza, padron: padron31, corregidos, noCamiones, otherSiteEvents: lecturas[other].ev.filter((e) => getEventLiveInstantMs(e) < end) }
  let { items } = identifyFragments(ens.events, end, ctxBase)
  if (process.env.METADATOS !== '0') {
    const { verdicts, consultados } = await veredictos(items.filter((it) => Date.parse(it.at) >= start))
    metadatos.elegibles += consultados
    metadatos.aplicados += Object.keys(verdicts).length
    if (Object.keys(verdicts).length) items = identifyFragments(ens.events, end, { ...ctxBase, evidenceVerdicts: verdicts }).items
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(cacheFile, JSON.stringify(attrsCache))
  }
  // El lote, antes de descartar las capturas erróneas: puede ubicarlas por el paso pendiente.
  if (lote) items = applyLoteToItems(items, lote, site)
  // Lectura sin formato que solo llegó como alerta. Objetivo: el vínculo la mira antes y, si nadie la asigna,
  // es alerta. Antes (VINCULO_ANTES=0): se descartaba primero, como hoy en el servidor.
  const esErronea = (it) => String(it.fragmentKey).startsWith('alert-') && !it.assignedPlate && !it.decision && !it.validFormat
  const antes = process.env.VINCULO_ANTES !== '0'
  if (antes && vinculoIndex) items = applyVinculo(items, vinculoIndex, ens.events, { minProb: 0.5, timeOf: getEventLiveInstantMs })
  const ilegibles = new Set(items.filter(esErronea).map((it) => it.fragmentKey))
  if (!antes) {
    items = items.filter((it) => !ilegibles.has(it.fragmentKey))
    if (vinculoIndex) items = applyVinculo(items, vinculoIndex, ens.events, { minProb: 0.5, timeOf: getEventLiveInstantMs })
  }
  const itemBy = new Map(items.map((it) => [it.fragmentKey, it]))
  const evBy = new Map(ens.events.map((e) => [captureKey(e), e]))
  const identified = new Map(applyIdentifications(ens.events, items).map((e) => [captureKey(e), e]))
  for (const p of ens.pasos) {
    const t = Date.parse(p.at)
    if (t < start || t >= end) continue
    const e0 = evBy.get(p.anchorKey)
    const fk = e0 ? journeyKeyOf(e0, getEventLiveInstantMs(e0)) : null
    const it = fk ? itemBy.get(fk) : null
    const read = String(p.plate ?? '').toUpperCase()
    const final = String(identified.get(p.anchorKey)?.truckPlate ?? read).toUpperCase()
    let capa, detalle, loteDiag = null
    if (antes && it && ilegibles.has(fk)) {
      capa = '4'
      detalle = 'lectura ilegible sin asignar'
    } else if (!it && ilegibles.has(fk)) {
      capa = 'captura_erronea'
      // ¿El vínculo la habría asignado si se le diera antes de descartarla?
      const v = vinculoIndex?.at(e0.deviceCode, getEventLiveInstantMs(e0))
      detalle = v?.plate && v.prob >= 0.5 ? 'captura errónea que el vínculo asignaría' : 'captura errónea'
      // Por qué el lote no la ubicó.
      if (lote) {
        const lv = loteVerdict(lote, fk)
        const best = lv?.caps.map((c) => c.lote).filter((x) => x?.via === 'sin_decidir').sort((a, b) => (b.P ?? 0) - (a.P ?? 0))[0]
        loteDiag = !lv ? (lote.byKey.has(fk) ? 'el lote no la miró' : 'fuera del lote (nodo sin modelo o trasera)') : lv.member ? 'el lote la asignó pero no se aplicó (no se parece)' : best ? `sin decidir (P ${Math.round((best.P ?? 0) * 100)} %)` : 'sin candidato en el lote'
      }
    } else if (!it) {
      // No fue un caso: la lectura alcanzó (está en una carta, en Permitidos o en un recorrido conocido).
      const q = quienEs(read, t)
      const sgc = q === 'nadie' && balanza.truckAt(read, t)
      capa = q === 'nadie' && !sgc ? 'leida' : '2'
      detalle = sgc ? 'respaldo SGC' : q === 'nadie' ? 'recorrido de cámaras' : q
    } else if (it.level === 'provisorio' || it.level === 'pendiente') {
      capa = '4'
      detalle = 'lectura dudosa'
    } else if (it.level === 'fuera_sistema' && it.rule !== 'no_camion') {
      capa = '4'
      detalle = it.validFormat && esGranos(it.readPlate) ? 'camión de granos sin carta' : it.validFormat ? 'sin registro' : 'sin patente legible'
    } else {
      capa = CAPA_DE_REGLA[it.rule] ?? 'otra'
      detalle = it.rule === 'no_camion' ? 'no es camión' : CAPA_DE_REGLA[it.rule] === '2' && /balanza/.test(it.rule) ? 'respaldo SGC' : capa === '2' ? quienEs(it.assignedPlate ?? read, t) : it.rule
    }
    pasos.push({
      site, at: p.at, node: p.node, nodo: logicalLabel(p.node), device: p.anchorKey.split('|')[1], captures: p.captures,
      leida: read, final: isValidPlate(final) ? final : null, corregida: isValidPlate(final) && final !== read,
      capa, detalle, loteDiag, regla: it?.rule ?? null, motivo: it?.reason ?? null,
      // Después de una corrección, la patente vuelve a la capa 2: quién es la patente final.
      vuelveA: capa.startsWith('3') && isValidPlate(final) ? quienEs(final, t) : null,
      candidatos: (it?.candidates ?? []).slice(0, 3).map((c) => ({ plate: c.plate, similarity: c.similarity ?? null })),
    })
  }
}
for (const b of Object.values(bases)) await b.close()

// Final: la ilegible sin asignar junto a un paso guardado de la misma cámara es lectura errónea confirmada;
// el resto es alerta y las seguidas en la misma cámara van juntas (server/plantState/erroneasConfirmadas.mjs).
if (process.env.ERRONEA_CONFIRMADA !== '0') {
  const ileg = pasos.filter((x) => x.detalle === 'lectura ilegible sin asignar')
  const guardados = pasos.filter((x) => /^(2|3\.\d)$/.test(x.capa)).map((x) => ({ device: x.device, node: x.node, site: x.site, t: Date.parse(x.at) }))
  const { confirmadas, alertas } = clasificarErroneas(ileg.map((x, i) => ({ key: String(i), device: x.device, node: x.node, site: x.site, t: Date.parse(x.at) })), guardados)
  const agrupadas = new Set(alertas.flatMap((a) => a.agrupa))
  ileg.forEach((x, i) => {
    if (confirmadas.has(String(i))) Object.assign(x, { capa: 'lectura_erronea', detalle: 'repetición de paso guardado' })
    else if (agrupadas.has(String(i))) Object.assign(x, { capa: '4', detalle: 'ilegible en la misma alerta' })
  })
}

const cuenta = (l, f) => l.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {})
const resumen = {
  dia: day,
  pasos: pasos.length,
  porCapa: cuenta(pasos, (x) => x.capa),
  alertas: pasos.filter((x) => x.capa === '4' && x.detalle !== 'ilegible en la misma alerta').length,
  porDetalle: cuenta(pasos, (x) => `${x.capa} · ${x.detalle}`),
  correccionesVuelvenA: cuenta(pasos.filter((x) => x.vuelveA), (x) => x.vuelveA),
  metadatos,
  lote: loteResumen,
  loteVinculo,
  viajesSinCarta: { base: viajesSinCarta.filter((x) => x.origen === 'base').length, sgc: viajesSinCarta.filter((x) => x.origen === 'sgc').length },
  porPlanta: Object.fromEntries(['ricardone', 'san_lorenzo'].map((s) => [s, cuenta(pasos.filter((x) => x.site === s), (x) => x.capa)])),
}
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'capas.json'), JSON.stringify({ ...resumen, pasosDetalle: pasos }, null, 1))
console.log(JSON.stringify(resumen, null, 1))
console.log(`→ ${path.join(outDir, 'capas.json')}`)
