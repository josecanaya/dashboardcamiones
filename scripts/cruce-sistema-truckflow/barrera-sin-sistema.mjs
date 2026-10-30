/**
 * Hipótesis «barrera»: un camión entra a Ricardone sin alta en el Sistema de camiones (le abren la
 * barrera), carga y se va. En el Sistema no queda nada; solo lo ven las cámaras. Análisis por mes.
 *
 *  A. Egresos de grano de Ricardone que no son «de la vuelta» (Excel por contrato), CON las patentes
 *     ficticias (XXXX/PPPP/TTTT): si tienen CTG y si las cámaras los vieron alguna vez en Ricardone.
 *     Los vistos están OK. Para las ficticias se listan las patentes que leyeron las cámaras de
 *     entrada y egreso alrededor de su ingreso y salida.
 *  B. Visitas de cámara a Ricardone (lecturas de frente de una misma patente válida, cortes > 6 h)
 *     sin ningún movimiento del Sistema (cualquier planta de Nodo Sur, ingreso −2 h … salida +2 h).
 *     Estado: nunca_en_sistema (la patente no figura en todo el período) / en_sistema_otro_dia.
 *     Se marca «posible_mala_lectura» si en esa franja hay un movimiento con patente parecida
 *     (Levenshtein ponderado OCR ≤ 1). El ruido (servicio, internos) se saca a mano.
 *     Núcleo (prioridad 1) = la huella de una carga real: balanza B1 ingreso → B2 egreso, ≥ 25 min,
 *     sin calada (ver el comentario de `prioridad`).
 *
 * Uso: node --max-old-space-size=8192 scripts/cruce-sistema-truckflow/barrera-sin-sistema.mjs --mes 2026-07
 * Salida: reportes/barrera-sin-sistema/<mes>/ (egresos-grano.csv, visitas-sin-sistema.csv, resumen.json)
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { createInterface } from 'readline'
import { join, resolve } from 'path'
import { CACHE, plateKey } from './lecturas.mjs'
import { arMs, arIso, arDay } from './sistema.mjs'
import { isValidPlate, weightedEditCost } from '../../server/plantState/plateIdentification.mjs'

const root = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const MES = args[args.indexOf('--mes') + 1]
if (!/^\d{4}-\d{2}$/.test(MES ?? '')) throw new Error('uso: --mes YYYY-MM')
const MIN = 60_000
const HORA = 60 * MIN
const desde = Date.parse(`${MES}-01T03:00:00Z`)
const hasta = (() => {
  const [y, m] = MES.split('-').map(Number)
  return Date.parse(`${new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)}T03:00:00Z`)
})()

const FAKE = /^(.)\1{3,}$/
const GRANO = /PELLET|GIRASOL|SOJA|MAIZ|TRIGO|SORGO|CEBADA|HARINA|EXPELLER|CASCARA|MERMA|SEMILLA|AFRECHILLO|POROTO/
const NO_GRANO = /ACEITE|AC ?GIRASOL|LECITINA|GLICERINA|BIODIESEL|ENVASADO|REFINADO|CRUDO/

// ── Sistema (Excel / SGC) ───────────────────────────────────────────────────────────────────────
const movs = new Map()
for (const d of readdirSync(join(root, 'data/movimientos')).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
  const f = join(root, 'data/movimientos', d, 'movimientos.json')
  if (!existsSync(f)) continue
  const fuente = (() => {
    try {
      return JSON.parse(readFileSync(join(root, 'data/movimientos', d, 'SOURCE.json'), 'utf8')).source ?? 'excel'
    } catch {
      return 'excel'
    }
  })()
  for (const r of JSON.parse(readFileSync(f, 'utf8'))) {
    const id = String(r.external_operation_id ?? '')
    if (!id || movs.has(id)) continue
    if (!['RICARDONE', 'TERMINAL_EMBARQUE'].includes(String(r.planta_normalized ?? '').toUpperCase())) continue
    const ing = arMs(String(r.external_ingreso_at ?? ''))
    const sal = arMs(String(r.external_salida_at ?? ''))
    movs.set(id, {
      id,
      fuente,
      planta: r.planta_normalized,
      mov: r.movement_type,
      plate: plateKey(r.plate_normalized ?? r.patente_original),
      acoplado: plateKey(r.patente_acoplado),
      producto: String(r.product_normalized ?? ''),
      plataforma: String(r.platform_normalized ?? ''),
      vuelta: r.es_de_vuelta === true,
      ctg: String(r.ctg ?? '').trim(),
      contrato: String(r.contrato ?? ''),
      cliente: String(r.cliente_contrato ?? ''),
      entregado: String(r.entregado_por_a ?? ''),
      kg: Number(r.kgs_neto) || 0,
      ing,
      sal: Number.isFinite(sal) && sal >= ing && sal - ing < 48 * HORA ? sal : NaN,
    })
  }
}
const allMovs = [...movs.values()].filter((m) => Number.isFinite(m.ing))
const sistemaPlates = new Set(allMovs.flatMap((m) => [m.plate, m.acoplado]).filter(Boolean))
const finMov = (m) => (Number.isFinite(m.sal) ? m.sal : m.ing + 24 * HORA)

// ── Lecturas de Ricardone del mes (±1 día) ──────────────────────────────────────────────────────
const RIC = /^Ric/
const REAR = /(Tr|Tras|Trasera|Traser)$/
const ENTRADA = /^(RicPreIngInFr|RicIngCamFrente)$/
const EGRESO = /^RicEgrCamFrente$/
const CARGA = /^Ric(C16Carga|S8Carga|S7Carga)/
const BALANZA = /^RicB\d/
/** Puntos de adentro: calada, balanzas, volcables, Celda 16. */
const INTERIOR = /^Ric(Cal|B\d|Volcable|C16)/
const dias = new Set()
for (let t = desde - 86400_000; t < hasta + 86400_000; t += 86400_000) dias.add(new Date(t).toISOString().slice(0, 10))
const reads = []
await new Promise((ok) => {
  const rl = createInterface({ input: createReadStream(CACHE) })
  rl.on('line', (l) => {
    const day = l.slice(8, 18)
    if (!dias.has(day)) return
    for (const [t, dev, plate] of JSON.parse(l).reads) if (RIC.test(dev)) reads.push({ t, dev, plate, rear: REAR.test(dev) })
  })
  rl.on('close', ok)
})
const seenKey = new Set()
const uniq = reads
  .filter((r) => {
    const k = `${r.t}|${r.dev}|${r.plate}`
    return seenKey.has(k) ? false : seenKey.add(k)
  })
  .sort((a, b) => a.t - b.t)
