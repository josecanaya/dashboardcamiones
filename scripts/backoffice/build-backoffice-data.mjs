/**
 * Datos históricos del back office de Vehículos Autorizados (artifact docs/propuesta-en-vivo/backoffice).
 *
 * Arma docs/propuesta-en-vivo/backoffice/historico.json con:
 * - patentes: cada patente que movió el sistema de camiones en el Nodo Sur (cuántas veces, última,
 *   producto, cliente, si hace transile) para que comercial y portería vean quién es al tipearla.
 * - clientes: clientes de egreso (terceros) con sus productos y camiones habituales.
 * - transile: transiles Ricardone → puerto por día y los del último día con datos.
 * - livianos: los 93 vehículos sin sistema de camiones del comité de Seguridad, con foto y recorrido.
 *
 * Uso: node scripts/backoffice/build-backoffice-data.mjs
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const MOV = path.join(ROOT, 'data', 'movimientos')
const OUT_DIR = path.join(ROOT, 'docs', 'propuesta-en-vivo', 'backoffice')
const NODO_SUR = new Set(['RICARDONE', 'TERMINAL_EMBARQUE', 'RENOPACK'])
const PLANTA = { RICARDONE: 'ric', TERMINAL_EMBARQUE: 'sl', RENOPACK: 'reno' }

// Transile = sale de Ricardone entregado a Vicentin puerto (Excel) o par inferido por el SGC.
const esTransile = r =>
  r.planta_normalized === 'RICARDONE' && r.movement_type === 'EGRESO' &&
  (/VICENTIN.*(PUERTO|FLUVIAL)/.test(r.entregado_por_a || '') || /^SGC_TR_/.test(r.ctg || ''))
const esVicentin = r => /VICENTIN|RENOPACK/.test(`${r.entregado_por_a || ''} ${r.cliente_contrato || ''}`)
const clienteDe = r => (r.cliente_contrato || r.entregado_por_a || '').trim()
const dia = r => (r.external_salida_at || r.external_ingreso_at || r.source_date || '').slice(0, 10)
const hora = iso => (iso || '').slice(11, 16)
const top = (m, n = 1) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
const inc = (m, k, by = 1) => k && m.set(k, (m.get(k) || 0) + by)
// "BUNGE ARGENTINA S.A.-30700869918-231767" → nombre, CUIT, cuenta
function partesCliente(s) {
  const m = /^(.*?)-(\d{11})-(\d+)$/.exec(s)
  return m ? { nombre: m[1].trim(), cuit: m[2] } : { nombre: s, cuit: '' }
}

const dias = readdirSync(MOV).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
const pats = new Map()
const clientes = new Map()
const transPorDia = new Map()
const transDetalle = new Map()
const productosEgreso = new Map()
let filas = 0

for (const d of dias) {
  const f = path.join(MOV, d, 'movimientos.json')
  if (!existsSync(f)) continue
  for (const r of JSON.parse(readFileSync(f, 'utf8'))) {
    if (!NODO_SUR.has(r.planta_normalized) || r.baja) continue
    const p = r.plate_normalized
    if (!p || /^(X+|P+|T+)$/.test(p)) continue
    filas++
    const day = dia(r)
    const tr = esTransile(r)
    let e = pats.get(p)
    if (!e) pats.set(p, (e = { n: 0, ing: 0, egr: 0, tr: 0, ult: '', prod: new Map(), cli: new Map(), pl: new Map(), aco: '' }))
    e.n++
    r.movement_type === 'EGRESO' ? e.egr++ : e.ing++
    if (tr) e.tr++
    if (day >= e.ult) { e.ult = day; if (r.patente_acoplado) e.aco = r.patente_acoplado }
    inc(e.prod, r.product_normalized)
    inc(e.cli, clienteDe(r))
    inc(e.pl, PLANTA[r.planta_normalized])

    if (tr) {
      const prod = /PELLET/.test(r.product_normalized) ? 'pellet' : r.product_normalized === 'SOJA' ? 'soja' : 'otros'
      const t = transPorDia.get(day) || { pellet: 0, soja: 0, otros: 0 }
      t[prod]++
      transPorDia.set(day, t)
      if (!transDetalle.has(day)) transDetalle.set(day, [])
      transDetalle.get(day).push({ p, a: r.patente_acoplado || '', prod: r.product_normalized, sal: hora(r.external_salida_at), ing: hora(r.external_ingreso_at), kg: Number(r.kgs_neto) || null })
    } else if (r.movement_type === 'EGRESO' && !esVicentin(r) && clienteDe(r)) {
      const k = clienteDe(r)
      let c = clientes.get(k)
      if (!c) clientes.set(k, (c = { ...partesCliente(k), n: 0, ult: '', prod: new Map(), pats: new Map(), pl: new Map() }))
      c.n++
      if (day > c.ult) c.ult = day
      inc(c.prod, r.product_normalized)
      inc(c.pats, `${p}|${r.patente_acoplado || ''}`)
      inc(c.pl, PLANTA[r.planta_normalized])
      inc(productosEgreso, r.product_normalized)
    }
  }
}

// Diccionarios para que el índice de patentes pese poco: [n, ing, egr, tr, ult, prodIdx, cliIdx, planta, acoplado]
const prodDic = [], cliDic = []
const idx = (dic, map, v) => { if (!v) return -1; if (!map.has(v)) { map.set(v, dic.length); dic.push(v) } return map.get(v) }
const prodMap = new Map(), cliMap = new Map()
const patentes = {}
for (const [p, e] of pats) {
  patentes[p] = [e.n, e.ing, e.egr, e.tr, e.ult, idx(prodDic, prodMap, top(e.prod)[0]?.[0]), idx(cliDic, cliMap, partesCliente(top(e.cli)[0]?.[0] || '').nombre), top(e.pl)[0]?.[0] || '', e.aco]
}

const listaClientes = [...clientes.values()]
  .filter(c => c.n >= 3 && c.cuit !== '30500959629')
  .sort((a, b) => b.n - a.n)
  .map(c => ({
    nombre: c.nombre, cuit: c.cuit, n: c.n, ult: c.ult,
    prod: top(c.prod, 4).map(([k, n]) => [k, n]),
    pl: top(c.pl, 3).map(([k]) => k),
    camiones: top(c.pats, 40).map(([k, n]) => { const [p, a] = k.split('|'); return [p, a, n] }),
  }))

const diasTr = [...transPorDia.keys()].sort()
const ultDiaTr = diasTr.at(-1)
const habituales = [...pats.entries()].filter(([, e]) => e.tr >= 5).sort((a, b) => b[1].tr - a[1].tr).slice(0, 80).map(([p, e]) => [p, e.aco, e.tr, e.ult])

// Livianos (comité de Seguridad 12–25/10): sale del HTML de habilitación, que ya trae fotos, sectores y última lectura.
const hab = readFileSync(path.join(ROOT, 'docs', 'propuesta-en-vivo', 'habilitacion-vehiculos.html'), 'utf8')
const i0 = hab.indexOf('const DATA = ') + 'const DATA = '.length
// Las fotos se publican junto al artifact en habilitacion-vehiculos-fotos/ (misma ruta que en el HTML).
const livianos = JSON.parse(hab.slice(i0, hab.indexOf('\n', i0)).replace(/;\s*$/, ''))

const registro = JSON.parse(readFileSync(path.join(ROOT, 'data', 'truck-registry', 'registry.json'), 'utf8')).entries
  .filter(e => e.active).map(e => [e.plate, e.category, e.label || ''])

const out = {
  generado: new Date().toISOString(),
  desde: dias[0], hasta: dias.at(-1), filas,
  prodDic, cliDic, patentes,
  clientes: listaClientes,
  productosEgreso: top(productosEgreso, 30).map(([k, n]) => [k, n]),
  transile: {
    porDia: diasTr.map(d => [d, transPorDia.get(d).pellet, transPorDia.get(d).soja, transPorDia.get(d).otros]),
    ultimoDia: ultDiaTr,
    detalle: Object.fromEntries(diasTr.slice(-14).map(d => [d, transDetalle.get(d)])),
    habituales,
  },
  livianos,
  registro,
}
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(path.join(OUT_DIR, 'historico.json'), JSON.stringify(out))
console.log(`${filas} movimientos ${dias[0]}→${dias.at(-1)} · ${pats.size} patentes · ${listaClientes.length} clientes · transile ${diasTr.length} días (último ${ultDiaTr}) · ${livianos.lista.length} livianos`)
