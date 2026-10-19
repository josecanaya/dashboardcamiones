/**
 * Informe cámara por cámara: de los camiones del Sistema que cada cámara vio, qué % leyó exacto, qué %
 * corrigió el algoritmo (replay sobre todas las lecturas) y qué % queda por corregir.
 * Por punto: cuántos camiones esperados no vio ninguna cámara.
 *
 * Requiere: cruce.mjs (por-punto.csv) y replay-algoritmo.mjs (replay-algoritmo.json) sobre el mismo período.
 * Uso: node scripts/cruce-sistema-truckflow/informe-por-camara.mjs <dir del cruce>
 * Salida: <dir>/informe-por-camara.json y .csv
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const dir = process.argv[2]
if (!dir) throw new Error('falta el directorio del cruce')
const csv = (f) => {
  const [head, ...rows] = readFileSync(join(dir, f), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/)
  const cols = head.split(',')
  return rows.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])))
}
const filas = csv('por-punto.csv')
const replay = JSON.parse(readFileSync(join(dir, 'replay-algoritmo.json'), 'utf8')).detalle
const resultadoDe = new Map(replay.map((d) => [`${d.punto}|${d.sistema}|${d.camara}|${d.hora}`, d.resultado]))
const patente = new Map(csv('movimientos.csv').map((m) => [m.id, m.patente]))

const LABEL = {
  PRE: 'Preingreso Ricardone', ING_RIC: 'Ingreso Ricardone', CAL_RIC: 'Calada Ricardone', BAL_ING_RIC: 'Balanza ingreso Ricardone',
  BAL_EGR_RIC: 'Balanza egreso Ricardone', ING_SL: 'Ingreso puerto', CAL_SL: 'Calada puerto', BAL_ING_SL: 'Balanza ingreso puerto', BAL_EGR_SL: 'Balanza egreso puerto',
}
const camaras = new Map()
const puntos = new Map()
for (const f of filas) {
  const p = puntos.get(f.punto) ?? { punto: f.punto, nombre: LABEL[f.punto] ?? f.punto, esperados: 0, sinLectura: 0 }
  puntos.set(f.punto, p)
  p.esperados += 1
  if (f.como === 'sin_lectura') { p.sinLectura += 1; continue }
  const c = camaras.get(f.camara) ?? { camara: f.camara, punto: f.punto, nombre: LABEL[f.punto] ?? f.punto, trasera: f.trasera === 'si', vistos: 0, exactas: 0, corregidas: 0, corregidasMal: 0, quedan: 0 }
  camaras.set(f.camara, c)
  c.vistos += 1
  if (f.como === 'exacta') { c.exactas += 1; continue }
  const r = resultadoDe.get(`${f.punto}|${patente.get(f.id)}|${f.camara}|${f.hora_camara}`)
  if (r === 'bien') c.corregidas += 1
  else {
    c.quedan += 1
    if (r === 'mal') c.corregidasMal += 1
  }
}
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)
const tabla = [...camaras.values()]
  .map((c) => ({ ...c, leyo_pct: pct(c.exactas, c.vistos), corregimos_pct: pct(c.corregidas, c.vistos), quedan_pct: pct(c.quedan, c.vistos), total_pct: pct(c.exactas + c.corregidas, c.vistos) }))
  .sort((a, b) => Object.keys(LABEL).indexOf(a.punto) - Object.keys(LABEL).indexOf(b.punto) || b.vistos - a.vistos)
// Esperados por punto: los del resumen del cruce (solo los camiones cuyo recorrido pasa por ese punto).
const resumen = JSON.parse(readFileSync(join(dir, 'resumen.json'), 'utf8')).porPunto
const porPunto = Object.entries(resumen).map(([punto, r]) => ({ punto, nombre: r.label, esperados: r.esperados, sinLectura: r.sin_lectura, sinLectura_pct: pct(r.sin_lectura, r.esperados) }))
writeFileSync(join(dir, 'informe-por-camara.json'), JSON.stringify({ camaras: tabla, puntos: porPunto }, null, 1))
writeFileSync(
  join(dir, 'informe-por-camara.csv'),
  '﻿' + ['punto,camara,trasera,vistos,exactas,leyo_pct,corregidas,corregimos_pct,quedan,quedan_pct,corregidas_mal,total_pct', ...tabla.map((c) => [c.nombre, c.camara, c.trasera ? 'si' : '', c.vistos, c.exactas, c.leyo_pct, c.corregidas, c.corregimos_pct, c.quedan, c.quedan_pct, c.corregidasMal, c.total_pct].join(','))].join('\n')
)
console.table(tabla.map(({ nombre, camara, vistos, leyo_pct, corregimos_pct, quedan_pct, quedan, total_pct }) => ({ nombre, camara, vistos, leyo_pct, corregimos_pct, quedan_pct, quedan, total_pct })))
console.table(porPunto)
const T = tabla.reduce((a, c) => ({ v: a.v + c.vistos, e: a.e + c.exactas, k: a.k + c.corregidas, q: a.q + c.quedan, m: a.m + c.corregidasMal }), { v: 0, e: 0, k: 0, q: 0, m: 0 })
console.log('total', T, 'leyó', pct(T.e, T.v), 'corregimos', pct(T.k, T.v), 'quedan', pct(T.q, T.v))
