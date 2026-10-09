// Lista de camiones que ninguna cámara reconoció en todo el viaje, con la hora de ingreso del Excel, para buscarlos en
// video. Uso: node scripts/demostracion/lista-faltantes.mjs 2026-10-01 2026-10-07
import fs from 'node:fs'
const [from, to] = process.argv.slice(2)
const rows = ['2026-09-21_2026-09-27', '2026-09-28_2026-10-04', '2026-10-05_2026-10-11'].flatMap((w) => JSON.parse(fs.readFileSync(`runs/windows/${w}/tables/excel_operations_with_truckflow.json`, 'utf8')).rows)
const norm = (p) => String(p ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
const out = []
for (let t = Date.parse(from + 'T12:00:00Z'); t <= Date.parse(to + 'T12:00:00Z'); t += 86400_000) {
  const d = new Date(t).toISOString().slice(0, 10), f = `outputs/demostracion_camaras/${d}_Q1Q2Q3Q4.json`
  if (!fs.existsSync(f)) continue
  const base = Date.parse(d + 'T00:00:00-03:00')
  for (const v of JSON.parse(fs.readFileSync(f, 'utf8')).porCamion) {
    if (!v.pasos.every((p) => p.estado === 'falta' || p.estado === 'excluido')) continue
    const ops = rows.filter((r) => norm(r.plate_normalized) === v.plate).map((r) => ({ r, t: Date.parse(r.external_ingreso_at + '-03:00') })).filter((x) => x.t >= base - 2 * 3600_000 && x.t < base + 22 * 3600_000).sort((a, b) => a.t - b.t)
    const o = ops[0]?.r
    out.push({ ingreso: o?.external_ingreso_at?.replace('T', ' ').slice(0, 16) ?? '?', salida: o?.external_salida_at?.replace('T', ' ').slice(0, 16) ?? '', patente: v.plate, circuito: v.circuito, entrada: v.pasos.find((p) => p.estado !== 'excluido')?.node.replace('ricardone:', '').replace('san_lorenzo:', '') + (v.pasos[0].node.startsWith('san_lorenzo') ? ' SL' : ' Ric'), producto: o?.product_normalized ?? '', plataforma: o?.platform_normalized ?? '', planta: o?.planta_normalized ?? '' })
  }
}
out.sort((a, b) => a.ingreso.localeCompare(b.ingreso))
const csv = ['ingreso_excel;salida_excel;patente;circuito;primer_punto_con_camara;producto;plataforma;planta', ...out.map((x) => [x.ingreso, x.salida, x.patente, x.circuito, x.entrada, x.producto, x.plataforma, x.planta].join(';'))].join('\n')
fs.writeFileSync(`outputs/demostracion_camaras/faltantes_${from}_${to}.csv`, csv + '\n')
console.log(csv)