const byPlate = new Map()
for (const r of uniq) {
  if (!r.plate) continue
  ;(byPlate.get(r.plate) ?? byPlate.set(r.plate, []).get(r.plate)).push(r)
}
const diasCamara = new Set(uniq.map((r) => arDay(r.t)))

const csv = (rows) => '﻿' + rows.map((r) => r.map((v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : (v ?? ''))).join(',')).join('\n')
const outDir = join(root, 'reportes/barrera-sin-sistema', MES)
mkdirSync(outDir, { recursive: true })
const resumen = { mes: MES, diasConCamaras: [...diasCamara].filter((d) => d.startsWith(MES)).length, lecturasRicardone: uniq.length }

// ── A. Egresos de grano de Ricardone ────────────────────────────────────────────────────────────
const egresos = allMovs.filter(
  (m) => m.planta === 'RICARDONE' && m.mov === 'EGRESO' && !m.vuelta && GRANO.test(m.producto) && !NO_GRANO.test(m.producto) && finMov(m) >= desde && finMov(m) < hasta
)
const resumenLecturas = (rs) => rs.map((r) => `${r.plate || '∅'}@${r.dev.replace(/^Ric/, '')} ${arIso(r.t).slice(11)}`).join(' ')
const filasA = egresos.map((m) => {
  const fake = FAKE.test(m.plate)
  const tieneCtg = m.ctg !== '' && m.ctg !== '0'
  const a = m.ing - 30 * MIN
  const b = finMov(m) + 30 * MIN
  const vistas = fake ? [] : [...(byPlate.get(m.plate) ?? []), ...(m.acoplado ? (byPlate.get(m.acoplado) ?? []) : [])].filter((r) => r.t >= a && r.t <= b)
  const estado = fake ? 'patente_ficticia' : vistas.length ? 'visto_ok' : 'no_visto'
  // Para ficticias y no vistos: qué leyeron entrada y egreso alrededor del ingreso y de la salida.
  const cerca = (t, re) => (Number.isFinite(t) ? uniq.filter((r) => re.test(r.dev) && Math.abs(r.t - t) <= 10 * MIN) : [])
  return {
    m,
    fake,
    tieneCtg,
    estado,
    row: [
      estado,
      m.plate,
      m.acoplado,
      m.producto,
      m.plataforma,
      tieneCtg ? m.ctg : '',
      m.contrato,
      m.cliente,
      m.entregado,
      m.kg,
      arIso(m.ing),
      arIso(m.sal),
      [...new Set(vistas.map((r) => r.dev))].join(' '),
      estado === 'visto_ok' ? '' : resumenLecturas(cerca(m.ing, ENTRADA)),
      estado === 'visto_ok' ? '' : resumenLecturas(cerca(m.sal, EGRESO)),
    ],
  }
})
writeFileSync(
  join(outDir, 'egresos-grano.csv'),
  csv([
    ['estado', 'patente', 'acoplado', 'producto', 'plataforma', 'ctg', 'contrato', 'cliente', 'entregado_por_a', 'kg_neto', 'ingreso', 'salida', 'camaras_que_lo_vieron', 'lecturas_entrada_±10min_ingreso', 'lecturas_egreso_±10min_salida'],
    ...filasA.sort((x, y) => x.row[0].localeCompare(y.row[0]) || x.m.ing - y.m.ing).map((x) => x.row),
  ])
)
const cuenta = (xs, k) => xs.reduce((o, x) => ((o[k(x)] = (o[k(x)] ?? 0) + 1), o), {})
resumen.egresosGrano = {
  total: filasA.length,
  porEstado: cuenta(filasA, (x) => x.estado),
  conCtg: filasA.filter((x) => x.tieneCtg).length,
  sinCtgPorProducto: cuenta(filasA.filter((x) => !x.tieneCtg), (x) => x.m.producto),
  kgSinCtgSinFicticias: filasA.filter((x) => !x.tieneCtg && !x.fake).reduce((s, x) => s + x.m.kg, 0),
  ingresoIgualSalida: filasA.filter((x) => x.m.sal === x.m.ing).length,
}

