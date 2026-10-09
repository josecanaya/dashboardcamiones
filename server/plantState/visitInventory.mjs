/** Inventario causal: una visita no es el UID reutilizable del proveedor. */
export const INVENTORY_VERSION = 'visit-node-v1'
const GAP = 8 * 60 * 60_000
const REENTRY = 20 * 60_000
const entry = r => ['S0', 'SL_S0'].includes(r.logical)
const site = r => r.logical.startsWith('SL_') ? 'san_lorenzo' : 'ricardone'
export function cameraPosition(device = '') {
  const scale = /^RicB([123])(Ingreso|Egreso)$/.exec(device)
  if (scale) return { nodeId: `ricardone:Balanza ${scale[2]}`, phase: scale[2].toLowerCase(), lane: `B${scale[1]}` }
  const exit = /^SLZSalidaC([12])(?:Fte|Tras)$/.exec(device)
  if (exit) return { nodeId: 'san_lorenzo:Egreso', phase: 'egreso', lane: `C${exit[1]}` }
  return { nodeId: device, phase: null, lane: null }
}
/** Devuelve únicamente la instancia de visita vigente al producirse la captura. */
export function visitRowsAt(rows, at) {
  const causal = rows.filter(r => r.t <= at).sort((a,b) => a.t-b.t)
  let start = 0
  for (let i=1; i<causal.length; i++) {
    const r=causal[i], previous=causal[i-1]
    const earlier=causal.slice(start,i).filter(x=>site(x)===site(r))
    const reentry=entry(r) && earlier.some(x=>!entry(x) && !['S1','SL_S1'].includes(x.logical)) && r.t-earlier[0]?.t>=REENTRY
    if (r.t-previous.t>GAP || reentry) start=i
  }
  return causal.slice(start)
}
export function assessVisitCandidate(candidate, head, rows) {
  const last=rows.at(-1), target=cameraPosition(head.device), previous=cameraPosition(last?.device)
  const visitId=`${candidate.journeyKey}@${rows[0]?.t ?? 'posterior'}`
  let reason=null
  // En evaluación: se registra pero no saca al candidato del universo. Replay 06–07/10 (114 casos
  // confirmados): no separan correctos de incorrectos (7/4 y 11/9) y frenaban 4 de 6 automáticas
  // correctas; las cámaras pierden lecturas intermedias. Promover solo con evidencia nueva.
  let shadowReason=null
  if (candidate.seenAfter || !last) reason='Referencia posterior a la captura: solo revisión humana'
  else if (candidate.automaticEligible===false) reason='La coincidencia cercana ocurre después de la captura'
  else if (candidate.onTime===false) reason='Fuera de la ventana temporal del tramo'
  else if (previous.phase==='egreso' && /^S[56789]$/.test(head.logical)) reason='Balanza de egreso ya registrada: este paso de proceso no está pendiente'
  else if (target.phase==='egreso' && !rows.some(r=>/^S[56789]$/.test(r.logical)) && previous.phase!=='egreso') reason='Egreso de balanza sin proceso previo conocido: verificar fase'
  else if (target.phase==='ingreso' && rows.some(r=>cameraPosition(r.device).phase==='ingreso') && rows.some(r=>/^S[56789]$/.test(r.logical))) reason='La visita ya pasó ingreso y proceso: se espera egreso de balanza'
  else if (last.logical===head.logical && target.phase && previous.phase && target.phase!==previous.phase) reason='Otra fase de balanza: falta un paso intermedio compatible'
  else if (last.logical===head.logical && target.nodeId==='san_lorenzo:Egreso' && previous.lane && target.lane!==previous.lane) reason='Otro carril de egreso: verificar que sea el mismo vehículo'
  else if (last.logical!==head.logical && (candidate.nextProbability??0)<0.2) shadowReason=candidate.nodeProbability>=0.2 ? 'Recorrido incompleto: faltan pasos previos a este nodo' : 'Paso ya consumido o recorrido incompatible'
  else if (!candidate.sameNode && !(candidate.nextProbability>=0.2)) reason='El vehículo no está esperando este paso'
  return { version:INVENTORY_VERSION, visitId, nodeId:target.nodeId, phase:target.phase, lane:target.lane, fromNode:last?.logical??null,
    visitStartedAt:rows[0] ? new Date(rows[0].t).toISOString() : null,
    status:reason ? 'exception':'expected', reason:reason??'Paso pendiente compatible con la visita y las lecturas anteriores',
    ...(shadowReason ? { shadow: { mode:'evaluacion', reason:shadowReason } } : {}) }
}
