/**
 * Para cada sospechoso de granos-revisados.json: ¿hay un alta del Sistema a ±10 min de su pasada por
 * Preingreso Ricardone cuya patente ninguna cámara leyó (±3 h)? Si la hay, es el mismo camión con otra
 * patente en el Sistema (tipeo o chapa distinta) y no un camión sin papeles.
 * Uso: node scripts/cruce-cartas-camaras/alta-gemela.mjs <carpeta> …  → agrega `altaGemela` y reescribe el json.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { loadReads } from '../cruce-sistema-truckflow/lecturas.mjs'
import { loadMovimientos, arMs, arIso } from '../cruce-sistema-truckflow/sistema.mjs'

const root = resolve(import.meta.dirname, '../..')
const H = 3600_000
const reads = loadReads()
const porPatente = new Map()
for (const r of reads) {
  if (!porPatente.has(r.plate)) porPatente.set(r.plate, [])
  porPatente.get(r.plate).push(r.t)
}
const movs = loadMovimientos()
const leida = (p, t) => (porPatente.get(p) ?? []).some((x) => Math.abs(x - t) <= 3 * H)
for (const w of process.argv.slice(2)) {
  const f = join(root, 'reportes/cruce-cartas-camaras', w, 'granos-revisados.json')
  const gs = JSON.parse(readFileSync(f, 'utf8'))
  for (const g of gs) {
    if (g.clase !== 'sospechoso') continue
    const a = arMs(g.visita.desde.replace(' ', 'T')) - H
    const b = arMs(g.visita.hasta.replace(' ', 'T')) + H
    const pre = reads.filter((r) => r.plate === g.patente && r.dev === 'RicPreIngInFr' && r.t >= a && r.t <= b).map((r) => r.t)
    const gem = []
    for (const t of pre)
      for (const m of movs)
        if (Math.abs(m.ing - t) <= 10 * 60_000 && m.planta && !leida(m.plate, m.ing)) gem.push({ patente: m.plate, ingreso: arIso(m.ing), producto: m.producto, mov: m.mov })
    g.altaGemela = gem.length ? gem : null
  }
  writeFileSync(f, JSON.stringify(gs, null, 2))
  const s = gs.filter((g) => g.clase === 'sospechoso')
  console.log(`== ${w}: sospechosos ${s.length}, con alta gemela ${s.filter((g) => g.altaGemela).length}, sin Preingreso ${s.filter((g) => !g.visita.camaras.includes('RicPreIngInFr')).length}`)
  for (const g of s.filter((x) => x.altaGemela)) console.log(`   ${g.patente} → ${g.altaGemela.map((x) => `${x.patente} ${x.ingreso.slice(5)} ${x.mov} ${x.producto}`).join(' | ')}`)
}