// ── B. Visitas de cámara a Ricardone sin movimiento ─────────────────────────────────────────────
const movsPorPlate = new Map()
for (const m of allMovs) for (const p of [m.plate, m.acoplado]) if (p) (movsPorPlate.get(p) ?? movsPorPlate.set(p, []).get(p)).push(m)
const filasB = []
for (const [plate, rs] of byPlate) {
  if (!isValidPlate(plate)) continue
  const front = rs.filter((r) => !r.rear)
  if (!front.length) continue
  // visitas: cortes > 6 h entre lecturas de frente
  const visitas = []
  for (const r of front) {
    const v = visitas.at(-1)
    if (v && r.t - v.at(-1).t <= 6 * HORA) v.push(r)
    else visitas.push([r])
  }
  for (const v of visitas) {
    const t0 = v[0].t
    const t1 = v.at(-1).t
    if (t0 < desde || t0 >= hasta) continue
    const enSistema = (movsPorPlate.get(plate) ?? []).some((m) => m.ing - 2 * HORA <= t1 && finMov(m) + 2 * HORA >= t0)
    if (enSistema) continue
    const devs = [...new Set(v.map((r) => r.dev))]
    const parecidos = allMovs
      .filter((m) => m.ing - 2 * HORA <= t1 && finMov(m) + 2 * HORA >= t0 && !FAKE.test(m.plate))
      .filter((m) => [m.plate, m.acoplado].some((p) => p && p !== plate && weightedEditCost(plate, p) <= 1))
    const ficticiasCerca = allMovs.filter((m) => FAKE.test(m.plate) && Math.abs(m.ing - t0) <= 30 * MIN)
    const entrada = v.some((r) => ENTRADA.test(r.dev))
    const egreso = v.some((r) => EGRESO.test(r.dev))
    const adentro = v.some((r) => INTERIOR.test(r.dev))
    const calada = v.some((r) => /^RicCal/.test(r.dev))
    const carga = v.some((r) => CARGA.test(r.dev))
    const balanza = v.some((r) => BALANZA.test(r.dev))
    // Huella de una carga real (medida en los egresos de julio del Excel): entra por la balanza B1,
    // sale por la B2 (nunca la B3, que es de livianos) 25 min o más después, sin calada; no sale por
    // Salida 2. Validado con la clasificación a mano de julio: con < 30 min, una sola balanza o B3
    // no hubo ningún candidato.
    const b1 = v.find((r) => /^RicB1Ingreso$/.test(r.dev))
    const b2 = b1 && [...v].reverse().find((r) => /^RicB2Egreso$/.test(r.dev) && r.t > b1.t)
    const minBalanza = b2 ? Math.round((b2.t - b1.t) / MIN) : null
    // 1 = huella de carga: B1 ingreso → B2 egreso, ≥ 25 min, sin calada.
    // 2 = pasó por un punto de carga (Celda 16, Silo Keppler S7, Silo Chief S8) sin calada.
    // 3 = entra y sale por Salida 2 sin calada ni balanza, ≥ 30 min (vino a descargar y no entró).
    // 4 = pasó por calada (vino cargado: rechazo / esperó).  5 = no tiene la huella (< 30 min, una
    // sola balanza, B3, accesos sueltos).  9 = posible mala lectura.
    const prioridad = parecidos.length ? 9
      : minBalanza !== null && minBalanza >= 25 && !calada ? 1
      : carga && !calada ? 2
      : entrada && egreso && !calada && !balanza && t1 - t0 >= 30 * MIN ? 3
      : calada ? 4 : 5
    const masCercano = (movsPorPlate.get(plate) ?? []).map((m) => (m.ing - t0) / HORA).sort((a, b) => Math.abs(a) - Math.abs(b))[0]
    filasB.push({
      plate,
      t0,
      prioridad,
      reads: v,
      row: [
        prioridad,
        sistemaPlates.has(plate) ? 'en_sistema_otro_dia' : 'nunca_en_sistema',
        parecidos.length ? `posible_mala_lectura:${[...new Set(parecidos.map((m) => m.plate))].join('/')}` : '',
        plate,
        arDay(t0),
        arIso(t0).slice(11),
        arIso(t1).slice(11),
        Math.round((t1 - t0) / MIN),
        entrada ? 'si' : 'no',
        egreso ? 'si' : 'no',
        adentro ? 'si' : 'no',
        calada ? 'si' : 'no',
        balanza ? 'si' : 'no',
        carga ? 'si' : 'no',
        minBalanza ?? '',
        masCercano === undefined ? '' : Math.round(masCercano),
        v.length,
        devs.join(' '),
        ficticiasCerca.map((m) => `${m.plate} ${m.mov} ${m.producto} ${arIso(m.ing).slice(11)}`).join(' | '),
      ],
    })
  }
}
filasB.sort((a, b) => a.prioridad - b.prioridad || a.row[1].localeCompare(b.row[1]) || a.t0 - b.t0)
writeFileSync(
  join(outDir, 'visitas-sin-sistema.csv'),
  csv([
    ['prioridad', 'estado', 'mala_lectura', 'patente', 'dia', 'primera', 'ultima', 'minutos', 'entrada', 'egreso_ric', 'paso_adentro', 'calada', 'balanza', 'punto_carga', 'min_b1_b2', 'mov_mas_cercano_h', 'lecturas', 'camaras', 'ficticia_±30min'],
    ...filasB.map((x) => x.row),
  ])
)
const filtro = (f) => filasB.filter(f).length
resumen.visitasSinSistema = {
  total: filasB.length,
  nuncaEnSistema: filtro((x) => x.row[1] === 'nunca_en_sistema'),
  enSistemaOtroDia: filtro((x) => x.row[1] === 'en_sistema_otro_dia'),
  posibleMalaLectura: filtro((x) => x.prioridad === 9),
  porPrioridad: cuenta(filasB, (x) => x.prioridad),
  malaLecturaEnCargaOBalanza: filtro((x) => x.prioridad === 9 && (x.row[12] === 'si' || x.row[13] === 'si')),
  prioridad1PorEstado: cuenta(filasB.filter((x) => x.prioridad === 1), (x) => x.row[1]),
  prioridad1Patentes: new Set(filasB.filter((x) => x.prioridad === 1).map((x) => x.plate)).size,
}

