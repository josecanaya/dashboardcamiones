/**
 * Segunda pasada sobre granoSinCarta (cruce.mjs) de varias semanas: por cada sospechoso busca una carta
 * con patente parecida (≤2 caracteres, Levenshtein) leída en planta ±45 min de su visita → mala lectura
 * repetida. Escribe granos-revisados.json en cada carpeta.
 *
 * Uso: node scripts/cruce-cartas-camaras/revisar-granos.mjs 2026-09-28_2026-10-04 2026-10-05_2026-10-11 …
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { loadReads } from '../cruce-sistema-truckflow/lecturas.mjs'
import { arMs } from '../cruce-sistema-truckflow/sistema.mjs'

const root = resolve(import.meta.dirname, '../..')
const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}
const cartaPlates = new Set()
for (const c of JSON.parse(readFileSync(join(root, 'data/arca/arca_consignment_notes.json'), 'utf8'))) for (const p of c.transport?.plates ?? []) cartaPlates.add(p.toUpperCase())
const reads = loadReads().filter((r) => cartaPlates.has(r.plate))
for (const w of process.argv.slice(2)) {
  const dir = join(root, 'reportes/cruce-cartas-camaras', w)
  const c = JSON.parse(readFileSync(join(dir, 'cruce.json'), 'utf8'))
  const out = []
  for (const g of c.granoSinCarta) {
    if (g.clase !== 'sospechoso') {
      out.push(g)
      continue
    }
    const a = arMs(g.visita.desde.replace(' ', 'T')) - 45 * 60_000
    const b = arMs(g.visita.hasta.replace(' ', 'T')) + 45 * 60_000
    const cand = new Map()
    for (const r of reads) if (r.t >= a && r.t <= b && !cand.has(r.plate) && lev(g.patente, r.plate) <= 2) cand.set(r.plate, lev(g.patente, r.plate))
    const parecida = [...cand].sort((x, y) => x[1] - y[1])[0]
    // Misma patente que una carta, pero de otro viaje: vino ese día sin carta → sigue sospechoso.
    if (parecida && parecida[0] === g.patente) out.push({ ...g, clase: 'sospechoso', notas: 'tiene cartas de otros viajes' })
    else out.push(parecida ? { ...g, clase: 'mala_lectura_de_carta', cartaParecida: parecida[0] } : g)
  }
  writeFileSync(join(dir, 'granos-revisados.json'), JSON.stringify(out, null, 2))
  const cuenta = out.reduce((o, x) => ((o[x.clase] = (o[x.clase] ?? 0) + 1), o), {})
  console.log(`\n== ${w}`, JSON.stringify(cuenta))
  for (const g of out.filter((x) => ['sospechoso', 'mala_lectura_de_carta'].includes(x.clase)))
    console.log(`  ${g.clase.padEnd(22)} ${g.patente.padEnd(8)} ${g.cartaParecida ? '≈' + g.cartaParecida.padEnd(8) : '         '} ${g.visita.desde} → ${g.visita.hasta.slice(11)} | ${g.visita.camaras.join(' ')}`)
}
