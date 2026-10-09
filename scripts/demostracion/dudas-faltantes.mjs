// Dudas para revisar a ojo: los camiones que siguen faltando enteros en la semana. Para cada uno, las capturas que
// ningún camión se llevó en sus puntos de entrada alrededor de la hora en que entró (el Excel solo ubica la búsqueda)
// y, si hay, una foto buena del mismo camión de otro día para comparar.
// Uso: node scripts/demostracion/dudas-faltantes.mjs 2026-10-01 2026-10-07   (necesita el API en 8787)
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const [from, to] = process.argv.slice(2)
const out = path.join(root, 'outputs/demostracion_camaras', process.env.SIM ?? 'dudas1')
fs.mkdirSync(out, { recursive: true })
const API = 'http://127.0.0.1:8787/api/truckflow/camera-captures'
const days = []
for (let t = Date.parse(from + 'T12:00:00Z'); t <= Date.parse(to + 'T12:00:00Z'); t += 86400_000) days.push(new Date(t).toISOString().slice(0, 10))

// Capturas de toda la quincena
const caps = []
for (const f of ['data/dss-export/2026-09-24_30/capturas.csv', 'data/dss-export/2026-10-01_07/capturas.csv']) {
  const [head, ...lines] = fs.readFileSync(f, 'utf8').trim().split(/\r?\n/)
  const I = Object.fromEntries(head.split(',').map((k, i) => [k, i]))
  for (const l of lines) { const c = l.split(','); caps.push({ dev: c[I.camara], plate: c[I.patente], color: c[I.color], tipo: c[I.tipo], marca: c[I.marca], t: Date.parse(c[I.hora_camara].replace(' ', 'T') + '-03:00') }) }
}
const valid = (p) => /^[A-Z]{3}[0-9]{3}$|^[A-Z]{2}[0-9]{3}[A-Z]{2}$/.test(p)
const ed = (a, b) => { const d = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length] }

// Ingreso según Excel (solo para ubicar la búsqueda)
const rows = ['2026-09-28_2026-10-04', '2026-10-05_2026-10-11'].flatMap((w) => JSON.parse(fs.readFileSync(`runs/windows/${w}/tables/excel_operations_with_truckflow.json`, 'utf8')).rows)
const ingresoDe = (plate, day) => {
  const base = Date.parse(day + 'T00:00:00-03:00')
  return rows.map((r) => ({ r, t: Date.parse(String(r.external_ingreso_at) + '-03:00') })).filter((x) => String(x.r.plate_normalized).replace(/[^A-Z0-9]/g, '') === plate && x.t >= base - 2 * 3600_000 && x.t < base + 22 * 3600_000).sort((a, b) => a.t - b.t)[0]
}

// Capturas que ya son de algún camión (cualquier día corrido)
const usadas = new Set()
const faltan = []
for (const d of days) {
  const f = `outputs/demostracion_camaras/${d}_Q1Q2Q3Q4.json`
  if (!fs.existsSync(f)) continue
  const R = JSON.parse(fs.readFileSync(f, 'utf8'))
  for (const v of R.porCamion) for (const p of v.pasos) if (p.t) usadas.add(p.device.toLowerCase() + '|' + Math.round(Date.parse(p.t) / 1000))
  for (const v of R.porCamion) if (v.pasos.every((p) => p.estado === 'falta' || p.estado === 'excluido')) faltan.push({ day: d, ...v })
}
const usada = (c) => usadas.has(c.dev.toLowerCase() + '|' + Math.round(c.t / 1000))

// Entradas por planta: frontales de Pre ingreso Ricardone e Ingreso San Lorenzo (y la balanza de ingreso SL).
const ENTRADAS = { ric: ['RicPreIngInFr', 'RicCal03', 'RicCal04', 'RicCalLiq'], sl: ['SLZIngCamFrente', 'SLZBalIngFte'] }
const NOAUTO = /sedan|suv|pickup|van|bus/i

async function photo(dev, tCam, plate, name) {
  try {
    const at = new Date(tCam + 240_000).toISOString()
    const r = await fetch(`${API}/find?device=${encodeURIComponent(dev)}&at=${encodeURIComponent(at)}&plate=${encodeURIComponent(plate ?? '')}`).then((x) => x.json())
    if (!r.capture?.sceneFile) return null
    const img = await fetch(`${API}/image?file=${encodeURIComponent(r.capture.sceneFile)}`)
    if (!img.ok) return null
    fs.writeFileSync(path.join(out, name + '.jpg'), Buffer.from(await img.arrayBuffer()))
    return name + '.jpg'
  } catch { return null }
}

const casos = []
let i = 0
for (const f of faltan) {
  const ing = ingresoDe(f.plate, f.day)
  if (!ing) continue
  const id = `f${String(++i).padStart(2, '0')}`
  const planta = f.pasos[0].node.startsWith('san_lorenzo') ? 'sl' : 'ric'
  const devs = new Set(ENTRADAS[planta].map((x) => x.toLowerCase()))
  // Capturas sin dueño en la entrada, 40 min antes a 40 min después del ingreso; las más cercanas primero.
  const cand = caps.filter((c) => devs.has(c.dev.toLowerCase()) && Math.abs(c.t - ing.t) <= 40 * 60_000 && !usada(c) && !NOAUTO.test(c.tipo))
    .map((c) => ({ ...c, parecido: ed(c.plate, f.plate) }))
    .sort((a, b) => a.parecido - b.parecido || Math.abs(a.t - ing.t) - Math.abs(b.t - ing.t)).slice(0, 8).sort((a, b) => a.t - b.t)
  // Foto de referencia: la misma patente leída bien por una frontal otro día.
  const ref = caps.filter((c) => c.plate === f.plate && /Fr|Fte|Frente|Cal0|CalLiq/i.test(c.dev) && Math.abs(c.t - ing.t) > 6 * 3600_000).sort((a, b) => Math.abs(a.t - ing.t) - Math.abs(b.t - ing.t))[0]
  const caso = { id, dia: f.day, plate: f.plate, circuito: f.circuito, ingresoExcel: new Date(ing.t).toISOString(), referencia: null, candidatos: [] }
  if (ref) caso.referencia = { dev: ref.dev, t: new Date(ref.t).toISOString(), leyo: ref.plate, attrs: [ref.color, ref.marca, ref.tipo], foto: await photo(ref.dev, ref.t, ref.plate, `${id}_ref`) }
  let j = 0
  for (const c of cand) caso.candidatos.push({ dev: c.dev, t: new Date(c.t).toISOString(), leyo: c.plate, attrs: [c.color, c.marca, c.tipo], parecido: c.parecido, foto: await photo(c.dev, c.t, c.plate, `${id}_c${++j}`) })
  casos.push(caso)
  console.log(id, f.day, f.plate, f.circuito, '· ref', caso.referencia?.foto ? 'sí' : 'no', '·', caso.candidatos.map((c) => c.leyo + (c.foto ? '' : '(sin foto)')).join(', '))
}
fs.writeFileSync(path.join(out, 'casos.json'), JSON.stringify(casos, null, 1) + '\n')
