/**
 * Camiones con la patente en un PAPEL (p. ej. en el parabrisas) en vez de chapa: las cámaras de los
 * accesos (Preingreso, Ingreso Ricardone/puerto, balanzas), que miran la chapa del paragolpes, no
 * los leen nunca; alguna cámara alta (Celda 16, volcables, calada) sí lee el papel.
 *
 * Por visita del Sistema: patente leída exacta en alguna cámara y en NINGUNA de acceso. Por patente:
 * cuántas visitas tuvo así y si alguna vez un acceso la leyó (si nunca, es fuerte candidata a papel).
 *
 * Uso: node --max-old-space-size=8192 scripts/cruce-sistema-truckflow/papel-parabrisas.mjs
 * Salida: reportes/cruce-sistema-truckflow/papel-parabrisas.json y .csv
 */
import { writeFileSync } from 'fs'
import { join } from 'path'
import { loadReads, OUT_DIR } from './lecturas.mjs'
import { loadMovimientos, arDay } from './sistema.mjs'

const MIN = 60_000
const ACCESO = /^(RicPreIng|RicIngCam|SLZIngCam|RicB\d|SLZBal(Ing|SC)|RicEgrCam|SLZSalida)/
const conSeg = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')
const reads = loadReads()
const movs = loadMovimientos()
const byPlate = new Map()
for (const r of reads) {
  if (!r.plate) continue
  if (!byPlate.has(r.plate)) byPlate.set(r.plate, [])
  byPlate.get(r.plate).push(r)
}
const tfFrom = arDay(reads[0].t)
const porPatente = new Map()
for (const m of movs) {
  if (arDay(m.ing) < tfFrom) continue
  const a = m.ing - 60 * MIN
  const b = (Number.isFinite(m.sal) ? m.sal : m.ing + 14 * 60 * MIN) + 30 * MIN
  const hits = (byPlate.get(m.plate) ?? []).filter((r) => r.t >= a && r.t <= b)
  if (!hits.length || hits.some((r) => ACCESO.test(r.dev))) continue
  const x = porPatente.get(m.plate) ?? { patente: m.plate, visitas: [] }
  x.visitas.push({ ingreso: conSeg(m.ing), salida: Number.isFinite(m.sal) ? conSeg(m.sal) : '', producto: m.producto, planta: m.planta, camaras: [...new Set(hits.map((r) => r.dev))].join(' '), primera: conSeg(hits[0].t) })
  porPatente.set(m.plate, x)
}
const out = [...porPatente.values()].map((x) => {
  const todas = byPlate.get(x.patente) ?? []
  const accesos = todas.filter((r) => ACCESO.test(r.dev)).length
  return { ...x, lecturasTotales: todas.length, lecturasEnAccesos: accesos, camarasQueLaLeen: [...new Set(todas.map((r) => r.dev))].join(' ') }
})
// Primero las que ningún acceso leyó nunca, con más visitas.
out.sort((a, b) => a.lecturasEnAccesos - b.lecturasEnAccesos || b.visitas.length - a.visitas.length)
writeFileSync(join(OUT_DIR, 'papel-parabrisas.json'), JSON.stringify(out, null, 1))
const rows = [['patente', 'visitas_sin_acceso', 'lecturas_en_accesos_todo_el_periodo', 'lecturas_totales', 'camaras_que_la_leen', 'ingreso', 'salida', 'producto', 'camaras_en_la_visita']]
for (const x of out) for (const v of x.visitas) rows.push([x.patente, x.visitas.length, x.lecturasEnAccesos, x.lecturasTotales, x.camarasQueLaLeen, v.ingreso, v.salida, v.producto, v.camaras])
writeFileSync(join(OUT_DIR, 'papel-parabrisas.csv'), '﻿' + rows.map((r) => r.join(',')).join('\n'))
const nunca = out.filter((x) => !x.lecturasEnAccesos)
console.log(`patentes con visitas leídas solo fuera de los accesos: ${out.length}; nunca leídas por un acceso: ${nunca.length}`)
for (const x of nunca.slice(0, 40)) console.log(x.patente, x.visitas.length, 'visitas', '|', x.camarasQueLaLeen, '|', x.visitas.map((v) => v.ingreso.slice(5, 16)).join(' '))
