// Cruce de la lista de pasos por camión (scripts/replay-pasos-dia.mjs) con el sistema de camiones (SGC):
// para los vehículos sin carta / Permitido / balanza y los camiones con carta de un solo paso, dice quién es
// cada uno según el SGC del día y los vecinos (camión, acoplado de otro camión, lectura parecida de un camión
// en planta a esa hora, o fuera del sistema).
// Uso: node scripts/cruce-pasos-sgc.mjs 2026-11-02
import fs from 'node:fs'
import path from 'node:path'
import { plateSimilarity } from '../server/plantState/plateIdentification.mjs'

const root = process.cwd()
const day = process.argv[2] ?? '2026-11-02'
const dir = path.join(root, 'reportes', 'reconocimiento-pasos', day)
const lista = JSON.parse(fs.readFileSync(path.join(dir, 'pasos-por-camion.json'), 'utf8'))
const DAY_MS = 86_400_000
const shift = (n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const norm = (p) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
/** Hora local del SGC (sin zona) → ms. */
const localMs = (s) => (s ? Date.parse(`${String(s).slice(0, 19)}-03:00`) : NaN)
const PLANTA = { 'TERMINAL DE EMBARQUE': 'Puerto SL', TERMINAL_EMBARQUE: 'Puerto SL', RICARDONE: 'Ricardone', 'PLANTA SAN LORENZO': 'Ricardone', AVELLANEDA: 'Avellaneda', 'PLANTA AVELLANEDA': 'Avellaneda', RENOPACK: 'Renopack', LOS_CORRALES_DE_NICANOR: 'Los Corrales', 'LOS CORRALES DE NICANOR': 'Los Corrales' }

// Visitas del SGC: ingresos (store horario) y movimientos, días −1 a +1.
const visitas = []
const vistos = new Set()
for (const d of [shift(-1), shift(0), shift(1)]) {
  const f = path.join(root, 'data', 'sgc', d, 'ingresos.json')
  if (fs.existsSync(f)) {
    for (const r of Object.values(JSON.parse(fs.readFileSync(f, 'utf8')))) {
      const id = `sgc-${r.NROINGRESO}`
      if (vistos.has(id)) continue
      vistos.add(id)
      visitas.push({ id, camion: norm(r.PATENTECAMION), acoplado: norm(r.PATENTEACOPLADO), producto: r.PRODUCTO ?? '', planta: PLANTA[r.PLANTA] ?? r.PLANTA, ingreso: localMs(r.FECHAINGRESO), salida: localMs(r.FECHASALIDA), baja: r.BAJA ?? null })
    }
  }
  const m = path.join(root, 'data', 'movimientos', d, 'movimientos.json')
  if (fs.existsSync(m)) {
    const doc = JSON.parse(fs.readFileSync(m, 'utf8'))
    for (const r of Array.isArray(doc) ? doc : Object.values(doc).find(Array.isArray) ?? []) {
      const id = `sgc-${r.ingreso_id}`
      if (r.ingreso_id && vistos.has(id)) continue
      vistos.add(id)
      visitas.push({ id, camion: norm(r.plate_normalized), acoplado: norm(r.patente_acoplado), producto: r.product_normalized ?? r.producto_original ?? '', planta: PLANTA[r.planta_normalized] ?? r.planta_normalized, ingreso: localMs(r.external_ingreso_at), salida: localMs(r.external_salida_at), baja: r.baja || null })
    }
  }
}
const porCamion = new Map()
const porAcoplado = new Map()
for (const v of visitas) {
  if (v.camion) porCamion.set(v.camion, [...(porCamion.get(v.camion) ?? []), v])
  if (v.acoplado) porAcoplado.set(v.acoplado, [...(porAcoplado.get(v.acoplado) ?? []), v])
}
const hm = (ms) => (Number.isFinite(ms) ? new Date(ms - 3 * 3600_000).toISOString().slice(5, 16).replace('T', ' ').replace(/^(\d\d)-(\d\d)/, '$2/$1') : '—')
const desc = (v) => `${v.planta} · ${v.producto || 'sin producto'} · ingreso ${hm(v.ingreso)} → salida ${hm(v.salida)}${v.baja ? ' · BAJA' : ''}`
/** ¿La visita del SGC estaba abierta entre `a` y `b` (con 1 h de margen)? */
const enPlanta = (v, a, b) => (Number.isFinite(v.ingreso) ? v.ingreso : -Infinity) <= b + 3600_000 && (Number.isFinite(v.salida) ? v.salida : Infinity) >= a - 3600_000

const t = (hhmm) => Date.parse(`${day}T${hhmm}:00-03:00`)
const objetivo = lista.camiones.filter((c) => c.tipo === 'sin registro' || (c.tipo.startsWith('carta') && c.pasos === 1))
const filas = objetivo.map((c) => {
  const a = t(c.primero)
  const b = t(c.ultimo)
  const comoCamion = porCamion.get(c.patente) ?? []
  const comoAcoplado = porAcoplado.get(c.patente) ?? []
  let quien
  let detalle
  if (comoCamion.length) {
    const v = comoCamion.find((x) => enPlanta(x, a, b)) ?? comoCamion[0]
    quien = enPlanta(v, a, b) ? 'camión del SGC' : 'camión del SGC (otra hora)'
    detalle = desc(v)
  } else if (comoAcoplado.length) {
    const v = comoAcoplado.find((x) => enPlanta(x, a, b)) ?? comoAcoplado[0]
    quien = `acoplado de ${v.camion}`
    detalle = desc(v)
  } else {
    // Lectura parecida de un camión o acoplado que el SGC tiene en planta a esa hora.
    const cand = []
    for (const v of visitas) {
      if (!enPlanta(v, a, b)) continue
      for (const [p, rol] of [[v.camion, 'camión'], [v.acoplado, 'acoplado']]) {
        if (!p) continue
        const s = plateSimilarity(c.patente, p)
        if (s >= 0.65) cand.push({ p, rol, s, v })
      }
    }
    cand.sort((x, y) => y.s - x.s)
    if (cand.length) {
      const k = cand[0]
      // ≥ 80 %: una o dos letras cambiadas; debajo, coincidencia floja (AB148YJ ~ AD138ZJ).
      quien = `${k.s >= 0.8 ? 'lectura parecida' : 'parecido dudoso'} a ${k.p} (${k.rol}${k.rol === 'acoplado' ? ` de ${k.v.camion}` : ''})`
      detalle = `${Math.round(k.s * 100)} % · ${desc(k.v)}${cand.length > 1 ? ` · otras: ${cand.slice(1, 3).map((x) => x.p).join(', ')}` : ''}`
    } else {
      quien = 'fuera del SGC'
      detalle = ''
    }
  }
  return { patente: c.patente, lista: c.tipo === 'sin registro' ? 'sin registro' : 'carta, 1 paso', plantas: c.plantas, pasos: c.pasos, primero: c.primero, ultimo: c.ultimo, quien, sgc: detalle, recorrido: c.recorrido, fotos: c.fotos ?? [] }
})

const grupo = (q) => (q.startsWith('lectura parecida') ? 'lectura parecida' : q.startsWith('parecido dudoso') ? 'parecido dudoso' : q.startsWith('acoplado de') ? 'acoplado de otro camión' : q)
const resumen = {}
for (const f of filas) {
  const k = `${f.lista} → ${grupo(f.quien)}`
  resumen[k] = (resumen[k] ?? 0) + 1
}
const orden = { 'camión del SGC': 0, 'camión del SGC (otra hora)': 1, 'acoplado de otro camión': 2, 'lectura parecida': 3, 'parecido dudoso': 4, 'fuera del SGC': 5 }
filas.sort((x, y) => x.lista.localeCompare(y.lista) || orden[grupo(x.quien)] - orden[grupo(y.quien)] || y.pasos - x.pasos)
const cols = ['patente', 'lista', 'quien', 'sgc', 'plantas', 'pasos', 'primero', 'ultimo', 'recorrido']
fs.writeFileSync(path.join(dir, 'cruce-sgc.csv'), `﻿${[cols.join(';'), ...filas.map((f) => cols.map((c) => String(f[c]).replace(/;/g, ',')).join(';'))].join('\n')}\n`)
fs.writeFileSync(path.join(dir, 'cruce-sgc.json'), JSON.stringify({ dia: day, visitasSgc: visitas.length, resumen, filas }, null, 1))
console.log(JSON.stringify({ visitasSgc: visitas.length, resumen }, null, 1))
