// Recorrido paso por paso de cada camión de un día y qué pasos le faltan, contra el recorrido REAL de su grupo.
// Lee reportes/reconocimiento-pasos/<día>/pasos-por-camion.json (scripts/replay-pasos-dia.mjs).
//
// El recorrido esperado no sale del catálogo de circuitos (el girasol de los silos no tiene circuito: Ingreso →
// Preingreso → pasa por Salida 2 → Playa 3 → Balanza → sale por Salida 1 sin cámara → puerto), sale de lo que hacen
// los camiones del grupo ese día: entre los recorridos que se repiten, el que explica más viajes del grupo.
// Faltante = nodo de ese recorrido sin lectura entre dos pasos leídos; sin entrada / sin salida = antes del primero
// o después del último (en los bordes del día es solo el corte).
// Uso: node scripts/recorridos-faltantes.mjs 2026-11-02
import fs from 'node:fs'
import path from 'node:path'
import { logicalLabel } from '../server/plantState/circuitPrefix.mjs'
import { plateSimilarity } from '../server/plantState/plateIdentification.mjs'

const root = process.cwd()
const day = process.argv[2] ?? '2026-11-02'
const dir = path.join(root, 'reportes', 'reconocimiento-pasos', day)
const lista = JSON.parse(fs.readFileSync(path.join(dir, 'pasos-por-camion.json'), 'utf8'))
const start = Date.parse(`${day}T00:00:00-03:00`)
const end = start + 86_400_000
const BORDE_MS = 3 * 3600_000
const hhmm = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(11, 16)
const plantaDe = (n) => (String(n).startsWith('SL_') ? 'SL' : 'Ric')
const ACCESO = new Set(['S0', 'S1', 'SL_S0', 'SL_S1'])
/** Recorrido de referencia: tiene que repetirse al menos estas veces en el grupo. */
const MIN_REPETICIONES = 3

/** Grupo del camión: el grano de su carta, o el tipo (Permitido, balanza, clasificado a mano). */
const grupoDe = (c) => (c.tipo.startsWith('carta') ? c.tipo.replace(/^carta \(|\)$/g, '') : c.tipo.startsWith('Permitido') ? c.tipo : c.tipo.replace(/ \(.*/, ''))

/**
 * Viajes del día de un camión. Empieza otro al volver a entrar a una planta donde ya pasó del acceso, o al volver a
 * Ricardone después de salir del puerto. Las horas sin lecturas entre dos nodos son esperas, no otro viaje.
 */
function viajes(pasos) {
  const out = []
  let cur = null
  for (const p of pasos) {
    const reentra = cur && ['S0', 'SL_S0'].includes(p.node) && cur.some((x) => plantaDe(x.node) === plantaDe(p.node) && !ACCESO.has(x.node))
    const vuelveDelPuerto = cur && plantaDe(p.node) === 'Ric' && ACCESO.has(p.node) && cur.some((x) => x.node === 'SL_S7') && plantaDe(cur.at(-1).node) === 'SL'
    if (!cur || reentra || vuelveDelPuerto) {
      cur = []
      out.push(cur)
    }
    cur.push(p)
  }
  return out
}

/**
 * Nodos en orden, sin repetir seguidos. La portería de San Lorenzo lee entrada y salida: una pasada por Egreso SL
 * seguida de otro nodo interno del puerto es la entrada (KDQ814, Egreso SL 09:35 antes de la balanza).
 */
function secuencia(v) {
  const out = []
  v.forEach((p, i) => {
    let node = p.node
    if (node === 'SL_S7' && v.slice(i + 1).some((x) => ['SL_S1', 'SL_S2', 'SL_S4', 'SL_S5', 'SL_S10', 'SL_S8'].includes(x.node))) node = 'SL_S0'
    if (out.at(-1)?.node !== node) out.push({ ...p, node })
  })
  return out
}

/** Subsecuencia común más larga (pares de índices alineados). */
function lcs(a, b) {
  const L = Array.from({ length: a.length + 1 }, () => new Int16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const pairs = []
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++ } else if (L[i + 1][j] >= L[i][j + 1]) i++
    else j++
  }
  return pairs
}
const esSub = (corta, larga) => lcs(larga, corta).length === corta.length