// ── C. Patentes ficticias de Ricardone (todas, cualquier producto) ↔ visitas sin movimiento ──────
// Si la barrera se abre sin alta, el registro puede quedar con patente ficticia: candidatos = visitas
// sin movimiento con lectura de entrada o egreso a ±30 min del ingreso o la salida del registro.
const ficticias = allMovs.filter((m) => m.planta === 'RICARDONE' && FAKE.test(m.plate) && m.ing >= desde && m.ing < hasta)
const visitasLimpias = filasB.filter((x) => x.prioridad !== 9)
const filasC = ficticias.map((m) => {
  const cand = visitasLimpias.filter((x) =>
    x.reads.some((r) => (ENTRADA.test(r.dev) || EGRESO.test(r.dev)) && [m.ing, m.sal].some((t) => Number.isFinite(t) && Math.abs(r.t - t) <= 30 * MIN))
  )
  return [m.plate, m.mov, m.producto, m.plataforma, m.contrato, m.cliente, m.kg, arIso(m.ing), arIso(m.sal), m.sal === m.ing ? 'si' : 'no', cand.length, cand.map((x) => `${x.plate}(P${x.prioridad} ${arIso(x.t0).slice(11)})`).join(' ')]
})
writeFileSync(
  join(outDir, 'ficticias-ricardone.csv'),
  csv([['patente', 'mov', 'producto', 'plataforma', 'contrato', 'cliente', 'kg_neto', 'ingreso', 'salida', 'ingreso_igual_salida', 'candidatos', 'visitas_sin_sistema_±30min'], ...filasC])
)
resumen.ficticiasRicardone = {
  total: ficticias.length,
  porProducto: cuenta(ficticias, (m) => `${m.mov} ${m.producto}`),
  ingresoIgualSalida: ficticias.filter((m) => m.sal === m.ing).length,
  conCandidatos: filasC.filter((r) => r[10] > 0).length,
}
writeFileSync(join(outDir, 'resumen.json'), JSON.stringify(resumen, null, 1))
console.log(JSON.stringify(resumen, null, 1))
