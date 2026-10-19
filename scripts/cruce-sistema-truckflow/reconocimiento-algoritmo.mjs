/**
 * Nivel de reconocimiento: cámara cruda vs. algoritmo de identificación en vivo, contra la balanza.
 *
 * Toma la salida de cruce.mjs (movimientos.csv + recuperadas.csv) de un período y, para cada lectura
 * mal leída de un camión del Sistema (formato / parecida / por_hora / otra_patente), busca qué hizo
 * la identificación en vivo con esa lectura (bandeja + archivo, vía API): la corrigió bien, la
 * corrigió mal, quedó abierta, la mandó a «fuera del sistema» / descartada, o nunca llegó a la bandeja.
 *
 * Uso: node scripts/cruce-sistema-truckflow/reconocimiento-algoritmo.mjs <dir del cruce> [--api http://127.0.0.1:8787]
 * Salida: <dir>/reconocimiento-algoritmo.json y .csv
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const dir = process.argv[2]
const API = process.argv.includes('--api') ? process.argv[process.argv.indexOf('--api') + 1] : 'http://127.0.0.1:8787'
if (!dir) throw new Error('falta el directorio del cruce')

const csv = (f) => {
  const [head, ...rows] = readFileSync(join(dir, f), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/)
  const cols = head.split(',')
  return rows.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])))
}
const movs = csv('movimientos.csv')
const recs = csv('recuperadas.csv')
const PUNTOS = ['PRE', 'ING_RIC', 'CAL_RIC', 'BAL_ING_RIC', 'BAL_EGR_RIC', 'ING_SL', 'CAL_SL', 'BAL_ING_SL', 'BAL_EGR_SL']
const plantaDe = (p) => (/_RIC$|^PRE$/.test(p) ? 'ricardone' : 'san_lorenzo')
const dia = (s) => s.slice(0, 10)
const ms = (s) => Date.parse(s.replace(' ', 'T') + ':00-03:00')

// ── Identificación en vivo (bandeja + archivo) ───────────────────────────────────────────────────
const items = []
for (const site of ['ricardone', 'san_lorenzo']) {
  const res = await fetch(`${API}/api/truckflow/live/identifications?site=${site}`)
  if (!res.ok) throw new Error(`${site}: ${res.status}`)
  for (const it of (await res.json()).items) items.push({ ...it, site, t: Date.parse(it.at) })
}
/** La hora del ítem es la del feed en vivo; la del cruce, la de cámara: se busca la más cercana (±20 min). */
function itemDe(r) {
  const t = ms(r.hora_camara)
  let best = null
  for (const it of items) {
    if (it.readPlate !== (r.lectura_camara || 'SIN_PATENTE') || it.deviceCode !== r.camara) continue
    const d = Math.abs(it.t - t)
    if (d <= 20 * 60_000 && (!best || d < best.d)) best = { it, d }
  }
  return best?.it ?? null
}
const resultado = (r) => {
  const it = itemDe(r)
  if (!it) return 'sin_bandeja'
  if (it.assignedPlate) return it.assignedPlate === r.patente_sistema ? (it.level === 'confirmado' && it.decision?.source !== 'automatic_algorithm' ? 'bien_operador' : 'bien_algoritmo') : 'mal'
  if (it.level === 'fuera_sistema' || it.level === 'rechazado') return 'descartada'
  return 'abierta'
}

// ── Por día y planta ─────────────────────────────────────────────────────────────────────────────
const por = {}
const fila = (k) => (por[k] ??= { camiones: 0, conExacta: 0, lecturas: 0, exactas: 0, malLeidas: 0, sinLectura: 0, algoritmo: { bien_algoritmo: 0, bien_operador: 0, mal: 0, abierta: 0, descartada: 0, sin_bandeja: 0 } })
for (const m of movs) {
  const planta = m.planta === 'TERMINAL_EMBARQUE' ? 'san_lorenzo' : 'ricardone'
  const k = `${dia(m.ingreso)}|${planta}`
  const f = fila(k)
  f.camiones += 1
  let exacta = false
  for (const p of PUNTOS) {
    const v = m[p]
    if (!v) continue
    if (v.startsWith('exacta')) { f.exactas += 1; f.lecturas += 1; exacta = true }
    else if (v.startsWith('sin_lectura')) f.sinLectura += 1
    else { f.malLeidas += 1; f.lecturas += 1 }
  }
  if (exacta) f.conExacta += 1
}
const detalle = []
for (const r of recs) {
  const m = movs.find((x) => x.id === r.id)
  if (!m) continue
  const planta = m.planta === 'TERMINAL_EMBARQUE' ? 'san_lorenzo' : 'ricardone'
  const out = resultado(r)
  fila(`${dia(m.ingreso)}|${planta}`).algoritmo[out] += 1
  detalle.push({ dia: dia(m.ingreso), planta, punto: r.punto, como: r.como, sistema: r.patente_sistema, leyo: r.lectura_camara, camara: r.camara, hora: r.hora_camara, algoritmo: out, asignada: itemDe(r)?.assignedPlate ?? '' })
}
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
const tabla = Object.entries(por).sort().map(([k, f]) => {
  const [d, planta] = k.split('|')
  const a = f.algoritmo
  const corregidas = a.bien_algoritmo + a.bien_operador
  return {
    dia: d, planta, camiones: f.camiones,
    camionConExacta_pct: pct(f.conExacta, f.camiones),
    lecturaExacta_pct: pct(f.exactas, f.lecturas),
    malLeidas: f.malLeidas,
    conAlgoritmo_pct: pct(f.exactas + corregidas, f.lecturas),
    ...a,
  }
})
writeFileSync(join(dir, 'reconocimiento-algoritmo.json'), JSON.stringify({ tabla, detalle }, null, 1))
writeFileSync(join(dir, 'reconocimiento-algoritmo.csv'), '﻿' + ['dia,planta,punto,como,sistema,leyo,camara,hora,algoritmo,asignada', ...detalle.map((d) => Object.values(d).join(','))].join('\n'))
console.table(tabla)
const tot = detalle.reduce((acc, d) => ((acc[d.algoritmo] = (acc[d.algoritmo] ?? 0) + 1), acc), {})
console.log('mal leídas en la semana:', detalle.length, tot)
