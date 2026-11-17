// Cruza las patentes con huella de carga sin sistema (p1.json) contra back office, no-camiones,
// clasificación manual, Permitidos (balanza) y cartas de porte.
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
const root = process.cwd()
const [p1File, outFile] = process.argv.slice(2)
const p1 = JSON.parse(readFileSync(p1File, 'utf8'))
const J = (f) => JSON.parse(readFileSync(join(root, f), 'utf8'))

const noCam = new Map(J('data/padron/no-camiones.json').entries.map((e) => [e.plate, e.kind]))
const manual = new Map(J('data/padron/clasificacion-manual.json').entries.map((e) => [e.plate, e.tipo]))
const perm = new Map(J('data/padron/vehiculos-permitidos.json').entries.map((e) => [e.plate, e]))

// cartas: padron diario + ARCA
const cartas = new Map()
const addCarta = (plate, day) => { if (plate) (cartas.get(plate) ?? cartas.set(plate, new Set()).get(plate)).add(day) }
const txt = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
for (const f of readdirSync(join(root, 'data/padron')).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
  const raw = readFileSync(join(root, 'data/padron', f), 'utf8')
  for (const m of raw.matchAll(/"plates"\s*:\s*\[([^\]]*)\]/g)) for (const q of m[1].matchAll(/"([^"]+)"/g)) addCarta(txt(q[1]), f.slice(0, 10))
}
try {
  const raw = readFileSync(join(root, 'data/arca/arca_consignment_notes.json'), 'utf8')
  for (const m of raw.matchAll(/"plates"\s*:\s*\[([^\]]*)\]/g)) for (const q of m[1].matchAll(/"([^"]+)"/g)) addCarta(txt(q[1]), 'arca')
  for (const m of raw.matchAll(/"dominio"\s*:\s*"([^"]+)"/g)) addCarta(txt(m[1]), 'arca')
} catch {}

// back office (MongoDB)
const bo = new Map()
try {
  const { connectBackofficeDb, BASES } = await import(join(root, 'server/live/padron/padronDb.mjs').replace(/\\/g, '/').replace(/^/, 'file:///'))
  for (const base of Object.keys(BASES)) {
    const db = await connectBackofficeDb(base)
    for (const v of await db.vehiculos.find({}).toArray()) {
      const p = txt(v.patente ?? v.plate ?? v._id)
      bo.set(p, `${base}:${v.decision?.categoria ?? v.categoria ?? ''}`)
    }
    await db.close()
  }
} catch (e) {
  console.error('MongoDB no disponible:', e.message)
}
console.error('back office:', bo.size, 'cartas patentes:', cartas.size)

const res = p1.map((x) => {
  const pm = perm.get(x.p)
  return {
    patente: x.p,
    visitasHuella: x.p1,
    visitas: x.n,
    diasHuella: x.diasP1,
    primera: x.dias[0],
    ultima: x.dias.at(-1),
    estado: x.estado,
    noCamion: noCam.get(x.p) ?? null,
    manual: manual.get(x.p) ?? null,
    backoffice: bo.get(x.p) ?? null,
    cartas: cartas.has(x.p) ? [...cartas.get(x.p)].sort() : [],
    balanza: pm ? { cat: pm.category, movs: pm.movements, desde: pm.firstSeen, hasta: pm.lastSeen, productos: Object.keys(pm.products ?? {}).slice(0, 3) } : null,
  }
})
writeFileSync(outFile, JSON.stringify(res, null, 1))
const limpio = res.filter((r) => !r.noCamion && !r.backoffice && !r.cartas.length && !(r.manual && r.manual !== 'camion'))
console.log('total', res.length, 'limpios', limpio.length, 'limpios con >=2 huellas', limpio.filter((r) => r.visitasHuella >= 2).length)
for (const r of res.filter((r) => r.visitasHuella >= 2)) {
  const flag = [r.noCamion && `nocam:${r.noCamion}`, r.manual && `manual:${r.manual}`, r.backoffice && `bo:${r.backoffice}`, r.cartas.length && `cartas:${r.cartas.join('/')}`].filter(Boolean).join(' ')
  const bal = r.balanza ? `bal ${r.balanza.cat} ${r.balanza.movs} (${r.balanza.desde}→${r.balanza.hasta})` : 'sin balanza'
  console.log(`${r.patente.padEnd(8)} H=${String(r.visitasHuella).padStart(2)} V=${String(r.visitas).padStart(3)} ${r.primera.slice(5)}→${r.ultima.slice(5)} ${bal.padEnd(45)} ${flag}`)
}
