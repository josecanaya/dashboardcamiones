// Estudio para el plan al 99 %: (1) por qué falta cada camión entero; (2) en cada paso deducido, qué capturó la
// cámara de ese punto entre el paso anterior y el siguiente del camión (¿había algo para asignar?).
// Uso: node scripts/demostracion/estudio-faltantes.mjs 2026-10-01 2026-10-07
import fs from 'node:fs'
import { isValidPlate } from '../../server/plantState/plateIdentification.mjs'

const [from, to] = process.argv.slice(2)
const days = []
for (let t = Date.parse(from + 'T12:00:00Z'); t <= Date.parse(to + 'T12:00:00Z'); t += 86400_000) days.push(new Date(t).toISOString().slice(0, 10))
const model = JSON.parse(fs.readFileSync('docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json', 'utf8'))
const SAME = { 'ricardone:Volcable Silo Chief': 'ricardone:Volcable Silo Keppler' }
const devNode = new Map()
for (const n of model.nodes) for (const d of n.devices ?? []) devNode.set(d.toLowerCase(), SAME[n.id] ?? n.id)
const FUERA = new Set(['ricb1ingreso', 'ricb2ingreso', 'ricb3ingreso', 'ricingcamfrente'])

const caps = []
for (const f of ['data/dss-export/2026-09-24_30/capturas.csv', 'data/dss-export/2026-10-01_07/capturas.csv']) {
  const [head, ...lines] = fs.readFileSync(f, 'utf8').trim().split(/\r?\n/)
  const h = head.split(',')
  const I = Object.fromEntries(h.map((k, i) => [k, i]))
  for (const l of lines) { const c = l.split(','); caps.push({ dev: c[I.camara], node: devNode.get(c[I.camara].toLowerCase()) ?? null, plate: c[I.patente], tipo: c[I.tipo], t: Date.parse(c[I.hora_camara].replace(' ', 'T') + '-03:00') }) }
}
caps.sort((a, b) => a.t - b.t)
const byNode = new Map()
for (const c of caps) if (c.node) { if (!byNode.has(c.node)) byNode.set(c.node, []); byNode.get(c.node).push(c) }
const between = (node, a, b) => { const l = byNode.get(node) ?? []; let lo = 0, hi = l.length; while (lo < hi) { const m = (lo + hi) >> 1; if (l[m].t < a) lo = m + 1; else hi = m } const o = []; for (let i = lo; i < l.length && l[i].t <= b; i++) o.push(l[i]); return o }
const ed = (a, b) => { const d = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length] }

// ── 1. Camiones enteros que faltan ──
const falta = { total: 0, pasos: 0, tipos: {}, ejemplos: {} }
// ── 2. Pasos deducidos: qué había en la cámara ──
const ded = { total: 0, sinCaptura: 0, conParecida: 0, soloMalas: 0, soloValidasAjenas: 0, porNodo: {} }
const usadas = new Set()
for (const d of days) {
  const f = `outputs/demostracion_camaras/${d}_Q1Q2Q3Q4.json`
  if (!fs.existsSync(f)) continue
  const R = JSON.parse(fs.readFileSync(f, 'utf8'))
  for (const v of R.porCamion) for (const p of v.pasos) if (p.t) usadas.add(p.device + '|' + Date.parse(p.t))
  for (const v of R.porCamion) {
    const pasos = v.pasos.filter((p) => p.estado !== 'excluido')
    if (pasos.every((p) => p.estado === 'falta')) {
      falta.total++; falta.pasos += pasos.length
      const dia = Date.parse(d + 'T00:00:00-03:00')
      const lect = caps.filter((c) => c.t >= dia - 12 * 3600_000 && c.t <= dia + 36 * 3600_000 && c.plate.length >= 4 && ed(c.plate, v.plate) <= 1)
      const utiles = lect.filter((c) => c.node && !FUERA.has(c.dev.toLowerCase()))
      const entrada = utiles.filter((c) => /Pre ingreso|san_lorenzo:Ingreso/.test(c.node))
      const tipo = !lect.length ? 'ninguna cámara la leyó' : !utiles.length ? 'solo cámaras fuera de servicio o sin nodo' : entrada.length ? 'leída en la entrada pero sin visita' : utiles.length === 1 ? 'una sola lectura en un punto interno' : 'varias lecturas internas, sin entrada'
      falta.tipos[tipo] = (falta.tipos[tipo] ?? 0) + 1
      ;(falta.ejemplos[tipo] ??= []).length < 6 && falta.ejemplos[tipo].push(`${d} ${v.plate} ${v.circuito}: ${utiles.slice(0, 4).map((c) => c.dev + ' ' + c.plate).join(', ') || lect.slice(0, 2).map((c) => c.dev + ' ' + c.plate).join(', ')}`)
      continue
    }
    for (let i = 0; i < pasos.length; i++) {
      if (pasos[i].estado !== 'deducido') continue
      const prev = pasos.slice(0, i).reverse().find((p) => p.t), next = pasos.slice(i + 1).find((p) => p.t)
      if (!prev || !next) continue
      const a = Date.parse(prev.t), b = Date.parse(next.t)
      const n = pasos[i].node
      const cs = between(n, a, b).filter((c) => !FUERA.has(c.dev.toLowerCase()))
      const o = (ded.porNodo[n] ??= { total: 0, sinCaptura: 0, conParecida: 0, soloMalas: 0, soloValidasAjenas: 0 })
      ded.total++; o.total++
      const k = !cs.length ? 'sinCaptura' : cs.some((c) => c.plate.length >= 3 && ed(c.plate, v.plate) <= 3) ? 'conParecida' : cs.some((c) => !isValidPlate(c.plate)) ? 'soloMalas' : 'soloValidasAjenas'
      ded[k]++; o[k]++
    }
  }
}
const pc = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '—')
console.log(`\n1) CAMIONES ENTEROS QUE FALTAN: ${falta.total} camiones · ${falta.pasos} pasos`)
for (const [k, n] of Object.entries(falta.tipos).sort((a, b) => b[1] - a[1])) { console.log(`   ${String(n).padStart(3)}  ${k}`); for (const e of falta.ejemplos[k]) console.log('        ' + e) }
console.log(`\n2) PASOS DEDUCIDOS ENTRE DOS LECTURAS: ${ded.total}`)
console.log(`   la cámara no capturó nada en ese intervalo:          ${ded.sinCaptura} (${pc(ded.sinCaptura, ded.total)})`)
console.log(`   capturó una lectura parecida (≤3 cambios):           ${ded.conParecida} (${pc(ded.conParecida, ded.total)})`)
console.log(`   capturó solo lecturas malas (fragmentos):            ${ded.soloMalas} (${pc(ded.soloMalas, ded.total)})`)
console.log(`   capturó solo patentes válidas de otros camiones:     ${ded.soloValidasAjenas} (${pc(ded.soloValidasAjenas, ded.total)})`)
console.log('\n   por punto                              deducidos  sin captura  parecida  fragmentos  otras')
for (const [n, o] of Object.entries(ded.porNodo).sort((a, b) => b[1].total - a[1].total)) console.log(`   ${n.padEnd(38)} ${String(o.total).padStart(8)} ${pc(o.sinCaptura, o.total).padStart(12)} ${pc(o.conParecida, o.total).padStart(9)} ${pc(o.soloMalas, o.total).padStart(11)} ${pc(o.soloValidasAjenas, o.total).padStart(6)}`)
fs.writeFileSync(`outputs/demostracion_camaras/estudio-faltantes_${from}_${to}.json`, JSON.stringify({ falta, ded }, null, 1))