// 1. Viajes por grupo.
const CAMION = (tipo) => !/^(no camión|sin registro)/.test(tipo)
const camiones = lista.camiones.filter((c) => CAMION(c.tipo)).map((c) => {
  const pasos = (c.pasosDetalle ?? []).map((p) => ({ ...p, t: Date.parse(p.at) })).sort((a, b) => a.t - b.t)
  return { patente: c.patente, tipo: c.tipo, grupo: grupoDe(c), viajes: viajes(pasos).map((v) => ({ pasos: v, seq: secuencia(v) })) }
})
const porGrupo = new Map()
for (const c of camiones) for (const v of c.viajes) {
  if (!porGrupo.has(c.grupo)) porGrupo.set(c.grupo, [])
  porGrupo.get(c.grupo).push(v.seq.map((p) => p.node))
}

// 2. Recorrido de referencia de cada grupo, entre los que se repiten: el que más pasos leídos explica, restando los
//    pasos de más de cada viaje y los nodos que agrega sin lectura entre dos leídos (si no, gana el más largo:
//    el girasol salía con la Balanza dos veces y un 33 % de lectura).
const MIN_NODOS = 3
const MIN_EXPLICA = 0.4
const recorridoDe = new Map()
for (const [g, seqs] of porGrupo) {
  const cuenta = new Map()
  for (const s of seqs) cuenta.set(s.join(' '), (cuenta.get(s.join(' ')) ?? 0) + 1)
  const candidatos = [...cuenta].filter(([k, n]) => n >= MIN_REPETICIONES && k.split(' ').length >= MIN_NODOS).map(([k]) => k.split(' '))
  let best = null
  for (const r of candidatos) {
    let score = 0
    for (const s of seqs) {
      const pairs = lcs(r, s)
      if (!pairs.length) continue
      const internos = pairs.at(-1)[0] - pairs[0][0] + 1 - pairs.length
      score += pairs.length - (s.length - pairs.length) - internos
    }
    if (!best || score > best.score) best = { r, score }
  }
  if (!best) continue
  const explica = seqs.filter((s) => esSub(s, best.r)).length
  if (explica / seqs.length >= MIN_EXPLICA) recorridoDe.set(g, { r: best.r, explica, viajes: seqs.length })
}

// 4 (después de la 3). La captura busca camión: los pasos que el reconocedor dejó sin identificar se ofrecen a
// los huecos de los camiones (mismo nodo, entre sus dos lecturas). Casi todos los faltantes tenían una captura así
// (Volcables SL de la soja: 26 de 28): el hueco era del algoritmo, no de la cámara.
const sueltos = (lista.sueltos ?? []).map((s) => ({ ...s, t: Date.parse(s.at) }))
/** Con varios camiones posibles decide la patente: el que se parece claramente más a lo leído. */
const PARECIDO_MIN = 0.5
const PARECIDO_MARGEN = 0.15
function completarHuecos() {
  const huecos = []
  for (const c of camiones) for (const v of c.viajes) {
    if (!v.filas) continue
    v.filas.forEach((f, i) => {
      if (f.estado !== 'falta') return
      const prev = [...v.filas.slice(0, i)].reverse().find((x) => x.t)
      const next = v.filas.slice(i + 1).find((x) => x.t)
      if (prev && next) huecos.push({ c, v, f, desde: prev.t, hasta: next.t })
    })
  }
  const usados = new Set()
  let asignados = 0
  for (const [si, s] of sueltos.entries()) {
    const opciones = huecos.filter((h) => !h.f.t && h.f.node === s.node && s.t >= h.desde && s.t <= h.hasta)
    if (!opciones.length) continue
    let elegido = null
    let como = null
    if (new Set(opciones.map((h) => h.c.patente)).size === 1) { elegido = opciones[0]; como = 'único camión con ese hueco' }
    else {
      const sim = opciones.map((h) => ({ h, s: plateSimilarity(s.read, h.c.patente) })).sort((a, b) => b.s - a.s)
      if (sim[0].s >= PARECIDO_MIN && sim[0].s - (sim[1]?.s ?? 0) >= PARECIDO_MARGEN) { elegido = sim[0].h; como = `patente parecida (${Math.round(sim[0].s * 100)} %)` }
    }
    if (!elegido) continue
    usados.add(si)
    Object.assign(elegido.f, { t: s.t, estado: 'completado', leyo: s.read, device: s.device, como })
    asignados++
  }
  return { asignados, huecos: huecos.length, sueltosUsados: usados.size }
}

