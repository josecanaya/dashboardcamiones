/**
 * Arma las dos bases del back office (server/live/padron/padronDb.mjs) con el historial:
 *
 * SIN CARTA (backoffice_sin_carta): balanza de Ricardone y Terminal de Embarque, productos de la lista sin carta
 * (server/live/padron/autorizaciones/comun/productos.json) y sin CTG (vacío o ceros; «30…» es carta de
 * terceros, «SGC_TR» transile). Una ficha por chasis y por acoplado.
 *
 * PARTICULARES (backoffice_particulares): los que vienen siempre sin ser de granos ni de esos productos:
 * - balanza: agua, residuos, combustibles y productos varios (9999 que no es de granos), al menos 2 viajes;
 * - cámaras: patentes argentinas que nunca pasaron por la balanza (en ninguna planta) ni figuran en una
 *   carta de porte, vistas al menos MIN_DIAS días distintos;
 * - lo ya cargado a mano: registro de particulares (data/truck-registry) y clasificación por foto.
 * Las alertas del DSS dan la clase (liviano/camión), marca y color de cada lectura.
 *
 * Capturas: data/truckflow/<día>/event-list.json + alert-list.json, hora operativa (occurredAt + 206 min);
 * una lectura que está como evento y como alerta (misma cámara y patente a ±10 s) cuenta una vez.
 *
 * En cada base, `vehiculos` son solo los aceptados (se les actualiza la ficha y se conserva la decisión;
 * un aceptado que ya no aparece en el historial se queda). El resto va a `candidatos`, salvo los rechazados
 * de data/padron/backoffice-descartados.json, que no vuelven a entrar. Movimientos y capturas, solo de
 * aceptados y candidatos. Autorizaciones no se toca.
 *
 * Entran solos (regla del 04/11): a particulares todo liviano; a sin carta todo camión con 2 viajes o más.
 *
 *   npm run padron:armar
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectBackofficeDb } from '../../server/live/padron/padronDb.mjs'
import { normPlate } from '../../server/live/padron/cartasSource.mjs'
import { PATENTE_AR } from '../../server/live/padron/autorizaciones.mjs'
import { categoryOf, isGrainProduct } from '../../server/live/padron/vehiculosPermitidos.mjs'
import { alertToReadEvent } from '../../server/plantState/alertReads.mjs'
import { getEventLiveInstantMs } from '../../server/plantState/liveEventTime.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MIN_DIAS = Number(process.env.HABITUALES_MIN_DIAS || 3)
const SERVICIO = new Set(['agua', 'residuos', 'combustible', 'varios'])
const PLANTA = { RICARDONE: 'ricardone', TERMINAL_EMBARQUE: 'san_lorenzo' }
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))
const tryJson = (f) => { try { return readJson(f) } catch { return null } }
const dias = (dir) => (existsSync(dir) ? readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [])
const fechaAr = (s) => (s ? new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}-03:00`) : null)
const sinCarta = (ctg) => /^0*$/.test(String(ctg ?? '').trim())
const diaAr = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
const suma = (o, k, n = 1) => { if (k) o[k] = (o[k] ?? 0) + n }
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([nombre, veces]) => ({ nombre, veces }))

const catalogo = new Map(readJson(path.join(ROOT, 'server/live/padron/autorizaciones/comun/productos.json')).productos.map((p) => [p.cod, p]))

// ── Balanza: todo lo que pasó (para saber quién está en el sistema) y lo que va a cada base.
const enBalanza = new Set()
const movCargas = new Map()
const movServicio = new Map()
const yaVisto = new Set()
for (const d of dias(path.join(ROOT, 'data', 'movimientos'))) {
  const f = path.join(ROOT, 'data', 'movimientos', d, 'movimientos.json')
  if (!existsSync(f)) continue
  for (const r of readJson(f)) {
    const patente = normPlate(r.plate_normalized ?? r.patente_original)
    const acoplado = normPlate(r.patente_acoplado)
    enBalanza.add(patente)
    if (acoplado) enBalanza.add(acoplado)
    const planta = PLANTA[r.planta_normalized]
    const cod = String(r.cod_prod ?? '').padStart(4, '0')
    if (!planta || r.baja === true || !PATENTE_AR.test(patente)) continue
    const obs = `${r.observaciones ?? ''} ${r.cliente_contrato ?? ''}`
    const producto = catalogo.get(cod)
    const categoria = producto ? null : categoryOf(cod)
    const destino = producto && sinCarta(r.ctg) ? movCargas : !producto && !isGrainProduct(cod, obs) && SERVICIO.has(categoria) ? movServicio : null
    if (!destino) continue
    const id = r.ingreso_id ? `sgc:${r.ingreso_id}` : r.external_operation_id
    const ingresoAt = fechaAr(r.external_ingreso_at)
    const salidaAt = fechaAr(r.external_salida_at)
    const at = ingresoAt ?? salidaAt
    if (!at) continue
    // El mismo viaje puede venir del Excel y del SGC (y el backup tiene filas repetidas).
    const clave = `${patente}|${cod}|${at.toISOString().slice(0, 15)}`
    if (destino.has(id) || yaVisto.has(clave)) continue
    yaVisto.add(clave)
    destino.set(id, {
      _id: id, patente, acoplado: PATENTE_AR.test(acoplado) ? acoplado : null,
      cod, producto: producto?.nombre ?? String(r.producto_original ?? '').trim(), grupo: producto?.grupo ?? categoria,
      operacion: /^(EGRESO|DESPACHO|DEA)$/.test(r.movement_type) ? 'despacho' : 'descarga',
      planta, at, ingresoAt, salidaAt,
      kgsNeto: Number(r.kgs_neto_neto ?? r.kgs_neto) || null,
      empresa: String(r.entregado_por_a ?? r.cliente_contrato ?? '').trim() || null,
      motivo: String(r.observaciones ?? '').split(',')[0].trim() || null,
      fuente: String(r.source_file ?? '').startsWith('SGC') ? 'sgc' : 'excel',
    })
  }
}

/** Ficha por patente a partir de los movimientos (chasis y acoplado). */
function fichasBalanza(movs) {
  const out = new Map()
  for (const m of movs.values()) {
    for (const [patente, rol, par] of [[m.patente, 'chasis', m.acoplado], [m.acoplado, 'acoplado', m.patente]]) {
      if (!patente) continue
      let v = out.get(patente)
      if (!v) out.set(patente, (v = { patente, comoChasis: 0, comoAcoplado: 0, productos: {}, grupos: {}, empresas: {}, motivos: {}, pares: {}, plantas: {}, descargas: 0, despachos: 0, primero: null, ultimo: null }))
      v[rol === 'chasis' ? 'comoChasis' : 'comoAcoplado']++
      v[m.operacion === 'despacho' ? 'despachos' : 'descargas']++
      const pr = (v.productos[m.cod] ??= { cod: m.cod, nombre: m.producto, grupo: m.grupo, descargas: 0, despachos: 0 })
      pr[m.operacion === 'despacho' ? 'despachos' : 'descargas']++
      suma(v.grupos, m.grupo)
      suma(v.empresas, m.empresa)
      suma(v.motivos, m.motivo)
      suma(v.pares, par)
      suma(v.plantas, m.planta)
      if (!v.primero || m.at < v.primero) v.primero = m.at
      if (!v.ultimo || m.at > v.ultimo) v.ultimo = m.at
    }
  }
  return out
}
const balCargas = fichasBalanza(movCargas)
const balServicio = fichasBalanza(movServicio)

