/**
 * La patente que la IA lee en la foto (`seenPlate`, ver claudeVision.mjs) vuelve a pasar por lo mismo que
 * una lectura de cámara: Vehículos Permitidos y carta de porte (capa 2), la base de no camiones, la balanza
 * como apoyo y los vehículos en planta. Con eso el caso muestra una sugerencia: «la IA lee TSO035 y TSO035
 * tiene carta de porte vigente». Modo sombra: no se aplica.
 */
import { padronLabel } from '../../plantState/padronCartas.mjs'
import { isValidPlate } from '../../plantState/plateIdentification.mjs'

const NO_CAMION_ES = { tractor_maquinaria: 'tractor o maquinaria', liviano: 'auto o camioneta', servicio: 'vehículo de servicio', colectivo: 'colectivo' }

/**
 * @param {{ seenPlate?: string|null, plate?: string|null }} verdict veredicto de la IA
 * @param {{ readPlate: string, at: string }} item el caso
 * @param {{ padron?: { at: Function }|null, balanza?: { truckAt: Function, isKnown: Function }|null, noCamiones?: { lookup: Function }|null, plantPlates?: Set<string> }} ctx
 * @returns {{ plate: string, capa2: object|null, capa2Label: string|null, balanza: 'en_planta'|'conocida'|null, enPlanta: boolean, noCamion: string|null, igualALeida: boolean, igualAElegida: boolean, texto: string }|null}
 */
export function checkSeenPlate(verdict, item, { padron = null, balanza = null, noCamiones = null, plantPlates = new Set() } = {}) {
  const plate = String(verdict?.seenPlate ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!isValidPlate(plate)) return null
  const t = Date.parse(item.at)
  const capa2 = padron?.at(plate, t) ?? null
  const bz = balanza?.truckAt(plate, t) ? 'en_planta' : balanza?.isKnown(plate) ? 'conocida' : null
  const noCam = !capa2 ? noCamiones?.lookup(plate) ?? null : null
  const igualALeida = plate === item.readPlate
  // Si es la misma que leyó la cámara, «está en las cámaras» es esta misma lectura: no prueba nada.
  const enPlanta = plantPlates.has(plate) && !igualALeida
  const igualAElegida = Boolean(verdict.plate) && plate === verdict.plate
  const dondeFigura = [
    capa2 && padronLabel(capa2),
    noCam && `la base de no camiones (${NO_CAMION_ES[noCam.kind] ?? noCam.kind})`,
    bz === 'en_planta' ? 'la balanza (en planta)' : bz === 'conocida' ? 'la balanza (vino antes)' : null,
    enPlanta && 'las cámaras de hoy',
  ].filter(Boolean)
  const texto = `la IA lee ${plate}${igualALeida ? ' (igual que la cámara)' : ''}: ${dondeFigura.length ? `figura en ${dondeFigura.join(', ')}` : 'no figura en ninguna base'}`
  return { plate, capa2, capa2Label: capa2 ? padronLabel(capa2) : null, balanza: bz, enPlanta, noCamion: noCam?.kind ?? null, igualALeida, igualAElegida, texto }
}
