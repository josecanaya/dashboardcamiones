// Cuenta la demostración: cada corrección del modelo (P ≥ θ) se verifica contra el Excel, sin usar las
// cámaras ni el modelo. Correcta = el camión asignado estaba en planta, ese punto es de su circuito y le
// faltaba justo ese paso en esa ventana, o ya se lo había leído bien en ese punto a 3 min o menos (doble
// lectura). Asignar una lectura de un vehículo real que no está en el Excel siempre es un error.
// Uso: node scripts/demostracion/contar.mjs calibracion|prueba [θ]
import fs from 'node:fs'
import path from 'node:path'

const which = process.argv[2] ?? 'prueba'
const fixedTheta = process.argv[3] != null && process.argv[3] !== '-' ? Number(process.argv[3]) : null
const root = process.cwd()
const dir = path.join(root, 'outputs', `demostracion_${which}`)
const { summary, cases } = JSON.parse(fs.readFileSync(path.join(dir, 'casos.json'), 'utf8'))
const steps = JSON.parse(fs.readFileSync(path.join(dir, 'pasos.json'), 'utf8'))
// MODO=combinado: si el modelo con patente no asigna y la lectura es ilegible (formato inválido), se usa
// la variante sin patente (recorrido, hora y atributos), con el mismo umbral.
if (process.env.MODO === 'combinado' && fixedTheta != null) {
  let n = 0
  for (const c of cases) {
    if (c.model.evaluated && c.model.winner && c.model.p >= fixedTheta) continue
    if (c.valid || !c.sinPatente?.winner || c.sinPatente.p < fixedTheta) continue
    c.model = { ...c.model, evaluated: true, winner: c.sinPatente.winner, p: c.sinPatente.p, check: c.sinPatente.check, viaSinPatente: true }
    n++
  }
  console.log('asignadas por la variante sin patente:', n)
}

// Cota inferior exacta (Clopper-Pearson, unilateral 95 %) de una proporción k/n.
const lgamma = (z) => {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z)
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i)
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}
const logC = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1)
const upperTail = (n, k, p) => { let s = 0; for (let i = k; i <= n; i++) s += Math.exp(logC(n, i) + i * Math.log(p) + (n - i) * Math.log1p(-p)); return s }
export function cpLower(k, n, alpha = 0.05) {
  if (k === 0) return 0
  let lo = 0, hi = 1
  for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (upperTail(n, k, m) > alpha) hi = m; else lo = m }
  return lo
}

const verdict = (c) => {
  const w = c.model.winner
  if (c.kind === 'patente_del_excel') return 'error'
  if (c.excelMissing.includes(w)) return 'completa_paso'
  if (c.excelTwins.includes(w)) return 'doble_lectura'
  // Sin el Excel: el camión elegido se vuelve a leer bien después, en un punto que sigue en su recorrido.
  if (c.model.check?.enOrden) return 'confirma_lectura_posterior'
  // Renova y Egreso SL son accesos compartidos: una lectura posterior ahí no confirma ni contradice.
  if (!c.model.check?.node || /Renova|san_lorenzo:Egreso/.test(c.model.check.node)) return 'sin_verificar'
  return 'error'
}
const assignedAt = (theta) => cases.filter((c) => c.model.evaluated && c.model.winner && c.model.p >= theta)
const rowAt = (theta) => {
  const a = assignedAt(theta)
  const v = a.map(verdict)
  const nv = v.filter((x) => x === 'sin_verificar').length
  const err = v.filter((x) => x === 'error').length
  const ok = a.length - nv - err
  // Exactitud sobre los casos verificables; «peor caso» cuenta como error todo lo no verificado.
  return { theta, asignadas: a.length, correctas: ok, errores: err, sinVerificar: nv, exactitud: ok + err ? ok / (ok + err) : null, cotaInferior95: ok + err ? cpLower(ok, ok + err) : null, peorCaso: a.length ? ok / a.length : null,
    completanPaso: v.filter((x) => x === 'completa_paso').length, dobleLectura: v.filter((x) => x === 'doble_lectura').length, lecturaPosterior: v.filter((x) => x === 'confirma_lectura_posterior').length }
}
const thetas = [0.5, 0.7, 0.8, 0.9, 0.95, 0.97, 0.98, 0.99, 0.995, 0.999]
const curve = thetas.map(rowAt)
// θ elegido en calibración: el menor con exactitud ≥ 98 % y al menos 30 asignaciones.
const chosen = fixedTheta ?? curve.find((r) => r.correctas + r.errores >= 30 && r.exactitud >= 0.98)?.theta ?? null
const at = chosen != null ? rowAt(chosen) : null

