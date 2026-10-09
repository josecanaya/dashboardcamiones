// Elige al azar capturas malas (lectura inválida) con 2 a 5 camiones esperando y baja del DSS la foto de la
// captura y la última foto buena de cada candidato. Uso: node scripts/demostracion/simulador-fotos.mjs
import fs from 'node:fs'
import path from 'node:path'
import { isValidPlate } from '../../server/plantState/plateIdentification.mjs'

const root = process.cwd()
const dir = path.join(root, 'outputs/demostracion_camaras')
const out = path.join(dir, process.env.SIM ?? 'simulador')
fs.mkdirSync(out, { recursive: true })
const API = 'http://127.0.0.1:8787/api/truckflow/camera-captures'
const { decisiones } = JSON.parse(fs.readFileSync(path.join(dir, process.env.FUENTE ?? '2026-10-07_Q2Q3.json'), 'utf8'))
const base = Date.parse(`2026-10-07T${process.env.DESDE ?? '04:00'}:00-03:00`), fin = Date.parse(`2026-10-07T${process.env.HASTA ?? '16:00'}:00-03:00`)
const N = Number(process.env.N ?? 6)
// Capturas ya mostradas en simuladores o revisiones anteriores: no se repiten.
const vistas = new Set(['san_lorenzo:Plataformas Volcables|25951']) // minicargadora barrendera
for (const f of ['simulador/casos.json', 'simulador2/casos.json', 'simulador3/casos.json', 'simulador4/casos.json']) if (fs.existsSync(path.join(dir, f))) for (const c of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) vistas.add(c.node + '|' + c.leyo)
if (fs.existsSync(path.join(dir, 'corregidos-fotos.json'))) for (const c of JSON.parse(fs.readFileSync(path.join(dir, 'corregidos-fotos.json'), 'utf8'))) vistas.add(c.punto + '|' + c.leyo)
const editDist = (a, b) => { const d = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length] }
// Solo capturas que pasan los filtros y son de un camión posible: no es auto/camioneta/colectivo según el DSS, y
// o bien la lectura se parece a algún candidato (3 cambios o menos), o es un fragmento en una cámara de proceso.
const NOT = /sedan|suv|pickup|van|bus|car/i
const pool = decisiones.filter((d) => d.t >= base && d.t < fin && d.candidatos.length >= 2 && !isValidPlate(d.leyo) && !NOT.test(d.attrs?.tipo ?? '') &&
  (d.candidatos.some((c) => editDist(d.leyo, c.plate) <= 3) || d.proceso) && !vistas.has(d.node + '|' + d.leyo))
let seed = 20261007
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const pick = (list, n) => { const l = [...list], o = []; while (l.length && o.length < n) o.push(l.splice(Math.floor(rnd() * l.length), 1)[0]); return o }
const asig = pick(pool.filter((d) => d.elegido), N)
const elegidos = [...asig, ...pick(pool.filter((d) => !d.elegido), 2 * N - asig.length)].sort((a, b) => a.t - b.t)
console.log('candidatas a mostrar:', pool.length, '· asignadas', pool.filter((d) => d.elegido).length)

async function photo(device, tFeed, plate, name) {
  try {
    const r = await fetch(`${API}/find?device=${encodeURIComponent(device)}&at=${encodeURIComponent(tFeed)}&plate=${encodeURIComponent(plate ?? '')}`).then((x) => x.json())
    const cap = r.capture
    if (!cap?.sceneFile) return null
    const img = await fetch(`${API}/image?file=${encodeURIComponent(cap.sceneFile)}`)
    if (!img.ok) return null
    const file = path.join(out, `${name}.jpg`)
    fs.writeFileSync(file, Buffer.from(await img.arrayBuffer()))
    return { file: path.basename(file), dss: { color: cap.vehicleColor, marca: cap.vehicleBrand, tipo: cap.vehicleCategory, leyo: cap.plate } }
  } catch { return null }
}
const casos = []
let i = 0
for (const d of elegidos) {
  const id = `s${String(++i).padStart(2, '0')}`
  const captura = await photo(d.device, d.tFeed, d.leyo, `${id}_captura`)
  const candidatos = []
  let j = 0
  for (const c of d.candidatos.slice(0, 5)) candidatos.push({ ...c, foto: await photo(c.ultimoDevice, c.ultimoT, c.plate, `${id}_cand${++j}`) })
  casos.push({ id, ...d, captura, candidatos })
  console.log(id, d.node, d.leyo, captura ? 'foto' : 'sin foto', '·', candidatos.map((c) => `${c.plate}${c.foto ? '' : '(sin foto)'}`).join(', '), '· algoritmo:', d.elegido ?? 'sin asignar')
}
fs.writeFileSync(path.join(out, 'casos.json'), JSON.stringify(casos, null, 1) + '\n')
