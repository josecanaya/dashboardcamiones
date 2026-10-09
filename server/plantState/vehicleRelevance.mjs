/** Relevancia logística por visita: no crea una lista negra permanente de patentes. */
export const RELEVANCE_RULE_VERSION = 'sl-shared-gates-nontruck-v2'
export const isRelevanceDevice = device => /^SLZSalidaC[12](Fte|Tras)$/.test(device ?? '') || device === 'SLZTK400'
const NON_TRUCK = new Set(['car','sedan','suv','pickup','van','bus','minibus','coach','motorcycle','auto','camioneta','colectivo'])
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
