/**
 * Camiones de granos sin carta (granos-revisados.json) contra el SGC crudo (`data/sgc/<día>/ingresos.json`):
 * todo ingreso, también los que nunca cerraron (rechazados/dados de baja no llegan a movimientos).
 * Coincide si chasis o acoplado es la misma patente (o a 1 carácter) y FECHAINGRESO cae en la visita ±2 h.
 * Antes del 14/10 no hay SGC: el Excel por contrato no trae rechazos.
 *
 * Uso: node scripts/cruce-cartas-camaras/rechazos.mjs --excluir OVK247,LZP122 <carpeta> …
 *  → <carpeta>/granos-rechazos.json y resumen por consola
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { plateKey } from '../cruce-sistema-truckflow/lecturas.mjs'
import { arMs } from '../cruce-sistema-truckflow/sistema.mjs'

const root = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const excluir = new Set(args.includes('--excluir') ? args[args.indexOf('--excluir') + 1].split(',') : [])
const carpetas = args.filter((a, i) => a !== '--excluir' && args[i - 1] !== '--excluir')
const H = 3600_000
const SGC_DESDE = '2026-10-14'

const casi = (a, b) => {
  if (!a || !b || a.length !== b.length) return a === b
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false
  return true
}
const sgc = []
for (const d of readdirSync(join(root, 'data/sgc')).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
  const f = join(root, 'data/sgc', d, 'ingresos.json')
  if (!existsSync(f)) continue
  const j = JSON.parse(readFileSync(f, 'utf8'))
  for (const r of Array.isArray(j) ? j : Object.values(j)) sgc.push({ ...r, chasis: plateKey(r.PATENTECAMION), acoplado: plateKey(r.PATENTEACOPLADO), ing: arMs(r.FECHAINGRESO) })
}

for (const w of carpetas) {
  const dir = join(root, 'reportes/cruce-cartas-camaras', w)
  const gs = JSON.parse(readFileSync(join(dir, 'granos-revisados.json'), 'utf8')).filter(
    (g) => !excluir.has(g.patente) && (g.clase === 'sospechoso' || (g.clase === 'grano_con_sistema_sin_carta' && !/GIRASOL/.test(g.sistema?.producto ?? ''))),
  )
  const out = gs.map((g) => {
    const a = arMs(g.visita.desde.replace(' ', 'T')) - 2 * H
    const b = arMs(g.visita.hasta.replace(' ', 'T')) + 2 * H
    const conSgc = g.visita.hasta.slice(0, 10) >= SGC_DESDE
    const hit = sgc.find((r) => r.ing >= a && r.ing <= b && (casi(r.chasis, g.patente) || casi(r.acoplado, g.patente)))
    const sgcRes = hit
      ? {
          patente: hit.chasis,
          acoplado: hit.acoplado,
          producto: hit.PRODUCTO,
          planta: hit.PLANTA,
          ingreso: hit.FECHAINGRESO,
          salida: hit.FECHASALIDA,
          condicion: hit.CONDICION,
          baja: hit.BAJA,
          pesoBruto: hit.PESOBRUTO,
          deposito: hit.DEPOSITO1,
        }
      : null
    const explicacion = !conSgc
      ? 'sin_sgc_para_verificar'
      : !hit
        ? 'no_esta_en_sgc'
        : hit.CONDICION === 'RECHAZADO' || hit.BAJA
          ? 'rechazado_o_baja'
          : 'en_sgc_sin_rechazo'
    return { ...g, sgc: sgcRes, explicacion }
  })
  writeFileSync(join(dir, 'granos-rechazos.json'), JSON.stringify(out, null, 2))
  const cuenta = out.reduce((o, x) => ((o[x.explicacion] = (o[x.explicacion] ?? 0) + 1), o), {})
  console.log(`\n== ${w}`, JSON.stringify(cuenta))
  for (const g of out.filter((x) => x.explicacion !== 'sin_sgc_para_verificar'))
    console.log(
      `  ${g.explicacion.padEnd(20)} ${g.patente.padEnd(8)} ${g.visita.desde} → ${g.visita.hasta.slice(11)}` +
        (g.sgc ? ` | SGC ${g.sgc.patente}/${g.sgc.acoplado} ${g.sgc.producto} ${g.sgc.planta} ing ${g.sgc.ingreso.slice(5, 16)} sal ${(g.sgc.salida ?? '-').slice(5, 16)} ${g.sgc.condicion ?? ''} ${g.sgc.baja ?? ''} bruto ${g.sgc.pesoBruto ?? '-'}` : ''),
    )
}
