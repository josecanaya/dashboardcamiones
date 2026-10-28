/**
 * La patente que la IA lee en la foto (`seenPlate`, ver claudeVision.mjs) vuelve a pasar por lo mismo que
 * una lectura de cámara: Vehículos Permitidos y carta de porte (capa 2), la base de no camiones, la balanza
 * como apoyo y los vehículos en planta. Con eso el caso muestra una sugerencia: «la IA lee TSO035 y TSO035
 * tiene carta de porte vigente». Si figura en la capa 2, applyVisionVerdict asigna la lectura sola.
 */
import { padronLabel } from '../../plantState/padronCartas.mjs'
import { isValidPlate } from '../../plantState/plateIdentification.mjs'
import { getEventLiveInstantMs } from '../../plantState/liveEventTime.mjs'

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

/**
 * La IA se aplica sola cuando la patente que lee en la foto figura en la carta de porte o en Vehículos
 * Permitidos y la lectura tiene confianza ≥ minConfidence (0,4). Una decisión de operaciones manda; una
 * máquina no se asigna. La lectura se suma al viaje de esa patente más cercano (±12 h); si no hay, queda
 * con la patente. Si la patente es de un acoplado, se asigna al chasis.
 * @param {object} it caso con `ia` (veredicto + patenteVista de checkSeenPlate)
 * @param {object[]} rawEvents eventos del buffer de la planta
 * @returns {object|null} el caso asignado, o null si no corresponde
 */
export function applyVisionVerdict(it, rawEvents, { minConfidence = 0.4 } = {}) {
  if (it.decision || !['provisorio', 'pendiente', 'fuera_sistema'].includes(it.level)) return null
  const v = it.ia
  const pv = v?.patenteVista
  const confidence = v?.seenPlateConfidence ?? v?.confidence ?? 0
  if (!pv?.capa2 || v.vehicleType === 'maquinaria' || confidence < minConfidence) return null
  const plate = pv.capa2.role === 'acoplado' && pv.capa2.chasis ? pv.capa2.chasis : pv.plate
  const t = Date.parse(it.at)
  let journeyUid = null
  let best = Infinity
  for (const e of rawEvents) {
    const p = String(e.normalizedPlate || e.truckPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    const uid = String(e.journeyUid ?? '').trim()
    if (p !== plate || !uid || e.fromAlert) continue
    const d = Math.abs(getEventLiveInstantMs(e) - t)
    if (d < best && d <= 12 * 3600_000) {
      best = d
      journeyUid = uid
    }
  }
  return {
    ...it,
    level: 'casi_seguro',
    rule: 'ia_imagen',
    assignedPlate: plate,
    assignedJourneyUid: journeyUid,
    reason: `la IA lee ${pv.plate} en la foto (${Math.round(confidence * 100)} %) y figura en ${pv.capa2Label}${plate !== pv.plate ? `: es el acoplado de ${plate}` : ''}`,
  }
}
