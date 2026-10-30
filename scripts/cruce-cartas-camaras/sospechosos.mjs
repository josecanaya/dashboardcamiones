/**
 * De los camiones sin carta ni Sistema (grupo camion_sin_papeles de cruce.mjs), cuáles son
 * sospechosos. Que hayan venido otros días no cuenta: si ese día no tenían papeles, no tenían que estar.
 *
 * Por cada pasada (misma cámara, lecturas a ≤3 min) se busca un «gemelo»: un camión con carta o con
 * Sistema leído en esa cámara a ≤90 s. Si todas las pasadas tienen gemelo, es una mala lectura de
 * otro camión. Lo que queda se ordena por hasta dónde llegó (zona operativa > acceso > portería).
 *
 * Uso: node scripts/cruce-cartas-camaras/sospechosos.mjs --desde 2026-09-29 [--hasta …]
 *  → reportes/cruce-cartas-camaras/<desde>_<hasta>/sospechosos.json
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { loadReads } from '../cruce-sistema-truckflow/lecturas.mjs'
import { loadMovimientos, arMs, arIso } from '../cruce-sistema-truckflow/sistema.mjs'

const root = resolve(import.meta.dirname, '../..')
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined)
const desde = arg('--desde')
const hasta = arg('--hasta') ?? desde
const dir = join(root, 'reportes/cruce-cartas-camaras', `${desde}_${hasta}`)
const cruce = JSON.parse(readFileSync(join(dir, 'cruce.json'), 'utf8'))
const H = 3600_000
const t0 = arMs(`${desde}T00:00:00`)
const t1 = arMs(`${hasta}T00:00:00`) + 24 * H

/** Hasta dónde llegó: zona operativa (descarga/carga/pesada) > acceso de planta > portería SL. */
const ZONA = (dev) =>
  /Cal|Volcable|S\dCarga|S\dDesc|Playa|BalLiq|BalSC|^RicB\d|TK400|Ren(Carg|Desc)/.test(dev)
    ? 'operativa'
    : /PreIng|IngCam|EgrCam|BalIng/.test(dev)
      ? 'acceso'
      : 'porteria'
const NIVEL = { operativa: 3, acceso: 2, porteria: 1 }
const NOMBRE = {
  RicPreIngInFr: 'Preingreso Ric', RicPreIngInTr: 'Preingreso Ric (tras.)', RicIngCamTrasera: 'Ingreso Ric (tras.)',
  RicEgrCamFrente: 'Egreso Ric', RicEgrCamTraser: 'Egreso Ric (tras.)', RicB1Ingreso: 'Balanza 1 Ric', RicB2Egreso: 'Balanza 2 Ric',
  RicB3Ingreso: 'Balanza 3 Ric', RicB3Egreso: 'Balanza 3 Ric (sal.)', RicS6Playa3: 'Playa 3 Ric', SLZSalidaC1Fte: 'Portería SL 1',
  SLZSalidaC2Fte: 'Portería SL 2', SLZSalidaC1Tras: 'Portería SL 1 (tras.)', SLZSalidaC2Tras: 'Portería SL 2 (tras.)',
  SLZTK400: 'TK400 SL', SLZBalIngFte: 'Balanza ingreso SL', SLZBalIngTras: 'Balanza ingreso SL (tras.)', SLZIngCamFrente: 'Ingreso SL',
  SLZBalSC1Fte: 'Balanza SC1 SL', SLZBalSC2Fte: 'Balanza SC2 SL', SLZBalLiq1a: 'Balanza líquidos SL', RenDescTras: 'Renopack descarga (tras.)',
}
const nombre = (d) => NOMBRE[d] ?? d

// Patentes con papeles: cartas del período (chasis + acoplado) y Sistema.
const conocidas = new Set()
for (const c of JSON.parse(readFileSync(join(root, 'data/arca/arca_consignment_notes.json'), 'utf8'))) {
  const p = Date.parse(c.departure_time?.$date)
  if (p > t0 - 5 * 24 * H && p < t1 + 24 * H) for (const q of c.transport?.plates ?? []) conocidas.add(q.toUpperCase())
}
for (const m of loadMovimientos()) if (m.ing < t1 + 24 * H && (m.sal || m.ing) > t0 - 24 * H) [m.plate, m.acoplado].forEach((q) => q && conocidas.add(q))

