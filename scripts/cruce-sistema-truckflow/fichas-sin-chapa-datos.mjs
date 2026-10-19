/**
 * Datos de las fichas de camiones SIN CHAPA DELANTERA (sin nada, papel o chapa suelta en el parabrisas).
 *
 * Por camión: datos vistos en la foto (camiones.json, revisado a ojo), cada visita del Sistema de
 * camiones (ingreso, salida, planta, producto) y su recorrido por cámaras:
 *  - confirmado: pasada elegida a ojo en recorridos/seleccion.json;
 *  - automático: pasada que el algoritmo eligió por lectura exacta o parecida a la patente (o el logo
 *    del camión) — no se revisó a ojo.
 *  - anclas: pasada confirmada a ojo en recorridos/seleccion-anclas.json, de la búsqueda con ventanas
 *    por los horarios del Excel (recorrido-anclas.mjs).
 * Requiere: recorrido-dss.mjs (y recorrido-anclas.mjs) corridos para las visitas.
 *
 * Uso: node --max-old-space-size=8192 scripts/cruce-sistema-truckflow/fichas-sin-chapa-datos.mjs
 * Salida: reportes/cruce-sistema-truckflow/fichas-sin-chapa/datos.json
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { OUT_DIR } from './lecturas.mjs'
import { loadMovimientos } from './sistema.mjs'

const DIR = join(OUT_DIR, 'fichas-sin-chapa')
const REC = join(OUT_DIR, 'recorridos')
const CAMIONES = JSON.parse(readFileSync(join(DIR, 'camiones.json'), 'utf8'))
const SEL = existsSync(join(REC, 'seleccion.json')) ? JSON.parse(readFileSync(join(REC, 'seleccion.json'), 'utf8')) : {}
const SEL_ANCLAS = existsSync(join(REC, 'seleccion-anclas.json')) ? JSON.parse(readFileSync(join(REC, 'seleccion-anclas.json'), 'utf8')) : {}
/** Punto de descarga según la cámara del volcable de su plataforma. */
const descarga = (cam) => (/^SLZ/.test(cam) ? 'Volcables puerto' : /^RicVolcable/.test(cam) ? 'Volcables Ricardone' : /^RicS7/.test(cam) ? 'Silo Keppler' : 'Celda 16')
const hora = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')
const CONF = new Set(['0O', '0D', '8B', '1I', '5S', '2Z', '6G', '4A', 'DB', '80', 'MN', 'HM', 'UV', 'IT', 'CG'].flatMap((p) => [p, p[1] + p[0]]))
function parecido(r, p) {
  if (!r || r.length < 4) return 0
  let prev = Array.from({ length: p.length + 1 }, (_, j) => j * 0.6)
  for (let i = 1; i <= r.length; i++) {
    const cur = [i * 0.6]
    for (let j = 1; j <= p.length; j++) cur[j] = Math.min(prev[j - 1] + (r[i - 1] === p[j - 1] ? 0 : CONF.has(r[i - 1] + p[j - 1]) ? 0.3 : 1), prev[j] + 0.6, cur[j - 1] + 0.6)
    prev = cur
  }
  return Math.max(0, 1 - prev[p.length] / p.length)
}
const movs = loadMovimientos()
const out = []
for (const c of CAMIONES) {
  const visitas = []
  for (const m of movs.filter((x) => x.plate === c.patente)) {
    const tag = hora(m.ing).replace(/[- :]/g, '').slice(0, 12)
    const f = join(REC, c.patente, tag, 'recorrido.json')
    const v = { ingreso: hora(m.ing), salida: Number.isFinite(m.sal) ? hora(m.sal) : '', planta: m.planta, producto: m.producto, mov: m.mov, pasos: [], dss: existsSync(f) }
    if (v.dss) {
      const rec = JSON.parse(readFileSync(f, 'utf8'))
      const sel = SEL[`${c.patente}/${tag}`] ?? {}
      const revisada = Boolean(SEL[`${c.patente}/${tag}`])
      for (const p of rec.puntos) {
        if (!p.candidatas?.length) continue
        const i = sel[p.punto]
        let paso = null
        if (Number.isInteger(i) && p.candidatas[i]) paso = { ...p.candidatas[i], estado: 'confirmado' }
        else if (!revisada) {
          // Sin revisar: solo lo que el algoritmo eligió con lectura de la patente o del logo del camión.
          const e = p.elegida
          const logo = c.logos?.some((l) => (e?.lectura ?? '').includes(l))
          if (e && (e.lectura === c.patente || parecido(e.lectura, c.patente) >= 0.6 || logo)) paso = { ...e, estado: 'automatico' }
        }
        if (paso) v.pasos.push({ punto: p.punto, camara: paso.camara, hora: paso.hora, lectura: paso.lectura, estado: paso.estado, foto: paso.foto ? join(REC, c.patente, tag, paso.foto) : null })
      }
      for (const x of sel.extra ?? []) v.pasos.push({ punto: x.punto, camara: x.camara, hora: x.hora, lectura: x.lectura, estado: 'confirmado', foto: join(REC, c.patente, tag, x.foto) })
      v.pasos.sort((a, b) => a.hora.localeCompare(b.hora))
      v.revisada = revisada
    }
    // Búsqueda por anclas del Excel (recorrido-anclas.mjs), confirmada a ojo: suma los puntos que faltan.
    const selA = SEL_ANCLAS[`${c.patente}/${tag}`] ?? {}
    const fa = join(REC, c.patente, tag, 'anclas', 'anclas.json')
    if (Object.keys(selA).length && existsSync(fa)) {
      v.dss = true
      v.revisada = true
      const an = JSON.parse(readFileSync(fa, 'utf8'))
      for (const [punto0, archivo] of Object.entries(selA)) {
        const cand = an.puntos.flatMap((p) => p.candidatas).find((x) => x.foto === archivo)
        if (!cand) throw new Error(`${c.patente}/${tag}: no está ${archivo}`)
        const punto = punto0 === 'Descarga plataforma' ? descarga(cand.camara) : punto0
        const paso = { punto, camara: cand.camara, hora: cand.hora, lectura: cand.lectura, estado: 'confirmado', foto: join(REC, c.patente, tag, 'anclas', archivo) }
        const k = v.pasos.findIndex((x) => x.punto === punto)
        if (k < 0) v.pasos.push(paso)
        else if (v.pasos[k].estado !== 'confirmado') v.pasos[k] = paso
      }
      v.pasos.sort((a, b) => a.hora.localeCompare(b.hora))
    }
    visitas.push(v)
  }
  visitas.sort((a, b) => a.ingreso.localeCompare(b.ingreso))
  const lecturas = [...new Set(visitas.flatMap((v) => v.pasos.map((p) => p.lectura).filter(Boolean)))]
  out.push({ ...c, visitas, lecturas })
  console.log(`${c.patente}: ${visitas.length} visitas, ${visitas.reduce((s, v) => s + v.pasos.length, 0)} pasadas (${visitas.reduce((s, v) => s + v.pasos.filter((p) => p.estado === 'confirmado').length, 0)} confirmadas)`)
}
writeFileSync(join(DIR, 'datos.json'), JSON.stringify(out, null, 1))
