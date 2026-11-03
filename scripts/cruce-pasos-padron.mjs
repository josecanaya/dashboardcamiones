// Cruce de la lista de pasos por camión (scripts/replay-pasos-dia.mjs) con el padrón del flujo real: cartas de
// porte, Vehículos Permitidos y los que llevan remito (despachos y descargas sin carta). El sistema de camiones
// (SGC) no entra: es control de tiempos, no dice quién puede estar en planta.
// Para cada vehículo sin carta ni Permitido dice si es un chasis o acoplado de una carta vigente, un Permitido,
// uno con remito, una lectura parecida de alguno de ellos o si queda fuera del padrón.
// Uso: node scripts/cruce-pasos-padron.mjs 2026-11-02
import fs from 'node:fs'
import path from 'node:path'
import { plateSimilarity } from '../server/plantState/plateIdentification.mjs'
import { padronCartas } from '../server/plantState/padronCartas.mjs'

const root = process.cwd()
const day = process.argv[2] ?? '2026-11-02'
const dir = path.join(root, 'reportes', 'reconocimiento-pasos', day)
const lista = JSON.parse(fs.readFileSync(path.join(dir, 'pasos-por-camion.json'), 'utf8'))
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
const DAY_MS = 86_400_000
const arDay = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
const t = (hhmm) => Date.parse(`${day}T${hhmm}:00-03:00`)

// 1. Cartas de porte del día y vecinos (la vigencia mira ±1 día de turno).
const notes = new Map()
for (let k = -2; k <= 1; k++) {
  const f = `data/padron/${arDay(Date.parse(`${day}T12:00:00-03:00`) + k * DAY_MS)}.json`
  if (fs.existsSync(path.join(root, f))) for (const n of json(f).notes) notes.set(n.ctg, n)
}
const byPlate = new Map()
for (const n of notes.values()) for (const p of n.plates ?? []) byPlate.set(p, [...(byPlate.get(p) ?? []), n])
const cartas = padronCartas({ lookup: (p) => byPlate.get(p) ?? [], notes: () => notes.values() })

// 2. Vehículos Permitidos y 3. los que llevan remito: la lista de data/padron separada por categoría (los
// productos de balanza sin carta son movimientos con remito), más las autorizaciones cargadas a mano.
const REMITO = new Set(['varios', 'alcohol_burlanda', 'combustible', 'glicerina', 'insumos', 'forraje', 'biomasa', 'residuos'])
const permitidos = new Map()
const remito = new Map()
for (const e of fs.existsSync(path.join(root, 'data/padron/vehiculos-permitidos.json')) ? json('data/padron/vehiculos-permitidos.json').entries : []) {
  ;(REMITO.has(e.category) ? remito : permitidos).set(e.plate, { plate: e.plate, role: e.role, chasis: e.chasis ?? null, category: e.category, ultimo: e.lastSeen ?? null })
}
const aut = fs.existsSync(path.join(root, 'data/padron/autorizaciones.json')) ? json('data/padron/autorizaciones.json').autorizaciones ?? [] : []
for (const a of aut) {
  if (!a.activa && a.activa !== undefined) continue
  const desde = a.desde ?? a.vigenciaDesde ?? '0000'
  const hasta = a.hasta ?? a.vigenciaHasta ?? '9999'
  if (day < String(desde).slice(0, 10) || day > String(hasta).slice(0, 10)) continue
  const dest = ['carga', 'descarga'].includes(a.tipo) ? remito : permitidos
  for (const p of [a.patente, a.acoplado].filter(Boolean)) dest.set(p, { plate: p, role: p === a.acoplado ? 'acoplado' : 'chasis', chasis: a.patente, category: a.tipo, ultimo: day })
}

