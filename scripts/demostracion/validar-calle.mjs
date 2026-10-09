// Control con la calle del Excel (VOLCABLE PTO n): la cámara de la calle asignada al paso de Volcables SL tiene que
// ser SLZVolcableC<n>. Separa lo leído por cámara, lo corregido por patente y lo asignado por eliminación.
// Uso: node scripts/demostracion/validar-calle.mjs 2026-10-01 2026-10-07
import fs from 'node:fs'
const [from, to] = process.argv.slice(2)
const r = {}
for (let t = Date.parse(from + 'T12:00:00Z'); t <= Date.parse(to + 'T12:00:00Z'); t += 86400_000) {
  const d = new Date(t).toISOString().slice(0, 10), f = `outputs/demostracion_camaras/${d}_Q1Q2Q3Q4.json`
  if (!fs.existsSync(f)) continue
  for (const v of JSON.parse(fs.readFileSync(f, 'utf8')).porCamion) {
    const n = /VOLCABLE_PTO_(\d)/.exec(v.plataforma ?? '')?.[1]
    const p = v.pasos.find((x) => x.node === 'san_lorenzo:Plataformas Volcables')
    if (!n || !p?.device) continue
    const k = p.estado === 'camara' ? 'cámara' : p.via === 'eliminacion' ? 'eliminación' : 'corregido'
    const o = (r[k] ??= { pasos: 0, coincide: 0, otra: [] })
    o.pasos++
    if (p.device.toLowerCase() === `slzvolcablec${n}`) o.coincide++
    else if (o.otra.length < 8) o.otra.push(`${d} ${v.plate} Excel PTO ${n} → ${p.device} leyó ${p.leyo}`)
  }
}
for (const [k, o] of Object.entries(r)) { console.log(`${k.padEnd(12)} ${o.pasos} pasos · calle igual al Excel ${o.coincide} (${(o.coincide / o.pasos * 100).toFixed(0)} %)`); for (const x of o.otra) console.log('     ' + x) }