// Azar: si en vez del ganador se eligiera otro candidato de la lista, ¿qué tan seguido el Excel lo confirmaría?
const chance = (() => {
  let n = 0, ok = 0
  for (const c of assignedAt(chosen ?? 0.9)) for (const o of c.model.candidates ?? []) {
    if (o.plate === c.model.winner) continue
    n++
    if (c.kind !== 'patente_del_excel' && (c.excelMissing.includes(o.plate) || c.excelTwins.includes(o.plate))) ok++
  }
  return { comparaciones: n, confirmadas: ok, tasa: n ? ok / n : null }
})()

// Errores con detalle, para revisarlos uno por uno.
const errores = (chosen != null ? assignedAt(chosen) : []).filter((c) => verdict(c) === 'error').map((c) => ({ at: c.at, node: c.node, device: c.device, read: c.read, asignada: c.model.winner, p: Math.round(c.model.p * 1000) / 1000, kind: c.kind, check: c.model.check, excelMissing: c.excelMissing.slice(0, 5), excelTwins: c.excelTwins }))

// Subida por punto: pasos esperados, leídos con la patente exacta y recuperados por la regla.
const franja = (ms) => { const h = new Date(ms - 3 * 3600_000).getUTCHours(); return h >= 6 && h < 18 ? 'dia' : 'noche' }
const filled = new Set()
for (const c of chosen != null ? assignedAt(chosen) : []) if (verdict(c) === 'completa_paso') filled.add(`${c.model.winner}|${c.node}|${franja(Date.parse(c.at))}`)
const porPunto = {}
for (const s of steps.filter((x) => x.inWeek)) {
  const f = franja(s.t ?? (s.lo + s.hi) / 2)
  const o = (porPunto[s.node] ??= { dia: { esperados: 0, leidos: 0, recuperados: 0 }, noche: { esperados: 0, leidos: 0, recuperados: 0 } })[f]
  o.esperados++
  if (s.read) o.leidos++
  else if (filled.has(`${s.plate}|${s.node}|${f}`)) o.recuperados++
}
const tot = { esperados: 0, leidos: 0, recuperados: 0 }
for (const v of Object.values(porPunto)) for (const f of ['dia', 'noche']) for (const k of Object.keys(tot)) tot[k] += v[f][k]
// Lo que falta por punto: pasos sin ninguna captura sin explicar en su ventana (la cámara no disparó).
const badByNode = new Map()
for (const c of cases) { if (!badByNode.has(c.node)) badByNode.set(c.node, []); badByNode.get(c.node).push(Date.parse(c.at)) }
let sinCaptura = 0, faltantes = 0
for (const s of steps.filter((x) => x.inWeek)) {
  if (s.read || filled.has(`${s.plate}|${s.node}|${franja((s.lo + s.hi) / 2)}`)) continue
  faltantes++
  if (!(badByNode.get(s.node) ?? []).some((t) => t > s.lo && t < s.hi)) sinCaptura++
}

const result = { semana: which, summary, thetaElegido: chosen, curva: curve, resultado: at, azar: chance,
  verdadIndependiente: cases.reduce((o, c) => ((o[c.kind] = (o[c.kind] ?? 0) + 1), o), {}),
  pasos: { ...tot, faltantesSinRecuperar: faltantes, deEsosSinNingunaCaptura: sinCaptura }, porPunto, errores }
fs.writeFileSync(path.join(dir, 'resultado.json'), JSON.stringify(result, null, 2) + '\n')
const pc = (x) => (x == null ? '  —  ' : `${(x * 100).toFixed(1)}%`)
console.log(`semana ${which} · θ ${chosen}`)
for (const r of curve) console.log(`θ ${String(r.theta).padEnd(5)} asignadas ${String(r.asignadas).padStart(5)} confirmadas ${String(r.correctas).padStart(5)} contradichas ${String(r.errores).padStart(4)} sin verificar ${String(r.sinVerificar).padStart(4)} · exactitud ${pc(r.exactitud)} cota ${pc(r.cotaInferior95)} peor caso ${pc(r.peorCaso)} (Excel ${r.completanPaso + r.dobleLectura}, lectura posterior ${r.lecturaPosterior})`)
console.log('azar', chance, 'pasos', result.pasos)
for (const [k, v] of Object.entries(porPunto)) console.log(k.padEnd(40), ['dia', 'noche'].map((f) => `${f} ${pc(v[f].leidos / v[f].esperados)} → ${pc((v[f].leidos + v[f].recuperados) / v[f].esperados)} (${v[f].esperados})`).join('  '))
console.log('errores', errores.length, errores.slice(0, 12).map((e) => `${e.read}→${e.asignada} ${e.p} ${e.kind} ${e.node.split(':')[1]}`).join(' | '))
