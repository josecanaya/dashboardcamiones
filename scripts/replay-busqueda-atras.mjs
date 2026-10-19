// Replay de la búsqueda hacia atrás automática (autoPredecessorLinks) y del paso deducido (deduceSkippedSteps).
//
// Búsqueda hacia atrás, dos pruebas:
//   1. Patente borrada (como scripts/demostracion/lote.mjs): a 1 de cada 4 camiones bien leídos en la
//      entrada de Ricardone que siguen en planta se le separan las lecturas de entrada en un viaje suelto
//      (patente vacía o cambiada). Acierto = el vínculo automático va al camión verdadero.
//   2. Decisiones de operaciones (data/plate-identification-log.jsonl): link/nolink y confirmaciones de
//      lecturas de entrada. Las uniones automáticas sobre lecturas reales sin decisión se cuentan aparte.
// Paso deducido: en camiones bien leídos se borra un nodo intermedio y se mira si se deduce ese nodo y
// solo ese (precisión) y cuántos se recuperan (cobertura); además, en los huecos reales, cuántos pasos
// se deducirían.
// Uso: node scripts/replay-busqueda-atras.mjs [días separados por coma] [umbral=0.95] [nuevo=0.3]
import fs from 'node:fs'
import path from 'node:path'
import { autoPredecessorLinks, buildJourneys, deduceSkippedSteps, identifyFragments, isValidPlate, nodeModelCatalog } from '../server/plantState/plateIdentification.mjs'
import { replayBalanzaRegistry } from '../server/plantState/balanzaRegistry.mjs'
import { getEventLiveInstantMs } from '../server/plantState/liveEventTime.mjs'

const root = process.cwd()
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
const ALL = Array.from({ length: 14 }, (_, i) => addDays('2026-10-01', i))
const DAYS = process.argv[2] ? process.argv[2].split(',') : ALL
const THRESHOLD = Number(process.argv[3] ?? 0.95)
const NEW_PRIOR = Number(process.argv[4] ?? 0.3)
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^﻿/, ''))
const SITE_OF = (e) => (String(e.deviceCode ?? '').startsWith('SLZ') ? 'san_lorenzo' : 'ricardone')
const ENTRY = new Set(['S0', 'S1'])
const catalog = nodeModelCatalog()