// ── Cartas de porte: patentes que vinieron con carta (no son habituales sin carta).
const conCarta = new Set()
const notasDe = (j) => (Array.isArray(j) ? j : j?.notes ?? j?.cartas ?? [])
for (const f of [
  ...['semanas', 'api'].flatMap((s) => { const dir = path.join(ROOT, 'data', 'arca', s); return existsSync(dir) ? readdirSync(dir).map((x) => path.join(dir, x)) : [] }),
  ...readdirSync(path.join(ROOT, 'data', 'padron')).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).map((x) => path.join(ROOT, 'data', 'padron', x)),
]) for (const n of notasDe(tryJson(f))) for (const p of n.plates ?? []) conCarta.add(normPlate(p))

// ── Lo cargado a mano.
const registro = new Map((tryJson(path.join(ROOT, 'data', 'truck-registry', 'registry.json'))?.entries ?? []).filter((e) => e.active !== false).map((e) => [normPlate(e.plate), e]))
const clasificacion = new Map((tryJson(path.join(ROOT, 'data', 'padron', 'clasificacion-manual.json'))?.entries ?? []).map((e) => [normPlate(e.plate), e]))
const noCamion = new Map((tryJson(path.join(ROOT, 'data', 'padron', 'no-camiones.json'))?.entries ?? []).map((e) => [normPlate(e.plate), e]))