const reads = loadReads().filter((r) => r.t >= t0 - H && r.t < t1 + H)
const porCamara = new Map()
for (const r of reads) {
  if (!porCamara.has(r.dev)) porCamara.set(r.dev, [])
  porCamara.get(r.dev).push(r)
}
const comunes = (a, b) => [...a].filter((ch, i) => b[i] === ch).length

const out = []
for (const s of cruce.niCartaNiSistema.filter((x) => x.grupo === 'camion_sin_papeles')) {
  const rs = reads.filter((r) => r.plate === s.patente && r.t >= t0 && r.t < t1)
  const pasadas = []
  for (const r of rs) {
    const p = pasadas.find((x) => x.dev === r.dev && r.t - x.hasta <= 3 * 60_000)
    if (p) p.hasta = r.t
    else pasadas.push({ dev: r.dev, desde: r.t, hasta: r.t })
  }
  for (const p of pasadas) {
    const cerca = (porCamara.get(p.dev) ?? []).filter((r) => r.plate !== s.patente && conocidas.has(r.plate) && r.t >= p.desde - 90_000 && r.t <= p.hasta + 90_000)
    cerca.sort((a, b) => comunes(s.patente, b.plate) - comunes(s.patente, a.plate))
    // Gemelo = otra lectura de la misma pasada con patente parecida (≥3 caracteres en su lugar).
    p.gemelo = cerca[0] && comunes(s.patente, cerca[0].plate) >= 3 ?{ patente: cerca[0].plate, hora: arIso(cerca[0].t), parecido: comunes(s.patente, cerca[0].plate) } : null
  }
  const solas = pasadas.filter((p) => !p.gemelo)
  const alcance = Math.max(...pasadas.map((p) => NIVEL[ZONA(p.dev)]))
  const alcanceSolas = solas.length ? Math.max(...solas.map((p) => NIVEL[ZONA(p.dev)])) : 0
  const plantas = [...new Set(pasadas.map((p) => (p.dev.startsWith('SLZ') ? 'SL' : p.dev.startsWith('Ren') ? 'Renopack' : 'Ricardone')))]
  // Mala lectura: todas las pasadas con gemelo, o una sola pasada sin gemelo pero con gemelo parecido (≥3 iguales) en las otras.
  const veredicto = !solas.length
    ? 'mala_lectura'
    : alcanceSolas === 3
      ? 'sospechoso_zona_operativa'
      : alcanceSolas === 2
        ? 'sospechoso_acceso'
        : 'solo_porteria'
  out.push({
    patente: s.patente,
    tipo: s.tipo,
    marca: s.marca,
    color: s.color,
    primera: s.primera,
    ultima: s.ultima,
    permanenciaMin: Math.round((rs.at(-1).t - rs[0].t) / 60_000),
    plantas,
    alcance: Object.keys(NIVEL).find((k) => NIVEL[k] === alcance),
    veredicto,
    pasadas: pasadas.map((p) => ({ camara: p.dev, lugar: nombre(p.dev), zona: ZONA(p.dev), hora: arIso(p.desde).slice(11), gemelo: p.gemelo })),
  })
}
const orden = { sospechoso_zona_operativa: 0, sospechoso_acceso: 1, solo_porteria: 2, mala_lectura: 3 }
out.sort((a, b) => orden[a.veredicto] - orden[b.veredicto] || a.primera.localeCompare(b.primera))
writeFileSync(join(dir, 'sospechosos.json'), JSON.stringify(out, null, 2))
const cuenta = out.reduce((o, x) => ((o[x.veredicto] = (o[x.veredicto] ?? 0) + 1), o), {})
console.log(JSON.stringify(cuenta))
for (const x of out)
  console.log(
    `${x.veredicto.padEnd(26)} ${x.patente.padEnd(8)} ${x.tipo || '-'} ${x.marca || ''} | ${x.primera.slice(11)}→${x.ultima.slice(11)} (${x.permanenciaMin} min) | ` +
      x.pasadas.map((p) => `${p.hora} ${p.lugar}${p.gemelo ? ` [≈${p.gemelo.patente}]` : ''}`).join(' · '),
  )
