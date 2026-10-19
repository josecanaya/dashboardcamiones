/**
 * Movimientos del Sistema de camiones (`data/movimientos/<día>/movimientos.json`: Excel por contrato
 * hasta el 14/10, balanza SGC desde el 15/10). Solo Nodo Sur (Ricardone + Terminal de Embarque),
 * sin patentes ficticias (XXXXXX/PPPPPP/TTTTTT), sin duplicados entre particiones.
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { plateKey } from './lecturas.mjs'

const root = resolve(import.meta.dirname, '../..')
const NODO_SUR = new Set(['RICARDONE', 'TERMINAL_EMBARQUE'])
const FAKE_PLATE = /^(.)\1{3,}$/
/** Patente de camión: AAA999, AA999AA o AAA9A99. Afuera vagones (números), TOLVA, VENTA, etc. */
const PLATE_LIKE = /^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d[A-Z]\d{2})$/
/** Hora de pared sin zona → Argentina (-03:00). */
export const arMs = (s) => (s ? Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}-03:00`) : NaN)
export const arIso = (ms) => (Number.isFinite(ms) ? new Date(ms - 3 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '')
export const arDay = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)

/** Movimientos que no son camiones (vagones, TOLVA, VENTA…): se cuentan aparte. */
export const noCamion = { n: 0 }

export function loadMovimientos() {
  const dir = join(root, 'data/movimientos')
  const out = new Map()
  for (const d of readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) {
    const f = join(dir, d, 'movimientos.json')
    if (!existsSync(f)) continue
    const raw = JSON.parse(readFileSync(f, 'utf8'))
    const rows = Array.isArray(raw) ? raw : (raw.rows ?? raw.movimientos ?? [])
    const fuente = (() => {
      try {
        return JSON.parse(readFileSync(join(dir, d, 'SOURCE.json'), 'utf8')).source ?? 'excel'
      } catch {
        return 'excel'
      }
    })()
    for (const r of rows) {
      const id = String(r.external_operation_id ?? '')
      if (!id || out.has(id)) continue
      const planta = String(r.planta_normalized ?? '').toUpperCase()
      if (!NODO_SUR.has(planta)) continue
      const plate = plateKey(r.plate_normalized ?? r.patente_original)
      if (!plate || FAKE_PLATE.test(plate)) continue
      if (!PLATE_LIKE.test(plate) || /VAGON/.test(String(r.platform_normalized ?? ''))) {
        noCamion.n++
        continue
      }
      const ing = arMs(String(r.external_ingreso_at ?? ''))
      const sal = arMs(String(r.external_salida_at ?? ''))
      if (!Number.isFinite(ing)) continue
      out.set(id, {
        id,
        fuente,
        ingresoId: String(r.ingreso_id ?? ''),
        planta,
        mov: String(r.movement_type ?? ''),
        plate,
        acoplado: plateKey(r.patente_acoplado),
        producto: String(r.product_normalized ?? r.producto_original ?? ''),
        plataforma: String(r.platform_normalized ?? ''),
        ing,
        sal: Number.isFinite(sal) && sal >= ing && sal - ing < 48 * 3600_000 ? sal : NaN,
        calado: arMs(String(r.external_calado_at ?? '')),
      })
    }
  }
  return [...out.values()].sort((a, b) => a.ing - b.ing)
}