// 3. Cada viaje contra el recorrido de su grupo.
const porNodo = {}
let nViajes = 0
let completos = 0
let sinReferencia = 0
for (const c of camiones) {
  const ref = recorridoDe.get(c.grupo)
  for (const v of c.viajes) {
    nViajes++
    if (!ref) { v.estado = 'sin_referencia'; sinReferencia++; continue }
    const seen = v.seq
    const pairs = lcs(ref.r, seen.map((p) => p.node))
    const matched = new Map(pairs.map(([i, j]) => [i, seen[j]]))
    v.fuera = seen.filter((p, j) => !pairs.some(([, jj]) => jj === j))
    const i0 = pairs[0]?.[0] ?? 0
    const i1 = pairs.at(-1)?.[0] ?? -1
    const t0 = v.pasos[0].t
    const t1 = v.pasos.at(-1).t
    v.filas = ref.r.map((node, i) => {
      const p = matched.get(i)
      if (p) return { node, t: p.t, estado: 'leido' }
      if (i > i0 && i < i1) return { node, estado: 'falta' }
      if (i < i0) return { node, estado: t0 - start < BORDE_MS ? 'antes_del_dia' : 'sin_entrada' }
      return { node, estado: end - t1 < BORDE_MS ? 'sigue_despues' : 'sin_salida' }
    })
  }
}

// Foto antes de completar (lo que dejó el reconocedor), después la captura busca camión.
const faltantesAntes = camiones.reduce((n, c) => n + c.viajes.reduce((m, v) => m + (v.filas?.filter((f) => f.estado === 'falta').length ?? 0), 0), 0)
const completado = completarHuecos()
for (const c of camiones) {
  for (const v of c.viajes) {
    if (!v.filas) continue
    v.faltan = v.filas.filter((f) => ['falta', 'sin_entrada', 'sin_salida'].includes(f.estado))
    if (!v.faltan.length && !v.fuera.length) completos++
    for (const f of v.filas) {
      if (f.estado === 'antes_del_dia' || f.estado === 'sigue_despues') continue
      const k = `${c.grupo}|${f.node}`
      const pn = (porNodo[k] ??= { grupo: c.grupo, node: f.node, esperados: 0, leidos: 0, completado: 0, falta: 0, sin_entrada: 0, sin_salida: 0 })
      pn.esperados++
      if (f.estado === 'leido') pn.leidos++
      else pn[f.estado]++
    }
  }
}

