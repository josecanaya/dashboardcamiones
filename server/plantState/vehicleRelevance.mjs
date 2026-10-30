/** Relevancia logística por visita: no crea una lista negra permanente de patentes. */
export const RELEVANCE_RULE_VERSION = 'sl-shared-gates-nontruck-v3'
export const isRelevanceDevice = device => /^SLZSalidaC[12](Fte|Tras)$/.test(device ?? '') || device === 'SLZTK400'
// v3 (19/10): el DSS también devuelve «MPV» (787 lecturas en Portería SL/Renova) y «Medium Bus» (262), que se escapaban.
const NON_TRUCK = new Set(['car','sedan','suv','pickup','van','bus','minibus','mediumbus','coach','mpv','motorcycle','auto','camioneta','colectivo'])
const normalized = value => String(value ?? '').replace(/[^a-z0-9]/gi,'').toLowerCase()
const processDevice = device => /^(SLZBal|SLZCalado|SLZVolcable|RenCarg|RenDesc|RicB[123]|RicCal|RicVolcable|RicC16|RicS[678])/.test(device ?? '')
/** Solo quita visitas descartadas por esta regla; las capturas crudas quedan disponibles. */
export function excludeIrrelevantEvents(events,items,keyOf) {
  const dropped=new Set(items.filter(i=>i.level==='rechazado' && i.decision?.source==='automatic_relevance').map(i=>i.fragmentKey))
  return dropped.size ? events.filter(e=>!dropped.has(keyOf(e))) : events
}
export function assessVehicleRelevance({site,item,capture,reads=[],historyAvailable=false}) {
  const result = (reject,reason) => ({reject,reason,ruleVersion:RELEVANCE_RULE_VERSION,category:capture?.vehicleCategory ?? null})
  if (site !== 'san_lorenzo' || !isRelevanceDevice(item?.deviceCode)) return result(false,'fuera_de_alcance')
  if (!['pendiente','provisorio'].includes(item.level)) return result(false,'ya_resuelto')
  // Una reapertura, nota de relevo, diferimiento o reserva humana tiene prioridad.
  if (item.decision || item.claim) return result(false,'revision_humana')
  if (!capture || normalized(capture.plate) !== normalized(item.readPlate) || !Number.isFinite(capture.diffMs) || capture.diffMs > 5000) return result(false,'captura_no_verificada')
  if (!NON_TRUCK.has(normalized(capture.vehicleCategory))) return result(false,'tipo_camion_o_desconocido')
  if (!historyAvailable) return result(false,'historia_no_disponible')
  if (reads.some(r => processDevice(r.deviceCode ?? r.device))) return result(false,'recorrido_operativo')
  const plausible = (item.candidates ?? []).some(c => c.similarity >= .65 && !c.seenAfter && c.inUniverse !== false &&
    ((c.recentReads ?? []).some(r=>processDevice(r.device ?? r.deviceCode)) || processDevice(c.photoDevice)))
  if (plausible) return result(false,'candidato_operativo_parecido')
  return result(true,`Vehículo no camión (${capture.vehicleCategory}) en acceso compartido, sin recorrido operativo conocido`)
}

const KIND_LABEL = { tractor_maquinaria: 'tractor o maquinaria', liviano: 'auto o camioneta', servicio: 'servicio', colectivo: 'colectivo' }

/**
 * En la planta de En vivo van solo los camiones de granos (29/10). Los demás vehículos —autos y camionetas,
 * máquinas, y los de Vehículos Permitidos (agua, residuos, leña, insumos…)— se registran aparte, en la
 * lista «Vehículos en planta». Lo decide la carta de porte: con carta vigente (chasis o acoplado) es un
 * camión de granos. La balanza (SGC) no decide: es solo control de error. Lo que no tiene carta ni figura
 * como vehículo queda en la planta como camión sin identificar (es un caso de la corrección).
 * @param {object[]} events eventos ya identificados (patente final en normalizedPlate)
 * @param {object[]} items casos del reconocedor
 * @param {{ noCamiones?: { lookup: Function }|null, padron?: { at: Function, cartaAt?: Function }|null, plateOf: (e: object) => string, timeOf: (e: object) => number }} ctx
 * @returns {{ trucks: object[], others: object[], whyOf: (plate: string) => { kind: string, label: string }|null }}
 */
export function splitNonTrucks(events, items, { noCamiones = null, padron = null, plateOf, timeOf }) {
  const flagged = new Map()
  for (const it of items) {
    if (it.assignedPlate && it.assignedPlate !== it.readPlate) continue
    if (it.rule === 'no_camion') flagged.set(it.readPlate, { kind: 'no_camion', label: 'base de no camiones' })
    else if (it.attributes?.vehicleClass === 'liviano' && it.level === 'fuera_sistema') flagged.set(it.readPlate, { kind: 'liviano', label: 'auto o camioneta (cámara)' })
    else if (['liviano', 'maquinaria', 'colectivo'].includes(it.ia?.vehicleType) && !it.ia?.plate) flagged.set(it.readPlate, { kind: it.ia.vehicleType, label: `${it.ia.vehicleType} (IA)` })
    // Lectura que no es una patente y nadie la asignó: es un camión mal leído que ya está en planta, no uno
    // nuevo (IHRU293 en Volcable C5 SL, 29/10, era HPQ293). Queda en la bandeja de Patentes hasta corregirla.
    else if (!it.validFormat && !it.assignedPlate && ['pendiente', 'provisorio'].includes(it.level)) flagged.set(it.readPlate, { kind: 'ilegible', label: 'lectura ilegible sin asignar (corregir en Patentes)' })
  }
  const why = new Map()
  const whyOf = (plate, t) => {
    if (!plate) return null
    if (!why.has(plate)) {
      let w = null
      if (padron?.cartaAt?.(plate, t)) w = null
      else {
        const nc = noCamiones?.lookup(plate)
        const h = padron?.at(plate, t)
        w = flagged.get(plate)
          ?? (nc ? { kind: nc.kind, label: KIND_LABEL[nc.kind] ?? nc.kind } : null)
          ?? (h?.source === 'permitido' ? { kind: 'permitido', label: `Vehículos Permitidos (${String(h.category ?? '').replace(/_/g, ' ')})` } : null)
      }
      why.set(plate, w)
    }
    return why.get(plate)
  }
  const trucks = []
  const others = []
  for (const e of events) (whyOf(plateOf(e), timeOf(e)) ? others : trucks).push(e)
  return { trucks, others, whyOf: (plate) => why.get(plate) ?? null }
}

/** Solo los camiones de granos (ver splitNonTrucks). */
export function excludeNonTrucks(events, items, ctx) {
  return splitNonTrucks(events, items, ctx).trucks
}