const logs = fs.readFileSync(path.join(root, 'data/plate-identification-log.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
/** Verdad de operaciones por viaje: plate = es de ese camión; notPlates = no es de esos. */
const truth = new Map()
const T = (k) => truth.get(k) ?? truth.set(k, { plate: null, notPlates: new Set(), notTruck: false }).get(k)
for (const r of logs) {
  if (r.site && r.site !== 'ricardone') continue
  if (r.action === 'link' && r.journeyKey) T(r.journeyKey).plate = r.plate
  if (r.action === 'nolink' && r.journeyKey) T(r.journeyKey).notPlates.add(r.plate)
  if (r.action === 'confirm' && r.fragmentKey && r.plate && r.source !== 'automatic_relevance') T(r.fragmentKey).plate = r.plate
  if (r.action === 'reject' && r.fragmentKey) T(r.fragmentKey).notTruck = true
}

const plateOf = (e) => String(e?.normalizedPlate || e?.truckPlate || e?.rawTruckPlate || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
const garble = (p, seed) => {
  const s = p.split('')
  const i = seed % s.length
  const j = (seed * 7 + 3) % s.length
  s[i] = /\d/.test(s[i]) ? String((Number(s[i]) + 3) % 10) : String.fromCharCode(65 + ((s[i].charCodeAt(0) - 65 + 5) % 26))
  if (j !== i) s[j] = /\d/.test(s[j]) ? String((Number(s[j]) + 7) % 10) : String.fromCharCode(65 + ((s[j].charCodeAt(0) - 65 + 11) % 26))
  return s.join('')
}
/** Una letra cambiada por otra no confundible (el peor caso de una letra: MFY738/MFY788). */
const oneLetter = (p, seed) => {
  const s = p.split('')
  const i = seed % s.length
  s[i] = /\d/.test(s[i]) ? String((Number(s[i]) + 4) % 10) : String.fromCharCode(65 + ((s[i].charCodeAt(0) - 65 + 9) % 26))
  return s.join('')
}
const ALL_VARIANTS = { vacia: () => '', unaLetra: oneLetter, cambiada: garble, parcial: (p) => p.slice(2) }
const VARIANTS = process.env.REPLAY_VARIANTS ? Object.fromEntries(process.env.REPLAY_VARIANTS.split(',').map((k) => [k, ALL_VARIANTS[k]])) : ALL_VARIANTS

const res = {
  borrada: Object.fromEntries(Object.keys(VARIANTS).map((v) => [v, { n: 0, bien: 0, mal: 0, sinUnir: 0, errores: [] }])),
  reales: { auto: 0, conDecision: 0, bien: 0, mal: 0, sinDecision: 0, errores: [], ejemplos: [] },
  placebo: { necesitan: 0, conSuelta: 0, corrida: 0 },
  deducido: { pruebas: 0, deducidoBien: 0, deducidoMal: 0, nada: 0, errores: {}, porNodoReal: {}, huecosReales: 0, pasosDeducidosReales: 0 },
}

for (const day of DAYS) {
  const events = new Map()
  for (const n of [-1, 0]) {
    const f = `data/truckflow/${addDays(day, n)}/event-list.json`
    if (!fs.existsSync(path.join(root, f))) continue
    const obj = json(f)
    for (const e of Array.isArray(obj) ? obj : obj.records ?? []) if (!e.inferred && !e.manualCorrection && e.eventCategory === 'physical' && SITE_OF(e) === 'ricardone') events.set(e.id ?? `${e.journeyUid}|${e.deviceCode}|${e.occurredAt}`, e)
  }
  if (!events.size) continue
  const end = Date.parse(day + 'T23:59:59-03:00')
  const dayStart = Date.parse(day + 'T00:00:00-03:00')
  const base = [...events.values()].filter((e) => { const t = getEventLiveInstantMs(e); return t >= end - 48 * 3600000 && t <= end })
  const bz = replayBalanzaRegistry(day)
  const opts = { threshold: THRESHOLD, newPrior: NEW_PRIOR }
  const assignedKeys = (evs) => identifyFragments(evs, end, { catalog, balanza: bz }).items.filter((i) => i.level === 'casi_seguro').map((i) => i.fragmentKey)

  // ── Lecturas reales ──
  // Fragmentos que el reconocedor ya asigna solo (se calcula una vez por día; las pruebas de patente borrada lo reusan).
  const assignedBase = assignedKeys(base)
  for (const l of autoPredecessorLinks(base, end, { balanza: bz, site: 'ricardone', excludeKeys: assignedBase, options: opts })) {
    if (!l.auto || l.at < new Date(dayStart).toISOString()) continue
    res.reales.auto++
    const t = truth.get(l.journeyKey)
    if (res.reales.ejemplos.length < 40) res.reales.ejemplos.push(`${l.at.slice(0, 16)} ${l.readPlate} → ${l.plate} ${Math.round(l.probability * 100)}%`)
    if (!t || (!t.plate && !t.notTruck && !t.notPlates.size)) { res.reales.sinDecision++; continue }
    res.reales.conDecision++
    if (t.plate === l.plate) res.reales.bien++
    else if (t.plate || t.notTruck || t.notPlates.has(l.plate)) { res.reales.mal++; res.reales.errores.push(`${day} ${l.readPlate} → ${l.plate} (operaciones: ${t.plate ?? (t.notTruck ? 'no es camión' : 'no es ' + l.plate)})`) }
    else res.reales.sinDecision++
  }

  // ── Placebo de hora: lecturas sueltas a la hora del alta vs. corridas ±15…60 min (solo por hora) ──
  const journeys = buildJourneys(base, end)
  {
    const excl = new Set(assignedBase)
    const orph = journeys.filter((j) => !excl.has(j.key) && j.rows.every((r) => ENTRY.has(r.logical)) && !(isValidPlate(j.plate) && bz.truckAt(j.plate, j.rows[0].t)))
    const W = { S1: [-6, 2], S0: [-17, 0] }
    const hits = (ing) => orph.filter((o) => o.rows.some((r) => { const d = (r.t - ing) / 60000; return d >= W[r.logical][0] && d <= W[r.logical][1] })).length
    for (const j of journeys) {
      if (!isValidPlate(j.plate) || ENTRY.has(j.rows[0].logical) || j.rows[0].t < dayStart) continue
      const v = bz.truckAt(j.plate, j.rows[0].t)
      if (!v || journeys.some((o) => o.plate === j.plate && o.rows.some((r) => ENTRY.has(r.logical) && Math.abs(r.t - v.ingresoMs) <= 3600000))) continue
      res.placebo.necesitan++
      res.placebo.conSuelta += hits(v.ingresoMs) > 0 ? 1 : 0
      for (const s of [-60, -45, -30, -15, 15, 30, 45, 60]) res.placebo.corrida += (hits(v.ingresoMs + s * 60000) > 0 ? 1 : 0) / 8
    }
  }

  // ── Patente borrada ──
  const targets = journeys.filter((j) => isValidPlate(j.plate) && j.rows[0].t >= dayStart && ENTRY.has(j.rows[0].logical) && j.rows.some((r) => !ENTRY.has(r.logical)) && bz.truckAt(j.plate, j.rows[0].t))
  for (const [variant, fn] of Object.entries(VARIANTS)) {
    for (let k = 0; k < 4; k++) {
      const masked = new Map()
      targets.forEach((j, i) => { if (i % 4 === k) masked.set(j.key, { plate: j.plate, read: fn(j.plate, i) }) })
      const evs = base.map((e) => {
        const t = getEventLiveInstantMs(e)
        const uid = String(e.journeyUid ?? '').trim()
        const m = masked.get(uid)
        if (!m) return e
        const j = journeys.find((x) => x.key === uid)
        // Solo las lecturas de entrada antes de la primera lectura a mitad de circuito.
        const firstMid = j.rows.find((r) => !ENTRY.has(r.logical))?.t ?? Infinity
        if (t >= firstMid || !ENTRY.has(j.rows.find((r) => r.t === t)?.logical ?? '')) return e
        return { ...e, journeyUid: `mask:${uid}`, normalizedPlate: m.read, truckPlate: m.read, rawTruckPlate: m.read }
      })
      const links = autoPredecessorLinks(evs, end, { balanza: bz, site: 'ricardone', excludeKeys: assignedBase, options: opts })
      const o = res.borrada[variant]
      for (const [uid, m] of masked) {
        o.n++
        const l = links.find((x) => x.journeyKey === `mask:${uid}` && x.auto)
        if (!l) o.sinUnir++
        else if (l.plate === m.plate) o.bien++
        else { o.mal++; o.errores.push(`${day} ${m.plate} (leída «${m.read}») → ${l.plate} ${Math.round(l.probability * 100)}%`) }
      }
      // Lecturas borradas que terminaron unidas a otro camión (por otro camino que la búsqueda de su dueño).
    }
  }

  // ── Paso deducido ──
  for (const j of journeys) {
    if (!isValidPlate(j.plate) || j.rows[0].t < dayStart) continue
    const seq = []
    for (const r of j.rows) if (seq[seq.length - 1] !== r.logical) seq.push(r.logical)
    if (new Set(seq).size !== seq.length) continue // vueltas: fuera de la prueba
    // Huecos reales.
    const real = deduceSkippedSteps(seq, catalog)
    res.deducido.huecosReales += real.length ? 1 : 0
    res.deducido.pasosDeducidosReales += real.length
    for (const x of real) res.deducido.porNodoReal[x.node] = (res.deducido.porNodoReal[x.node] ?? 0) + 1
    // La prueba solo usa recorridos completos (sin ningún hueco propio): ahí se sabe qué pasos hizo.
    if (real.length) continue
    // Borrar cada nodo intermedio de a uno.
    for (let i = 1; i < seq.length - 1; i++) {
      const hidden = seq[i]
      const without = [...seq.slice(0, i), ...seq.slice(i + 1)]
      const d = deduceSkippedSteps(without, catalog).filter((x) => x.after === seq[i - 1] && x.before === seq[i + 1]).map((x) => x.node)
      res.deducido.pruebas++
      if (!d.length) res.deducido.nada++
      else if (d.length === 1 && d[0] === hidden) res.deducido.deducidoBien++
      else {
        res.deducido.deducidoMal++
        const k = `${seq[i - 1]}>${hidden}>${seq[i + 1]} dedujo ${d.join('+')}`
        res.deducido.errores[k] = (res.deducido.errores[k] ?? 0) + 1
      }
    }
  }
  process.stderr.write(`${day} ok\n`)
}
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)} %` : '—')
for (const o of Object.values(res.borrada)) { o.acierto = pct(o.bien, o.bien + o.mal); o.cobertura = pct(o.bien, o.n); o.errores = o.errores.slice(0, 15) }
res.reales.acierto = pct(res.reales.bien, res.reales.bien + res.reales.mal)
res.deducido.acierto = pct(res.deducido.deducidoBien, res.deducido.deducidoBien + res.deducido.deducidoMal)
res.deducido.cobertura = pct(res.deducido.deducidoBien, res.deducido.pruebas)
res.deducido.errores = Object.entries(res.deducido.errores).sort((a, b) => b[1] - a[1]).slice(0, 15)
res.placebo.precisionSoloHora = pct(res.placebo.conSuelta - res.placebo.corrida, res.placebo.conSuelta)
console.log(JSON.stringify({ dias: DAYS, umbral: THRESHOLD, nuevo: NEW_PRIOR, ...res }, null, 1))
