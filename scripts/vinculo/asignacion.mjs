// Asignación conjunta: reparte muchas capturas entre muchos pasos pendientes a la vez, buscando el reparto de mayor
// peso total (algoritmo húngaro por componente conexa). Lo usa scripts/vinculo/cobertura.mjs: decidir captura por
// captura dejaba pasos sin llenar porque su única captura posible ya se la había llevado otro camión que tenía otra.

/** Húngaro (mínimo costo) sobre una matriz cuadrada. Devuelve para cada fila la columna asignada. */
function hungaro(cost) {
  const n = cost.length
  const u = new Float64Array(n + 1), v = new Float64Array(n + 1)
  const p = new Int32Array(n + 1), way = new Int32Array(n + 1)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Float64Array(n + 1).fill(Infinity)
    const used = new Uint8Array(n + 1)
    do {
      used[j0] = 1
      const i0 = p[j0]
      let delta = Infinity, j1 = 0
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0 }
        if (minv[j] < delta) { delta = minv[j]; j1 = j }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1 } while (j0)
  }
  const rowToCol = new Int32Array(n).fill(-1)
  for (let j = 1; j <= n; j++) if (p[j]) rowToCol[p[j] - 1] = j - 1
  return rowToCol
}

/**
 * Emparejamiento de peso máximo entre dos conjuntos.
 * @param {{ a: any, b: any, w: number }[]} edges  aristas con peso > 0 (a = paso, b = pasada de cámara)
 * @returns {Map<any, { b: any, w: number }>}  a → b elegido; lo que no conviene emparejar queda afuera
 */
export function emparejar(edges) {
  const out = new Map()
  const good = edges.filter((e) => e.w > 0)
  // Componentes conexas (unión-búsqueda): cada una se resuelve por separado.
  const parent = new Map()
  const find = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n } return r }
  const key = (side, x) => { const k = side === 'a' ? keyA(x) : keyB(x); if (!parent.has(k)) parent.set(k, k); return k }
  const ids = new Map()
  let seq = 0
  const idOf = (x) => { if (!ids.has(x)) ids.set(x, seq++); return ids.get(x) }
  const keyA = (x) => `a${idOf(x)}`
  const keyB = (x) => `b${idOf(x)}`
  for (const e of good) { const ka = find(key('a', e.a)), kb = find(key('b', e.b)); if (ka !== kb) parent.set(ka, kb) }
  const comps = new Map()
  for (const e of good) { const r = find(keyA(e.a)); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(e) }
  for (const list of comps.values()) {
    const A = [...new Set(list.map((e) => e.a))], B = [...new Set(list.map((e) => e.b))]
    if (A.length === 1 || B.length === 1) {
      const best = list.reduce((m, e) => (e.w > m.w ? e : m))
      out.set(best.a, { b: best.b, w: best.w })
      continue
    }
    const n = Math.max(A.length, B.length)
    const ia = new Map(A.map((x, i) => [x, i])), ib = new Map(B.map((x, i) => [x, i]))
    const W = Array.from({ length: n }, () => new Float64Array(n))
    for (const e of list) { const i = ia.get(e.a), j = ib.get(e.b); if (e.w > W[i][j]) W[i][j] = e.w }
    const cost = W.map((row) => Float64Array.from(row, (w) => -w))
    const sol = hungaro(cost)
    for (let i = 0; i < A.length; i++) { const j = sol[i]; if (j >= 0 && j < B.length && W[i][j] > 0) out.set(A[i], { b: B[j], w: W[i][j] }) }
  }
  return out
}
