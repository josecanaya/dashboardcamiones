/**
 * Autorizaciones cargadas a mano: la base única que alimentan las páginas de /autorizaciones.
 *
 * - Portería: particulares y (por ahora) contratistas; ¿ingreso a zona operativa? sí o no.
 * - Comercial: camiones que vienen a despachar (el cliente avisa por mail) o a descargar sin CTG/CTDG.
 *
 * Una autorización vigente (activa y con hoy dentro de desde–hasta) es un Vehículo Permitido para el
 * reconocedor de En vivo: vehiculosPermitidos.mjs la consulta antes que la lista armada con la balanza.
 *
 * Por ahora vive en data/padron/autorizaciones.json. Cuando se defina dónde va la base (al lado de las
 * cartas de porte o en la máquina del microservicio), se reemplaza `fileStore` sin tocar lo demás.
 * Nunca se escribe en Supabase.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { normPlate } from './cartasSource.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const PAGES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'autorizaciones')

/** Qué puede cargar cada perfil. `tipo` es la categoría que ve el reconocedor. */
export const PERFILES = {
  porteria: { tipos: ['particular', 'contratista'], accesos: ['ingreso', 'zona_operativa'] },
  comercial: { tipos: ['carga', 'descarga'], accesos: [] },
}
const PLANTAS = ['ricardone', 'san_lorenzo', 'ambas']
const CATEGORIA = {
  particular: 'particular', contratista: 'contratista', carga: 'despacho', descarga: 'descarga_sin_carta',
}
const TEXTOS = ['titular', 'empresa', 'cliente', 'transportista', 'producto', 'referencia', 'motivo', 'observaciones', 'hdesde', 'hhasta']

/** Fecha de hoy en Argentina, YYYY-MM-DD. */
export const hoyAr = (now = new Date()) => now.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })

export const vigente = (a, dia = hoyAr()) => a.estado === 'activa' && a.desde <= dia && dia <= a.hasta

/** Valida y normaliza lo que manda una página. Devuelve { error } o { ok: campos }. */
export function validar(body, previo = null) {
  const b = { ...(previo ?? {}), ...(body ?? {}) }
  const perfil = String(b.perfil ?? '')
  const p = PERFILES[perfil]
  if (!p) return { error: 'perfil inválido' }
  const patente = normPlate(b.patente)
  if (!patente || patente.length < 5) return { error: 'patente inválida' }
  const tipo = String(b.tipo ?? p.tipos[0])
  if (!p.tipos.includes(tipo)) return { error: `tipo inválido para ${perfil}` }
  const acceso = p.accesos.length ? String(b.acceso ?? '') : null
  if (p.accesos.length && !p.accesos.includes(acceso)) return { error: 'acceso inválido' }
  const planta = String(b.planta ?? 'ambas')
  if (!PLANTAS.includes(planta)) return { error: 'planta inválida' }
  const desde = String(b.desde ?? hoyAr())
  const hasta = String(b.hasta ?? desde)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta < desde) return { error: 'fechas inválidas' }
  const ok = { perfil, tipo, acceso, patente, acoplado: normPlate(b.acoplado) || null, planta, desde, hasta }
  for (const k of TEXTOS) ok[k] = String(b[k] ?? '').trim().slice(0, 300) || null
  return { ok }
}

/** Guardado en un JSON local, escritura atómica. */
export function fileStore(file) {
  return {
    load: () => {
      try { return JSON.parse(readFileSync(file, 'utf8')).autorizaciones ?? [] } catch { return [] }
    },
    save: (list) => {
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(`${file}.tmp`, JSON.stringify({ updatedAt: new Date().toISOString(), autorizaciones: list }, null, 1))
      renameSync(`${file}.tmp`, file)
    },
  }
}

