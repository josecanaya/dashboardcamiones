/**
 * Las dos bases NoSQL del back office (MongoDB), independientes entre sí:
 *
 * - backoffice_particulares: particulares y vehículos de servicio que vienen siempre (agua, residuos,
 *   combustible, movimientos internos, contratistas). Página de Portería.
 * - backoffice_sin_carta: camiones que vienen a cargar (o descargar) productos sin carta de porte. Página
 *   Despachos y descargas.
 *
 * Cada una tiene:
 * - vehiculos: SOLO los aceptados (una ficha por patente, con la decisión y su categoría);
 * - candidatos: los que el historial propone y todavía no se decidieron (o quedaron a revisar);
 * - movimientos (balanza) y capturas (cámaras) de esas patentes;
 * - autorizaciones: lo que cargan portería y comercial.
 * Los rechazados no van a ninguna base: quedan en data/padron/backoffice-descartados.json para que el
 * historial no los vuelva a proponer. Un camión de granos se resuelve con la carta de porte; sin carta, es alerta.
 *
 * Por ahora es el MongoDB local (servicio de Windows, 127.0.0.1:27017). Cuando se defina dónde va
 * (al lado de las cartas de porte o en la máquina del microservicio) alcanza con cambiar PADRON_MONGO_URL.
 */
import { MongoClient } from 'mongodb'

export const PADRON_MONGO_URL = process.env.PADRON_MONGO_URL || 'mongodb://127.0.0.1:27017'
export const BASES = {
  particulares: process.env.PARTICULARES_DB || 'backoffice_particulares',
  sin_carta: process.env.SIN_CARTA_DB || 'backoffice_sin_carta',
}

/** Conecta a una base del back office y deja los índices. Sin Mongo en `timeoutMs`, rechaza. */
export async function connectBackofficeDb(base, { url = PADRON_MONGO_URL, timeoutMs = 3000 } = {}) {
  const nombre = BASES[base] ?? base
  const client = await MongoClient.connect(url, { serverSelectionTimeoutMS: timeoutMs })
  const db = client.db(nombre)
  const col = {
    vehiculos: db.collection('vehiculos'),
    candidatos: db.collection('candidatos'),
    movimientos: db.collection('movimientos'),
    capturas: db.collection('capturas'),
    autorizaciones: db.collection('autorizaciones'),
  }
  await Promise.all([
    col.vehiculos.createIndex({ 'decision.categoria': 1 }),
    col.candidatos.createIndex({ categoria: 1 }),
    col.movimientos.createIndex({ patente: 1, at: -1 }),
    col.movimientos.createIndex({ acoplado: 1 }),
    col.capturas.createIndex({ patente: 1, at: -1 }),
    col.capturas.createIndex({ at: -1 }),
    col.autorizaciones.createIndex({ patente: 1 }),
    col.autorizaciones.createIndex({ acoplado: 1 }),
  ])
  return { client, db, nombre, ...col, close: () => client.close() }
}

/**
 * Store de autorizaciones sobre las dos bases, con la misma forma que fileStore (autorizaciones.mjs):
 * load() trae todo y upsert(doc) guarda una sola. Portería va a particulares; comercial, a sin carta.
 */
export function mongoAutorizacionesStore({ particulares, sin_carta }) {
  const strip = ({ _id, ...a }) => a
  const baseDe = (a) => (a.perfil === 'porteria' ? particulares : sin_carta)
  return {
    load: async () => (await Promise.all([sin_carta, particulares].map((b) => b.autorizaciones.find({}).toArray()))).flat().map(strip),
    upsert: (a) => baseDe(a).autorizaciones.replaceOne({ _id: a.id }, { _id: a.id, ...a }, { upsert: true }),
  }
}

/** Ficha de la patente: primero los aceptados de las dos bases, después los candidatos. */
export async function fichaBackoffice({ particulares, sin_carta }, patente) {
  for (const col of [sin_carta.vehiculos, particulares.vehiculos, sin_carta.candidatos, particulares.candidatos]) {
    const f = await col.findOne({ _id: patente })
    if (f) return f
  }
  return null
}
