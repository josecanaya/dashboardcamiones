/**
 * Patrón CXV575 en el puerto San Lorenzo: visitas de cámara (lecturas de frente de una patente válida, cortes > 6 h)
 * que pasan por la Balanza de ingreso (SLZBalIngFte) y 25 min o más después por la Balanza de salida
 * (SLZBalSC1Fte / SLZBalSC2Fte) o, como reemplazo (la cámara de salida anduvo mal mucho tiempo), por el Egreso
 * (SLZSalidaC1Fte / SLZSalidaC2Fte, portería que lee en los dos sentidos), sin calada (SLZCalado) y sin ningún
 * movimiento del sistema (Excel/SGC, Ricardone o Terminal de Embarque) de ingreso −2 h a salida +2 h.
 * Las visitas con una patente parecida (costo OCR ≤ 1) con movimiento en la franja se marcan como mala lectura.
 *
 * Uso: node --max-old-space-size=8192 scripts/cruce-sistema-truckflow/balanza-sl-sin-sistema.mjs [desde] [hasta]
 *      (por defecto 2026-07-01 … hoy). Salida: reportes/barrera-sin-sistema/sl/{visitas-sl.csv, p1-sl.json}
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { createInterface } from 'readline'
import { join, resolve } from 'path'
import { CACHE, plateKey } from './lecturas.mjs'
import { arMs, arIso, arDay } from './sistema.mjs'
import { isValidPlate, weightedEditCost } from '../../server/plantState/plateIdentification.mjs'

const root = resolve(import.meta.dirname, '../..')
const [DESDE = '2026-07-01', HASTA = new Date().toISOString().slice(0, 10)] = process.argv.slice(2)
const SIN_DATOS = new Set(['2026-10-31'])   // sin Excel ni SGC
const MIN = 60_000
const HORA = 60 * MIN
const FAKE = /^(.)\1{3,}$/

// ── Sistema ────────────────────────────────────────────────────────────────────────────────────────
const movs = new Map()
for (const d of readdirSync(join(root, 'data/movimientos')).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
  const f = join(root, 'data/movimientos', d, 'movimientos.json')
  if (!existsSync(f)) continue
  for (const r of JSON.parse(readFileSync(f, 'utf8'))) {
    const id = String(r.external_operation_id ?? '')
    if (!id || movs.has(id)) continue
    const ing = arMs(String(r.external_ingreso_at ?? ''))
    const sal = arMs(String(r.external_salida_at ?? ''))
    if (!Number.isFinite(ing)) continue
    movs.set(id, {
      plate: plateKey(r.plate_normalized ?? r.patente_original), acoplado: plateKey(r.patente_acoplado),
      ing, sal: Number.isFinite(sal) && sal >= ing && sal - ing < 48 * HORA ? sal : NaN,
    })
  }
}
const allMovs = [...movs.values()]
const finMov = (m) => (Number.isFinite(m.sal) ? m.sal : m.ing + 24 * HORA)
const sistemaPlates = new Set(allMovs.flatMap((m) => [m.plate, m.acoplado]).filter(Boolean))
const movsPorPlate = new Map()
for (const m of allMovs) for (const p of [m.plate, m.acoplado]) if (p) (movsPorPlate.get(p) ?? movsPorPlate.set(p, []).get(p)).push(m)

// ── Lecturas de frente de San Lorenzo ──────────────────────────────────────────────────────────────
const REAR = /(Tr|Tras|Trasera|Traser)$/
const desde = Date.parse(`${DESDE}T03:00:00Z`)
const hasta = Date.parse(`${HASTA}T03:00:00Z`) + 24 * HORA
const reads = []
const seen = new Set()
await new Promise((ok) => {
  const rl = createInterface({ input: createReadStream(CACHE) })
  rl.on('line', (l) => {
    const day = l.slice(8, 18)
    if (day < DESDE.slice(0, 8) + '00' && day < DESDE) return
    for (const [t, dev, plate] of JSON.parse(l).reads) {
      if (!/^SLZ/.test(dev) || REAR.test(dev) || !plate) continue
      const k = `${t}|${dev}|${plate}`
      if (seen.has(k)) continue
      seen.add(k)
      reads.push({ t, dev, plate })
    }
  })
  rl.on('close', ok)
})
reads.sort((a, b) => a.t - b.t)
const byPlate = new Map()
for (const r of reads) (byPlate.get(r.plate) ?? byPlate.set(r.plate, []).get(r.plate)).push(r)

const BAL_ING = /^SLZBalIngFte$/
const BAL_SAL = /^SLZBalSC[12]Fte$/
const EGRESO = /^SLZSalidaC[12]Fte$/
const filas = []
for (const [plate, rs] of byPlate) {
  if (!isValidPlate(plate)) continue
  const visitas = []
  for (const r of rs) {
    const v = visitas.at(-1)
    if (v && r.t - v.at(-1).t <= 6 * HORA) v.push(r)
    else visitas.push([r])
  }
  for (const v of visitas) {
    const t0 = v[0].t
    const t1 = v.at(-1).t
    if (t0 < desde || t0 >= hasta || SIN_DATOS.has(arDay(t0))) continue
    if ((movsPorPlate.get(plate) ?? []).some((m) => m.ing - 2 * HORA <= t1 && finMov(m) + 2 * HORA >= t0)) continue
    const bi = v.find((r) => BAL_ING.test(r.dev))
    const salidaBal = bi && [...v].reverse().find((r) => BAL_SAL.test(r.dev) && r.t > bi.t)
    const salidaEgr = bi && [...v].reverse().find((r) => EGRESO.test(r.dev) && r.t > bi.t)
    const salida = salidaBal ?? salidaEgr
    const minutos = salida ? Math.round((salida.t - bi.t) / MIN) : null
    const calada = v.some((r) => r.dev === 'SLZCalado')
    const descarga = v.some((r) => /^SLZ(Volcable|TK400|BalLiq)/.test(r.dev))
    const parecidos = allMovs
      .filter((m) => m.ing - 2 * HORA <= t1 && finMov(m) + 2 * HORA >= t0 && !FAKE.test(m.plate))
      .filter((m) => [m.plate, m.acoplado].some((p) => p && p !== plate && weightedEditCost(plate, p) <= 1))
    const huella = minutos !== null && minutos >= 25 && !calada
    const prioridad = parecidos.length ? 9 : huella ? 1 : calada ? 4 : 5
    filas.push({
      plate, t0, prioridad,
      row: {
        prioridad, estado: sistemaPlates.has(plate) ? 'en_sistema_otro_dia' : 'nunca_en_sistema',
        mala_lectura: parecidos.length ? [...new Set(parecidos.map((m) => m.plate))].join('/') : '',
        patente: plate, dia: arDay(t0), primera: arIso(t0).slice(11), ultima: arIso(t1).slice(11), minutos: Math.round((t1 - t0) / MIN),
        bal_ingreso: bi ? arIso(bi.t).slice(11) : '', salida: salida ? `${salidaBal ? 'balanza' : 'egreso'} ${arIso(salida.t).slice(11)}` : '',
        min_balanzas: minutos ?? '', calada: calada ? 'si' : 'no', descarga: descarga ? 'si' : 'no', lecturas: v.length,
        camaras: [...new Set(v.map((r) => r.dev))].join(' '),
      },
    })
  }
}
filas.sort((a, b) => a.prioridad - b.prioridad || a.plate.localeCompare(b.plate) || a.t0 - b.t0)
const out = join(root, 'reportes/barrera-sin-sistema/sl')
mkdirSync(out, { recursive: true })
const cols = Object.keys(filas[0]?.row ?? { prioridad: 0 })
writeFileSync(join(out, 'visitas-sl.csv'), '﻿' + [cols, ...filas.map((f) => cols.map((c) => f.row[c]))].map((r) => r.map((x) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x)).join(',')).join('\n'))

// mismo formato que el agregado de Ricardone (entrada de cruce-registro-huella.mjs)
const porPlate = new Map()
for (const f of filas.filter((f) => f.prioridad !== 9)) (porPlate.get(f.plate) ?? porPlate.set(f.plate, []).get(f.plate)).push(f.row)
const p1 = [...porPlate].map(([p, rs]) => {
  const h = rs.filter((r) => r.prioridad === 1)
  return { p, p1: h.length, n: rs.length, estado: rs[0].estado, diasP1: [...new Set(h.map((r) => r.dia))].sort(), dias: [...new Set(rs.map((r) => r.dia))].sort(), filas: rs }
}).filter((x) => x.p1 > 0).sort((a, b) => b.p1 - a.p1 || b.n - a.n)
writeFileSync(join(out, 'p1-sl.json'), JSON.stringify(p1, null, 1))
console.log('visitas SL sin sistema', filas.length, '· con huella', filas.filter((f) => f.prioridad === 1).length, '· patentes con huella', p1.length, '· con 2+', p1.filter((x) => x.p1 >= 2).length)