export function createAutorizaciones({ projectRoot = ROOT, store = fileStore(path.join(projectRoot, 'data', 'padron', 'autorizaciones.json')) } = {}) {
  let list = store.load()
  const byId = (id) => list.find((a) => a.id === id) ?? null
  const persist = () => store.save(list)

  return {
    list: ({ perfil, soloVigentes = false, dia = hoyAr() } = {}) =>
      list.filter((a) => (!perfil || a.perfil === perfil) && (!soloVigentes || vigente(a, dia))),
    get: byId,
    crear(body, usuario) {
      const v = validar(body)
      if (v.error) return v
      const at = new Date().toISOString()
      const a = { id: randomUUID(), ...v.ok, estado: 'activa', creadoPor: usuario || null, creadoAt: at, historial: [{ at, por: usuario || null, accion: 'alta' }] }
      list.push(a)
      persist()
      return { ok: a }
    },
    editar(id, body, usuario) {
      const a = byId(id)
      if (!a) return { error: 'no existe', status: 404 }
      const v = validar({ ...body, perfil: a.perfil }, a)
      if (v.error) return v
      const cambios = Object.keys(v.ok).filter((k) => v.ok[k] !== a[k])
      Object.assign(a, v.ok)
      a.historial.push({ at: new Date().toISOString(), por: usuario || null, accion: 'edicion', cambios })
      persist()
      return { ok: a }
    },
    anular(id, usuario, motivo) {
      const a = byId(id)
      if (!a) return { error: 'no existe', status: 404 }
      a.estado = 'anulada'
      a.historial.push({ at: new Date().toISOString(), por: usuario || null, accion: 'anulada', motivo: motivo || null })
      persist()
      return { ok: a }
    },
    /**
     * Autorización vigente de la patente (como chasis o acoplado), con la forma de una entrada de
     * Vehículos Permitidos para el reconocedor.
     */
    lookup(plate, dia = hoyAr()) {
      const p = normPlate(plate)
      if (!p) return null
      const a = list.find((x) => vigente(x, dia) && (x.patente === p || x.acoplado === p))
      if (!a) return null
      const acoplado = a.acoplado === p && a.patente !== p
      return {
        plate: p, role: acoplado ? 'acoplado' : 'chasis', ...(acoplado ? { chasis: a.patente } : {}),
        category: CATEGORIA[a.tipo], alsoGrain: false, sources: ['autorizacion'],
        autorizacion: { id: a.id, perfil: a.perfil, tipo: a.tipo, acceso: a.acceso, planta: a.planta, desde: a.desde, hasta: a.hasta },
      }
    },
  }
}

/**
 * API y páginas. `historico(plate)` da lo que se sabe de la patente por la balanza (Vehículos Permitidos)
 * para ayudar a quien carga.
 */
export function createAutorizacionesRouter({ autorizaciones, historico = () => null }) {
  const r = express.Router()
  const usuario = (req) => String(req.get('x-usuario') ?? req.body?.usuario ?? '').trim().slice(0, 80)
  const send = (res, out, status = 200) => (out.error ? res.status(out.status ?? 400).json({ error: out.error }) : res.status(status).json(out.ok))

  r.get('/api/autorizaciones', (req, res) => {
    const perfil = req.query.perfil ? String(req.query.perfil) : undefined
    res.json({ hoy: hoyAr(), autorizaciones: autorizaciones.list({ perfil, soloVigentes: req.query.vigentes === '1' }) })
  })
  r.get('/api/autorizaciones/consulta', (req, res) => {
    const p = normPlate(req.query.patente)
    const todas = autorizaciones.list().filter((a) => a.patente === p || a.acoplado === p)
    res.json({ patente: p, vigente: autorizaciones.lookup(p), autorizaciones: todas, historico: historico(p) })
  })
  r.post('/api/autorizaciones', (req, res) => send(res, autorizaciones.crear(req.body, usuario(req)), 201))
  r.patch('/api/autorizaciones/:id', (req, res) => send(res, autorizaciones.editar(req.params.id, req.body, usuario(req))))
  r.post('/api/autorizaciones/:id/anular', (req, res) => send(res, autorizaciones.anular(req.params.id, usuario(req), req.body?.motivo)))

  const page = (f) => (_req, res) => res.sendFile(path.join(PAGES, f))
  r.get('/autorizaciones', page('index.html'))
  r.get('/autorizaciones/porteria', page('porteria.html'))
  r.get('/autorizaciones/comercial', page('comercial.html'))
  r.get('/autorizaciones/sin-carta', (_req, res) => res.redirect('/autorizaciones/comercial'))
  r.use('/autorizaciones/comun', express.static(path.join(PAGES, 'comun')))
  return r
}
