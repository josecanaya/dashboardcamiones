/**
 * Camiones del Sistema de camiones que las cámaras NUNCA leyeron, semana a semana (lunes→domingo).
 *
 * «Nunca leído» = en ninguna cámara de TruckFlow (eventos + alertas, todas las cámaras de las dos
 * plantas) aparece la patente exacta del camión ni la del acoplado entre 60 min antes del alta y
 * 30 min después de la salida del Sistema.
 *
 * Uso: node --max-old-space-size=8192 scripts/cruce-sistema-truckflow/nunca-leidos-semanal.mjs
 * Salida: reportes/cruce-sistema-truckflow/nunca-leidos-semanal.csv y .json
 */
import { writeFileSync } from 'fs'
import { join } from 'path'
import { loadReads, OUT_DIR } from './lecturas.mjs'
import { loadMovimientos, arDay, noCamion } from './sistema.mjs'

const MIN = 60_000
/** Hora Argentina con segundos (el Excel trae minutos; la balanza SGC, segundos). */
const conSeg = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')
const reads = loadReads()
const movs = loadMovimientos()
const tfFrom = arDay(reads[0].t)
const tfTo = arDay(reads.at(-1).t)
// Días sin lecturas de cámara (export vacío): ahí nadie fue leído, no cuenta.
const diasConCamaras = new Set(reads.map((r) => arDay(r.t)))

const byPlate = new Map()
for (const r of reads) {
  if (!r.plate) continue
  if (!byPlate.has(r.plate)) byPlate.set(r.plate, [])
  byPlate.get(r.plate).push(r.t)
}
const leido = (plate, a, b) => plate && (byPlate.get(plate) ?? []).some((t) => t >= a && t <= b)
const lunes = (day) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}
const domingo = (l) => new Date(Date.parse(`${l}T12:00:00Z`) + 6 * 86400_000).toISOString().slice(0, 10)

const semanas = new Map()
let evaluados = 0
for (const m of movs) {
  const day = arDay(m.ing)
  if (day < tfFrom || day > tfTo || !diasConCamaras.has(day)) continue
  evaluados++
  const a = m.ing - 60 * MIN
  const b = (Number.isFinite(m.sal) ? m.sal : m.ing + 14 * 60 * MIN) + 30 * MIN
  const w = lunes(day)
  const s = semanas.get(w) ?? { semana: `${w}_${domingo(w)}`, movimientos: 0, camionesSistema: new Set(), nunca: new Map() }
  s.movimientos++
  s.camionesSistema.add(m.plate)
  semanas.set(w, s)
  if (leido(m.plate, a, b) || leido(m.acoplado, a, b)) continue
  const x = s.nunca.get(m.plate) ?? { patente: m.plate, acoplado: m.acoplado, movimientos: 0, planta: new Set(), producto: new Set(), mov: new Set(), altas: [], salidas: [] }
  x.movimientos++
  x.planta.add(m.planta === 'TERMINAL_EMBARQUE' ? 'Puerto' : 'Ricardone')
  x.producto.add(m.producto)
  x.mov.add(m.mov)
  x.altas.push(conSeg(m.ing))
  x.salidas.push(Number.isFinite(m.sal) ? conSeg(m.sal) : '')
  if (m.acoplado) x.acoplado = m.acoplado
  s.nunca.set(m.plate, x)
}

// ¿La patente se leyó alguna vez en todo el período? (camión que la cámara conoce vs. nunca visto).
const vecesLeida = (p) => (byPlate.get(p) ?? []).length
const out = [...semanas.values()]
  .sort((a, b) => a.semana.localeCompare(b.semana))
  .map((s) => ({
    semana: s.semana,
    movimientos: s.movimientos,
    camionesSistema: s.camionesSistema.size,
    camionesNuncaLeidos: s.nunca.size,
    camiones: [...s.nunca.values()]
      .sort((a, b) => a.altas[0].localeCompare(b.altas[0]))
      .map((x) => ({
        patente: x.patente,
        acoplado: x.acoplado || '',
        movimientos: x.movimientos,
        planta: [...x.planta].join(' + '),
        producto: [...x.producto].join(' / '),
        tipo: [...x.mov].join(' / '),
        altas: x.altas,
        salidas: x.salidas,
        lecturasEnTodoElPeriodo: vecesLeida(x.patente),
      })),
  }))
const csvCell = (v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
const rows = [['semana', 'patente', 'acoplado', 'movimientos', 'planta', 'producto', 'tipo', 'hora_ingreso_sistema', 'hora_salida_sistema', 'veces_leida_en_todo_el_periodo']]
for (const s of out) for (const c of s.camiones) rows.push([s.semana, c.patente, c.acoplado, c.movimientos, c.planta, c.producto, c.tipo, c.altas.join(' | '), c.salidas.join(' | '), c.lecturasEnTodoElPeriodo])
writeFileSync(join(OUT_DIR, 'nunca-leidos-semanal.csv'), '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n'))
writeFileSync(join(OUT_DIR, 'nunca-leidos-semanal.json'), JSON.stringify({ generado: new Date().toISOString(), desde: tfFrom, hasta: tfTo, movimientosEvaluados: evaluados, noCamionesExcluidos: noCamion.n, semanas: out }, null, 1))
for (const s of out) console.log(`${s.semana}  movimientos ${s.movimientos}  camiones ${s.camionesSistema}  nunca leídos ${s.camionesNuncaLeidos}`)
