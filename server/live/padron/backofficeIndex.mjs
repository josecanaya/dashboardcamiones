/**
 * Las dos bases del back office (padronDb.mjs) en memoria, para la capa 2 del reconocedor de En vivo:
 * una patente aceptada en particulares o en sin carta es un Vehículo Permitido con su categoría.
 * Se recarga cada `refreshMs` (una autorización nueva se nota a los pocos minutos) y, si Mongo no responde,
 * se queda con lo último que leyó.
 *
 * También sabe qué patentes se rechazaron como camión de granos (data/padron/backoffice-descartados.json):
 * esos tienen que venir con carta de porte, y sin carta vigente son alerta.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { normPlate } from './cartasSource.mjs'

/** Categoría con la que el reconocedor nombra al vehículo («Vehículos Permitidos (agua)»). */
const CATEGORIA_SIN_CARTA = { carga: 'despacho', descarga: 'descarga_sin_carta' }
const CATEGORIA_PARTICULARES = { camion: 'servicio' }

/**
 * Entradas de Vehículos Permitidos a partir de las fichas aceptadas de una base. Un acoplado se lee como el
 * chasis con el que más viajó.
 * @param {'particulares'|'sin_carta'} base
 * @param {object[]} fichas documentos de `vehiculos`
 */
export function entradasBackoffice(base, fichas) {
  const out = new Map()
  for (const v of fichas) {
    const plate = normPlate(v._id ?? v.patente)
    if (!plate) continue
    const acoplado = (v.rol ?? v.balanza?.rol) === 'acoplado'
    const par = v.balanza?.pares?.[0]
    const chasis = acoplado ? normPlate(par?.patente ?? par?.nombre) : null
    const categoria = base === 'sin_carta'
      ? CATEGORIA_SIN_CARTA[v.categoria] ?? 'sin_carta'
      : CATEGORIA_PARTICULARES[v.decision?.categoria] ?? v.decision?.categoria ?? 'particular'
    out.set(plate, {
      plate, role: acoplado && chasis ? 'acoplado' : 'chasis', ...(acoplado && chasis ? { chasis } : {}),
      category: categoria, alsoGrain: false, sources: ['backoffice'],
      backoffice: { base, categoria: v.decision?.categoria ?? v.categoria ?? null },
    })
  }
  return out
}

export function createBackofficeIndex({ padronDb, projectRoot, refreshMs = 120_000, log = console }) {
  let entradas = new Map()
  let granos = new Set()
  let meta = null

  const leerDescartados = () => {
    try {
      const doc = JSON.parse(readFileSync(path.join(projectRoot, 'data', 'padron', 'backoffice-descartados.json'), 'utf8'))
      granos = new Set((doc.entries ?? []).filter((e) => e.motivo === 'camion_granos').map((e) => normPlate(e.patente)))
    } catch {
      granos = new Set()
    }
  }

  async function recargar() {
    leerDescartados()
    if (!padronDb) return
    try {
      const [part, sinCarta] = await Promise.all([
        padronDb.particulares.vehiculos.find({}).toArray(),
        padronDb.sin_carta.vehiculos.find({}).toArray(),
      ])
      // Particulares después: si una patente está en las dos, la nombra como particular/servicio.
      entradas = new Map([...entradasBackoffice('sin_carta', sinCarta), ...entradasBackoffice('particulares', part)])
      meta = { cargadoAt: new Date().toISOString(), particulares: part.length, sinCarta: sinCarta.length, granos: granos.size }
    } catch (e) {
      log.warn?.(`[backoffice] no se pudo leer Mongo, sigo con lo anterior: ${e instanceof Error ? e.message : e}`)
    }
  }

  return {
    async start() {
      await recargar()
      log.info?.(`[backoffice] ${meta?.particulares ?? 0} particulares + ${meta?.sinCarta ?? 0} sin carta, ${granos.size} camiones de granos rechazados`)
      setInterval(() => void recargar(), refreshMs).unref?.()
    },
    recargar,
    /** Entrada de Vehículos Permitidos de la patente aceptada, o null. */
    lookup: (plate) => entradas.get(normPlate(plate)) ?? null,
    /** ¿Se rechazó como camión de granos? (tiene que venir con carta). */
    esCamionDeGranos: (plate) => granos.has(normPlate(plate)),
    status: () => meta,
  }
}
