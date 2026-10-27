// Compara lo que decide el algoritmo (cobertura.json) con las correcciones hechas en el simulador.
// Uso: node scripts/vinculo/comparar-correcciones.mjs [DESDE HASTA]
import fs from 'node:fs'
import path from 'node:path'

const [FROM = '2026-10-19', TO = '2026-10-25'] = process.argv.slice(2)
const dir = path.join(process.cwd(), 'reportes/vinculo', `${FROM}_${TO}`)
const r = JSON.parse(fs.readFileSync(path.join(dir, 'cobertura.json'), 'utf8'))
const corr = JSON.parse(fs.readFileSync(path.join(dir, 'simulador/correcciones.json'), 'utf8'))
// Lo que vio el usuario, para mostrar su elección aunque ya no esté en la lista del algoritmo.
const sim = JSON.parse(fs.readFileSync(path.join(dir, 'simulador/casos.json'), 'utf8'))
const seen = new Map()
for (const c of sim.casos) for (const h of c.huecos) for (const x of h.todas) seen.set(`${c.ctg}|${h.nodo}|${x.at}`, x)
const tally = { igual: 0, distinta: 0, noAsigno: 0, asignoDeMas: 0 }
for (const [key, v] of Object.entries(corr)) {
  if (key.startsWith('cap|')) continue
  const [ctg, nodo] = key.split('|')
  const h = r.camiones.find((t) => t.ctg === ctg)?.huecos?.find((x) => x.nodo === nodo)
  if (!h) { console.log(`  ?  ${key}: el paso ya no es un hueco (lo tomó la cámara directo)`); continue }
  const al = h.todas.find((x) => x.elegida)
  let algo = al?.at ?? null
  let yo = /^\d{4}-/.test(v.eleccion) ? v.eleccion : null
  // Misma captura: el mismo punto a ±2 s (TruckFlow la manda repetida por el feed y como alerta, y al
  // regenerar el lote las repetidas desaparecen de la lista).
  if (al && yo && Math.abs(Date.parse(al.at) - Date.parse(yo)) <= 2000) yo = algo
  const k = algo === yo ? 'igual' : !algo ? 'noAsigno' : !yo ? 'asignoDeMas' : 'distinta'
  tally[k]++
  const show = (at) => { const x = h.todas.find((y) => y.at === at) ?? seen.get(`${key}|${at}`); return x ? `${x.patente || '∅'} ${x.hora.slice(6)}` : at ? '(fuera de la lista)' : 'nada' }
  console.log(`  ${k === 'igual' ? '=' : '≠'}  ${ctg} ${nodo.split(':')[1].padEnd(22)} vos ${show(yo).padEnd(18)} algoritmo ${show(algo)}`)
}
const n = Object.values(tally).reduce((a, b) => a + b, 0)
console.log(`coincide ${tally.igual}/${n} · no asignó ${tally.noAsigno} · eligió otra ${tally.distinta} · asignó cuando no había ${tally.asignoDeMas}`)

// Correcciones por captura («¿de qué camión es esta captura?»): el camión que elige hoy el algoritmo contra el
// del usuario. Misma captura = misma cámara a ±2 s.
const caps = Object.entries(corr).filter(([k]) => k.startsWith('cap|'))
if (caps.length) {
  const t2 = { igual: 0, distinta: 0, noEsDeNinguno: 0, noSeSabe: 0, sinDecision: 0 }
  for (const [, v] of caps) {
    if (v.eleccion === 'no_se_sabe') { t2.noSeSabe++; continue }
    const k = (r.capturas ?? []).find((c) => c.camara === v.camara && Math.abs(Date.parse(c.at) - Date.parse(v.at)) <= 2000)
    const algo = k?.rivales[0]?.ctg ?? null
    const kind = v.eleccion === 'ninguno' ? (algo ? 'noEsDeNinguno' : 'igual') : !algo ? 'sinDecision' : algo === v.eleccion ? 'igual' : 'distinta'
    t2[kind]++
    if (kind !== 'igual') console.log(`  ≠  captura ${v.nodo?.split(':')[1] ?? ''} ${v.at} vos ${v.eleccion === 'ninguno' ? 'ninguno' : v.patente} · algoritmo ${k ? `${k.rivales[0].patente} ${k.rivales[0].prob} %` : 'nada'}`)
  }
  const n2 = caps.length - t2.noSeSabe
  console.log(`capturas: coincide ${t2.igual}/${n2} · eligió otro camión ${t2.distinta} · era de ninguno y la asignó ${t2.noEsDeNinguno} · no la asignó ${t2.sinDecision} · no se sabe ${t2.noSeSabe}`)
}