// ── Cámaras: una pasada para las estadísticas por patente, otra para guardar las capturas de las elegidas.
function recorrerCapturas(fn) {
  for (const d of dias(path.join(ROOT, 'data', 'truckflow'))) {
    const buckets = new Set()
    for (const [archivo, fuente] of [['event-list.json', 'evento'], ['alert-list.json', 'alerta']]) {
      const doc = tryJson(path.join(ROOT, 'data', 'truckflow', d, archivo))
      for (const r of Array.isArray(doc) ? doc : doc?.records ?? []) {
        // Las alertas de lectura se pasan a la forma del feed (hora de la cámara a la misma escala).
        const e = fuente === 'alerta' ? alertToReadEvent(r) : r
        if (!e) continue
        const patente = normPlate(e.truckPlate)
        if (!PATENTE_AR.test(patente) || !e.deviceCode) continue
        const ms = getEventLiveInstantMs(e)
        if (!Number.isFinite(ms)) continue
        const b = Math.round(ms / 10_000)
        const k = `${e.deviceCode}|${patente}|`
        const repetida = fuente === 'alerta' && [b - 1, b, b + 1].some((x) => buckets.has(k + x))
        if (!repetida) buckets.add(k + b)
        fn({ e, patente, ms, fuente, repetida })
      }
    }
  }
}
const cam = new Map()
recorrerCapturas(({ e, patente, ms, fuente, repetida }) => {
  let c = cam.get(patente)
  if (!c) cam.set(patente, (c = { capturas: 0, traseras: 0, dias: new Set(), primera: ms, ultima: ms, camaras: {}, clase: {}, marca: {}, color: {} }))
  // La alerta repetida no suma otra lectura, pero trae los atributos del DSS.
  if (fuente === 'alerta') {
    const at = e.attributes
    suma(c.clase, at?.vehicleClass)
    suma(c.marca, at?.brand)
    suma(c.color, at?.color)
  }
  if (repetida) return
  c.capturas++
  if (/Tras/.test(e.deviceCode)) c.traseras++
  c.dias.add(diaAr(ms))
  if (ms < c.primera) c.primera = ms
  if (ms > c.ultima) c.ultima = ms
  suma(c.camaras, e.deviceCode)
})
const resumenCamaras = (patente) => {
  const c = cam.get(patente)
  if (!c) return { capturas: 0, dias: 0 }
  const ric = Object.entries(c.camaras).filter(([k]) => !/^SLZ/.test(k)).reduce((s, [, n]) => s + n, 0)
  return {
    capturas: c.capturas, dias: c.dias.size, primera: new Date(c.primera), ultima: new Date(c.ultima),
    plantas: { ricardone: ric, san_lorenzo: c.capturas - ric },
    porCamara: top(c.camaras, 8), clase: c.clase, marca: top(c.marca, 3), color: top(c.color, 2),
  }
}
const claseDe = (c) => { const l = c.clase?.liviano ?? 0, k = c.clase?.camion ?? 0; return l + k ? (l >= k ? 'liviano' : 'camion') : null }

// ── Fichas finales.
const ahora = new Date()
const fichaBalanza = (b) => b && {
  viajes: b.descargas + b.despachos, descargas: b.descargas, despachos: b.despachos,
  rol: b.comoAcoplado && !b.comoChasis ? 'acoplado' : 'chasis',
  productos: Object.values(b.productos).sort((x, y) => y.descargas + y.despachos - x.descargas - x.despachos),
  empresas: top(b.empresas, 5), motivos: top(b.motivos, 3), pares: top(b.pares, 3), plantas: b.plantas, primero: b.primero, ultimo: b.ultimo,
}

const vehCargas = [...balCargas.values()].map((b) => {
  const f = fichaBalanza(b)
  return {
    _id: b.patente, patente: b.patente, rol: f.rol,
    categoria: f.despachos >= f.descargas ? 'carga' : 'descarga',
    repetido: Math.max(f.despachos, f.descargas) >= 2,
    balanza: f, camaras: resumenCamaras(b.patente), decision: null, armadoAt: ahora,
  }
})

const habituales = new Map()
for (const b of balServicio.values()) {
  const f = fichaBalanza(b)
  if (f.viajes < 2 || balCargas.has(b.patente)) continue
  habituales.set(b.patente, { _id: b.patente, patente: b.patente, origen: ['balanza'], categoria: top(b.grupos, 1)[0].nombre, balanza: f })
}
// Patente leída mal: a una letra de una que está en la balanza o en una carta (misma longitud) y vista
// por las cámaras la mayoría de los mismos días (la mala lectura aparece cuando el camión real está).
const comodines = new Map()
const variantes = (p) => [...p].map((_, i) => `${p.slice(0, i)}*${p.slice(i + 1)}`)
for (const p of new Set([...enBalanza, ...conCarta])) for (const v of variantes(p)) (comodines.get(v) ?? comodines.set(v, []).get(v)).push(p)
const esMalaLectura = (patente, c) => variantes(patente).some((v) => (comodines.get(v) ?? []).some((real) => {
  const dr = cam.get(real)?.dias
  if (!dr) return false
  let juntos = 0
  for (const d of c.dias) if (dr.has(d)) juntos++
  return juntos * 2 >= c.dias.size
}))
const descartadas = { acoplado: 0, parecida: 0 }
for (const [patente, c] of cam) {
  if (habituales.has(patente) || enBalanza.has(patente) || conCarta.has(patente)) continue
  const manual = registro.has(patente) || clasificacion.has(patente)
  if (c.dias.size < MIN_DIAS && !manual) continue
  if (!manual && c.traseras * 2 > c.capturas) { descartadas.acoplado++; continue }
  if (!manual && esMalaLectura(patente, c)) { descartadas.parecida++; continue }
  const clase = claseDe(c)
  habituales.set(patente, { _id: patente, patente, origen: ['camaras'], categoria: clase === 'camion' ? 'camion_sin_registro' : clase === 'liviano' ? 'liviano' : 'sin_clase', balanza: null })
}
for (const v of habituales.values()) {
  v.camaras = resumenCamaras(v.patente)
  const r = registro.get(v.patente)
  const c = clasificacion.get(v.patente)
  const n = noCamion.get(v.patente)
  if (r) { v.registro = { categoria: r.category, etiqueta: r.label ?? null }; v.origen.push('registro') }
  if (c) { v.clasificacionFoto = c.tipo; v.origen.push('clasificacion') }
  if (n) v.noCamion = n.kind
  if (v.categoria !== 'liviano' && (c?.tipo === 'auto' || c?.tipo === 'moto' || r?.category === 'vehiculo_particular')) v.categoria = 'liviano'
  if (n?.kind && v.categoria !== 'liviano') v.categoria = n.kind
  v.decision = null
  v.armadoAt = ahora
}