const etiqueta = { carta: 'carta de porte', permitido: 'Permitido', remito: 'con remito' }
/** Universo donde se busca la patente parecida, a la hora de la lectura. */
function universo(ms) {
  const out = cartas.platesAt(ms).map((x) => ({ plate: x.plate, base: 'carta', role: x.role, chasis: x.chasis, detalle: `CTG ${x.ctg}` }))
  for (const [m, base] of [[permitidos, 'permitido'], [remito, 'remito']]) for (const e of m.values()) out.push({ plate: e.plate, base, role: e.role, chasis: e.chasis ?? e.plate, detalle: e.category })
  return out
}

const objetivo = lista.camiones.filter((c) => !c.tipo.startsWith('carta') && !c.tipo.startsWith('Permitido') && c.tipo !== 'no camión')
const filas = objetivo.map((c) => {
  const a = t(c.primero)
  const hitCarta = cartas.cartaAt(c.patente, a) ? cartas.at(c.patente, a) : null
  const p = permitidos.get(c.patente)
  const r = remito.get(c.patente)
  let quien
  let detalle = ''
  if (hitCarta) {
    quien = hitCarta.role === 'acoplado' ? `acoplado de ${hitCarta.chasis} (carta)` : 'chasis de una carta'
    detalle = `CTG ${hitCarta.ctg} · ${hitCarta.grain ?? ''}`
  } else if (p || r) {
    const e = p ?? r
    quien = `${etiqueta[p ? 'permitido' : 'remito']}${e.role === 'acoplado' ? ` (acoplado de ${e.chasis})` : ''}`
    detalle = `${e.category}${e.ultimo ? ` · último ${e.ultimo}` : ''}`
  } else {
    const cand = []
    for (const u of universo(a)) {
      const s = plateSimilarity(c.patente, u.plate)
      // Contra Permitidos y remito (1.700 patentes de todo el historial) solo la parecida fuerte: lo dudoso es ruido.
      if (s >= 0.8 || (s >= 0.65 && u.base === 'carta')) cand.push({ ...u, s })
    }
    cand.sort((x, y) => y.s - x.s)
    if (cand.length) {
      const k = cand[0]
      quien = `${k.s >= 0.8 ? 'lectura parecida' : 'parecido dudoso'} a ${k.plate} (${etiqueta[k.base]}${k.role === 'acoplado' ? `, acoplado de ${k.chasis}` : ''})`
      detalle = `${Math.round(k.s * 100)} % · ${k.detalle}${cand.length > 1 ? ` · otras: ${cand.slice(1, 3).map((x) => x.plate).join(', ')}` : ''}`
    } else {
      quien = 'fuera del padrón'
    }
  }
  return { patente: c.patente, antes: c.tipo, plantas: c.plantas, pasos: c.pasos, primero: c.primero, ultimo: c.ultimo, quien, detalle, recorrido: c.recorrido, fotos: c.fotos ?? [] }
})

const grupo = (q) => q.replace(/ a \w+ \(.*$/, '').replace(/ \(.*$/, '').replace(/^acoplado de \w+/, 'acoplado de una carta')
const resumen = {}
for (const f of filas) resumen[`${f.antes} → ${grupo(f.quien)}`] = (resumen[`${f.antes} → ${grupo(f.quien)}`] ?? 0) + 1
filas.sort((x, y) => grupo(x.quien).localeCompare(grupo(y.quien)) || y.pasos - x.pasos)
const cols = ['patente', 'antes', 'quien', 'detalle', 'plantas', 'pasos', 'primero', 'ultimo', 'recorrido']
fs.writeFileSync(path.join(dir, 'cruce-padron.csv'), `﻿${[cols.join(';'), ...filas.map((f) => cols.map((k) => String(f[k]).replace(/;/g, ',')).join(';'))].join('\n')}\n`)
fs.writeFileSync(path.join(dir, 'cruce-padron.json'), JSON.stringify({ dia: day, cartas: notes.size, permitidos: permitidos.size, remito: remito.size, autorizaciones: aut.length, resumen, filas }, null, 1))
console.log(JSON.stringify({ cartas: notes.size, permitidos: permitidos.size, remito: remito.size, autorizaciones: aut.length, vehiculos: filas.length, resumen }, null, 1))
