// Patentes leídas bien en 2 o más puntos distintos que no están en carta, bases del back office ni SGC
// (docs/ANEXO_SEGURIDAD_SIN_REGISTRO.md). Lee el capas.json del replay por capas de cada día.
// Uso: node scripts/seguridad-sin-registro/listar.cjs <carpeta replays> <día> [día…]
//   <carpeta replays>/fin-<DD>/capas.json  (salida de scripts/replay-capas-dia.mjs AAAA-MM-DD <carpeta>/fin-<DD>)
// Escribe <carpeta replays>/sinreg-<días>.json con los pasos de cada vehículo.
const fs = require('fs')
const [dir, ...days] = process.argv.slice(2)
const out = []
const hh = (a) => new Date(Date.parse(a) - 3 * 3600e3).toISOString().slice(11, 16)
for (const d of days) {
  const c = require(`${dir}/fin-${d}/capas.json`)
  // Sin registro (capa 4), camión de granos sin carta, o lectura que nadie reconoció como caso pero no figura en nada.
  const P = c.pasosDetalle.filter((p) => (p.capa === '4' && /sin registro|granos sin carta/.test(p.detalle)) || p.capa === 'leida')
  const g = {}
  for (const p of P) (g[p.leida] ??= []).push(p)
  for (const [plate, l] of Object.entries(g)) {
    if (new Set(l.map((p) => `${p.site}|${p.nodo}`)).size < 2) continue
    const vehiculo = l.map((p) => /\(([^)]+)\)/.exec(p.motivo || '')?.[1]).find(Boolean) ?? null
    out.push({ dia: c.dia, plate, vehiculo, pasos: l.sort((a, b) => a.at.localeCompare(b.at)).map((p) => ({ at: p.at, site: p.site, nodo: p.nodo, device: p.device, capa: p.capa, detalle: p.detalle })) })
  }
}
fs.writeFileSync(`${dir}/sinreg-${days.join('-')}.json`, JSON.stringify(out, null, 1))
for (const v of out) console.log(v.dia, v.plate, v.vehiculo ?? '-', v.pasos.length, 'pasos:', v.pasos.map((p) => `${p.nodo}(${hh(p.at)})`).join(' → '))