// ── Guardar.
const descartados = new Set((tryJson(path.join(ROOT, 'data', 'padron', 'backoffice-descartados.json'))?.entries ?? []).map((e) => `${e.base}|${e.patente}`))
const REGLA = {
  particulares: (f) => (f.categoria === 'liviano' ? { categoria: 'particular', nota: 'Liviano: entra a particulares por regla' } : null),
  sin_carta: (f) => ((f.balanza?.viajes ?? 0) >= 2 ? { categoria: null, nota: `Sin carta con ${f.balanza.viajes} viajes: entra por regla` } : null),
}
const guardar = async (base, fichas, movs) => {
  const db = await connectBackofficeDb(base)
  try {
    const aceptados = new Map((await db.vehiculos.find({}).toArray()).map((v) => [v._id, v]))
    const aRevisar = new Map((await db.candidatos.find({ decision: { $ne: null } }, { projection: { decision: 1 } }).toArray()).map((v) => [v._id, v.decision]))
    const vehiculos = [], candidatos = []
    for (const f of fichas) {
      const regla = REGLA[base](f)
      if (aceptados.has(f._id)) vehiculos.push({ ...f, decision: aceptados.get(f._id).decision })
      else if (descartados.has(`${base}|${f._id}`)) continue
      else if (regla && !aRevisar.has(f._id)) vehiculos.push({ ...f, decision: { estado: 'si', ...regla, por: null, at: ahora, fuente: 'regla' } })
      else candidatos.push({ ...f, decision: aRevisar.get(f._id) ?? null })
    }
    // Un aceptado que el historial ya no propone (dejó de venir) sigue en la base.
    const nuevos = new Set(vehiculos.map((v) => v._id))
    for (const [id, v] of aceptados) if (!nuevos.has(id)) vehiculos.push(v)
    const patentes = new Set([...vehiculos, ...candidatos].map((v) => v._id))
    const capturas = []
    recorrerCapturas(({ e, patente, ms, fuente, repetida }) => {
      if (!repetida && patentes.has(patente)) capturas.push({ _id: `${fuente}:${String(e.id).replace(/^alert-/, '')}`, patente, camara: e.deviceCode, planta: /^SLZ/.test(e.deviceCode) ? 'san_lorenzo' : 'ricardone', at: new Date(ms), fuente })
    })
    const mov = [...movs.values()].filter((m) => patentes.has(m.patente) || patentes.has(m.acoplado))
    for (const [col, docs] of [[db.vehiculos, vehiculos], [db.candidatos, candidatos], [db.movimientos, mov], [db.capturas, capturas]]) {
      await col.deleteMany({})
      for (let i = 0; i < docs.length; i += 5000) await col.insertMany(docs.slice(i, i + 5000), { ordered: false })
    }
    return { base: db.nombre, aceptados: vehiculos.length, candidatos: candidatos.length, movimientos: mov.length, capturas: capturas.length }
  } finally {
    await db.close()
  }
}

console.log(await guardar('sin_carta', vehCargas, movCargas))
console.log(await guardar('particulares', [...habituales.values()], movServicio))
const cuenta = (l, k) => l.reduce((m, v) => ({ ...m, [v[k]]: (m[v[k]] ?? 0) + 1 }), {})
console.log('sin carta por categoría', cuenta(vehCargas.filter((v) => v.repetido), 'categoria'), 'repetidos de', vehCargas.length)
console.log('particulares por categoría', cuenta([...habituales.values()], 'categoria'))
console.log('descartadas de cámaras', descartadas)