// Informe.
const ICON = { completado: '✓ (captura sin asignar)', leido: '✓', falta: '✗', sin_entrada: '✗ entrada', sin_salida: '✗ salida', antes_del_dia: '· antes de las 00', sigue_despues: '· sigue' }
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—')
const nombre = (r) => r.map(logicalLabel).join(' → ')
const L = [
  `# Recorridos paso por paso — ${day}`,
  '',
  `${camiones.length} camiones, ${nViajes} viajes. Completos (todos los pasos de su recorrido vistos, sin pasos de más): ${completos} (${pct(completos, nViajes)}).`,
  `Huecos entre dos lecturas que dejó el reconocedor: ${faltantesAntes}. La captura busca camión completó ${completado.asignados} con capturas que había dejado sin identificar (mismo nodo, entre las dos lecturas del camión: único camión posible o patente claramente parecida).`,
  `El recorrido de referencia de cada grupo sale de los viajes del día (el que se repite y contiene a más viajes), no del catálogo de circuitos. ${sinReferencia} viajes de grupos sin un recorrido que se repita quedan sin comparar.`,
  'Generado con scripts/recorridos-faltantes.mjs.',
  '',
  '## Recorrido real de cada grupo',
  '',
  '| Grupo | Viajes | Recorrido de referencia | Viajes que entran en él |',
  '|---|---|---|---|',
  ...[...recorridoDe].sort((a, b) => b[1].viajes - a[1].viajes).map(([g, r]) => `| ${g} | ${r.viajes} | ${nombre(r.r)} | ${r.explica} (${pct(r.explica, r.viajes)}) |`),
  '',
  '## Qué paso falta, por grupo',
  '',
  '| Grupo | Nodo | Esperados | Leídos | Completados con captura sin asignar | % visto | Faltan en el medio | Sin entrada | Sin salida |',
  '|---|---|---|---|---|---|---|---|---|',
  ...Object.values(porNodo).sort((a, b) => a.grupo.localeCompare(b.grupo) || recorridoDe.get(a.grupo).r.indexOf(a.node) - recorridoDe.get(b.grupo).r.indexOf(b.node)).map((v) => `| ${v.grupo} | ${logicalLabel(v.node)} | ${v.esperados} | ${v.leidos} | ${v.completado} | ${pct(v.leidos + v.completado, v.esperados)} | ${v.falta} | ${v.sin_entrada} | ${v.sin_salida} |`),
  '',
  '## Camión por camión',
  '',
]
const faltasDe = (c) => c.viajes.reduce((s, v) => s + (v.faltan?.length ?? 0), 0)
for (const c of [...camiones].sort((a, b) => faltasDe(b) - faltasDe(a) || a.patente.localeCompare(b.patente))) {
  const f = faltasDe(c)
  L.push(`### ${c.patente} · ${c.tipo} · ${c.viajes.length} ${c.viajes.length === 1 ? 'viaje' : 'viajes'}${f ? ` · faltan ${f}` : ' · completo'}`, '')
  for (const v of c.viajes) {
    if (v.estado === 'sin_referencia') { L.push(`- ${hhmm(v.pasos[0].t)}–${hhmm(v.pasos.at(-1).t)} · sin recorrido de referencia: ${v.seq.map((p) => `${hhmm(p.t)} ${logicalLabel(p.node)}`).join(' › ')}`); continue }
    const extra = v.fuera.length ? ` · de más: ${v.fuera.map((p) => `${hhmm(p.t)} ${logicalLabel(p.node)}`).join(', ')}` : ''
    L.push(`- ${hhmm(v.pasos[0].t)}–${hhmm(v.pasos.at(-1).t)}: ${v.filas.map((x) => `${x.t ? hhmm(x.t) + ' ' : ''}${logicalLabel(x.node)} ${ICON[x.estado]}${x.leyo ? ` «${x.leyo}»` : ''}`).join(' › ')}${extra}`)
  }
  L.push('')
}
fs.writeFileSync(path.join(dir, 'recorridos.md'), L.join('\n') + '\n')
fs.writeFileSync(path.join(dir, 'recorridos.json'), JSON.stringify({ dia: day, viajes: nViajes, completos, recorridos: Object.fromEntries([...recorridoDe].map(([g, r]) => [g, { ...r, nombre: nombre(r.r) }])), porNodo, camiones: camiones.map((c) => ({ ...c, viajes: c.viajes.map(({ pasos, ...v }) => ({ ...v, desde: pasos[0].at, hasta: pasos.at(-1).at })) })) }, null, 1))
console.log(JSON.stringify({ camiones: camiones.length, viajes: nViajes, completos, sinReferencia, faltantesAntes, completado, recorridos: Object.fromEntries([...recorridoDe].map(([g, r]) => [g, `${nombre(r.r)} (${r.explica}/${r.viajes})`])) }, null, 1))
