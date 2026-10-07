import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CameraCaptureLookup, IdentificationCandidate, CandidateEvidence, IdentificationEvidence } from '../../services/live/plantStateApi'
import { cameraCaptureImageUrl, DecisionError, findCameraCapture, newOpId } from '../../services/live/plantStateApi'
import type { ReviewDecision, DecideFn, SiblingRead } from './ReviewCandidates'
import './plateVerification.css'

const TZ = 'America/Argentina/Buenos_Aires'
function date(at: string) { return new Date(at).toLocaleString('es-AR', { timeZone: TZ, day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false }) }
function hhmm(at: string) { return new Date(at).toLocaleTimeString('es-AR', { timeZone: TZ, hour:'2-digit', minute:'2-digit', hour12:false }) }
function span(ms: number) { const m = Math.round(Math.abs(ms) / 60000); return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d` }
const pct = (value?: number) => value == null ? 'No disponible' : `${Math.round(value * 100)}%`
const ATTR: Record<string, string> = { color: 'Color', marca: 'Marca', tipo: 'Tipo' }
// Traducción mínima de valores del DSS que llegan en inglés (EV-15).
const ES: Record<string, string> = { white: 'blanco', black: 'negro', red: 'rojo', blue: 'azul', green: 'verde', gray: 'gris', grey: 'gris', silver: 'plateado', yellow: 'amarillo', orange: 'naranja', brown: 'marrón', truck: 'camión', van: 'furgón', car: 'auto', bus: 'colectivo', pickup: 'camioneta', unknown: 'desconocido' }
const es = (v?: string | null) => v ? (ES[v.toLowerCase()] ?? v) : v
export type PhotoState = 'loading' | 'ready' | 'missing' | 'error'

/** Foto con zoom dentro del diálogo (EV-11): clic amplía en el punto, otro clic restablece. */
function ZoomImage({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)
  const [broken, setBroken] = useState(false)
  if (broken) return <p>La imagen no se pudo descargar.</p>
  return <button type="button" className={`pv-zoom${zoom ? ' is-zoomed' : ''}`} aria-label={zoom ? 'Restablecer escala' : 'Ampliar imagen'} onClick={e => {
    if (zoom) return setZoom(null)
    const r = e.currentTarget.getBoundingClientRect()
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
  }}><img src={src} alt={alt} style={zoom ? { transform: 'scale(2.5)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined} onError={() => setBroken(true)} /></button>
}

function VerificationPhoto({ label, device, at, plate, relation, onState }: { label: string; device?: string; at?: string; plate: string; relation?: string; onState: (s: PhotoState) => void }) {
  const [lookup, setLookup] = useState<CameraCaptureLookup | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const report = useRef(onState); report.current = onState
  useEffect(() => {
    let alive = true
    setLookup(null); setError('')
    if (!device || !at) { report.current('missing'); return }
    report.current('loading')
    findCameraCapture(device, at, plate)
      .then(result => { if (!alive) return; setLookup(result); report.current(result.capture?.sceneFile ? 'ready' : result.error ? 'error' : 'missing') })
      .catch(e => { if (!alive) return; setError(e instanceof Error ? e.message : String(e)); report.current('error') })
    return () => { alive = false }
  }, [device, at, plate, attempt])
  const capture = lookup?.capture
  const diffS = capture ? Math.round(capture.diffMs / 1000) : null
  const otherPlate = capture?.plate && capture.plate !== plate ? capture.plate : null
  return <section className="pv-photo">
    <header><span>{label}</span><strong>{plate}</strong>
      <small>{device ?? 'Sin cámara de referencia'}{at ? ` · hora operativa ${date(at)}` : ''}{relation ? ` · ${relation}` : ''}</small>
      {capture ? <small className={diffS != null && Math.abs(diffS) > 30 ? 'pv-warn' : ''}>Hora cámara {date(capture.at)} · {diffS != null && Math.abs(diffS) <= 30 ? 'coincide con el evento' : `captura aproximada (${diffS} s de diferencia)`}</small> : null}
      {otherPlate ? <small className="pv-warn">El DSS devolvió la patente {otherPlate} para esta foto.</small> : null}
    </header>
    <div className="pv-photo__scene">{capture?.sceneFile ? <ZoomImage src={cameraCaptureImageUrl(capture.sceneFile)} alt={`${label}: camión ${plate}`} /> : <p>{!device || !at ? 'No hay una captura de referencia registrada para esta patente.' : error ? `No se pudo consultar la foto: ${error}` : lookup?.error ? `No se pudo consultar la foto: ${lookup.error}` : lookup ? 'El DSS no tiene la foto de esta captura.' : 'Buscando foto en DSS…'}</p>}</div>
    {capture?.plateFile ? <div className="pv-photo__plate"><ZoomImage src={cameraCaptureImageUrl(capture.plateFile)} alt={`Recorte de patente ${plate}`} /></div> : null}
    <p className="pv-photo__attrs">{capture ? <>Detectado por cámara (puede equivocarse): {[es(capture.vehicleColor), es(capture.vehicleBrand), es(capture.vehicleCategory)].filter(Boolean).join(' · ') || 'sin atributos'}</> : 'Compará el vehículo y la patente antes de confirmar.'}</p>
    {device && at && (error || (lookup && !capture?.sceneFile)) ? <button type="button" onClick={() => setAttempt(n => n + 1)}>Reintentar foto</button> : null}
  </section>
}

const REJECT_REASONS = ['No es un vehículo (falsa detección)', 'Vehículo de servicio / fuera del circuito', 'Lectura duplicada de otra captura', 'Otro']
type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'error'; error: DecisionError | Error }

export type VerificationChoice = { decision: ReviewDecision; candidate?: IdentificationCandidate & Partial<CandidateEvidence>; ownRead?: boolean }
export function PlateVerification({ choice, evidence, readPlate, device, at, siblings, onCancel, onConfirm }: { choice: VerificationChoice; evidence: IdentificationEvidence | null; readPlate: string; device: string; at: string; siblings: SiblingRead[]; onCancel: () => void; onConfirm: DecideFn }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<Element | null>(null)
  useEffect(() => {
    opener.current = document.activeElement
    const el = dialog.current; el?.showModal()
    return () => { el?.close(); (opener.current as HTMLElement | null)?.focus?.() }
  }, [])
  const candidate = evidence?.candidates.find(c => c.plate === choice.candidate?.plate) ?? choice.candidate
  const isReject = choice.decision.action === 'reject'
  const [renameTrip, setRenameTrip] = useState(false)
  const [applyTo, setApplyTo] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [reasonText, setReasonText] = useState('')
  const [noPhotoOk, setNoPhotoOk] = useState(false)
  const [photos, setPhotos] = useState<{ query: PhotoState; ref: PhotoState }>({ query: 'loading', ref: 'loading' })
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  // El mismo opId en cada reintento: el servidor no duplica una operación ya aplicada (EV-05).
  const opId = useRef(newOpId())
  const plate = choice.decision.action === 'confirm' ? choice.decision.plate : readPlate
  const last = candidate?.recentReads?.[0]
  const referenceDevice = candidate?.photoDevice ?? last?.device
  const referenceAt = candidate?.photoAt ?? last?.at
  // EV-09: la referencia puede ser anterior o posterior a la captura dudosa.
  const refDelta = referenceAt ? Date.parse(referenceAt) - Date.parse(at) : null
  const refLabel = refDelta == null ? 'Referencia del candidato' : refDelta < 0 ? `Última lectura válida anterior de ${candidate?.plate ?? plate}` : `Primera lectura válida posterior de ${candidate?.plate ?? plate}`
  const refRelation = refDelta == null ? undefined : `${span(refDelta)} ${refDelta < 0 ? 'antes' : 'después'}`
  const saving = save.kind === 'saving'
  const finalReason = reason === 'Otro' ? reasonText.trim() : reason
  const queryReady = photos.query === 'ready'
  const refReady = choice.ownRead && !renameTrip ? true : photos.ref === 'ready'
  const photosLoading = photos.query === 'loading' || (!refReady && photos.ref === 'loading')
  // EV-04: sin las dos fotos no hay verificación visual; la excepción es explícita.
  const evidenceOk = isReject ? photos.query !== 'loading' : (queryReady && refReady) || (!photosLoading && noPhotoOk)
  const conflict = save.kind === 'error' && save.error instanceof DecisionError && save.error.kind === 'conflict'
  const canConfirm = !saving && !conflict && evidenceOk && (!isReject || Boolean(finalReason))

  async function submit() {
    if (saving) return
    setSave({ kind: 'saving' })
    let decision: ReviewDecision = choice.decision
    if (decision.action === 'confirm' && choice.ownRead) decision = { ...decision, journeyUid: renameTrip ? candidate?.journeyUid ?? null : null }
    if (decision.action === 'reject') decision = { action: 'reject', reason: finalReason }
    if (decision.action === 'confirm' && noPhotoOk && !(queryReady && refReady)) decision = { ...decision, reason: 'confirmado sin foto de referencia' }
    try { await onConfirm(decision, { applyTo }, opId.current) }
    catch (e) { setSave({ kind: 'error', error: e instanceof Error ? e : new Error(String(e)) }) }
  }

  const err = save.kind === 'error' ? save.error : null
  const errKind = err instanceof DecisionError ? err.kind : 'unknown'
  const status = saving ? 'Guardando decisión…' : err ? (errKind === 'conflict' ? `Conflicto: ${err.message}` : errKind === 'rejected' ? `No se guardó: ${err.message}` : `Resultado por verificar: ${err.message}. Reintentar no duplica la decisión.`) : photosLoading ? 'Esperando las fotos para habilitar la confirmación.' : 'Todavía no se guardó ninguna decisión.'

  return createPortal(<dialog ref={dialog} className="pv-dialog" aria-labelledby="pv-title" onCancel={event => { event.preventDefault(); if (!saving) onCancel() }}>
    <header className="pv-header"><div><span>Doble verificación</span><h2 id="pv-title">{isReject ? 'Descartar detección' : 'Comparar antes de confirmar'}</h2>
      <p>{isReject ? `La lectura ${readPlate} se retira por no ser un caso válido. Si solo no podés identificarla, cancelá y usá «No puedo determinar».` : <><b className="pv-change">{readPlate} → {plate}</b>{choice.ownRead ? ' · la cámara leyó bien' : ''}</>}</p></div>
      <button type="button" aria-label="Cancelar verificación" disabled={saving} onClick={onCancel}>×</button></header>
    <div className="pv-body">
      <div className="pv-photos">
        <VerificationPhoto label="Captura a identificar" device={device} at={at} plate={readPlate} onState={s => setPhotos(p => ({ ...p, query: s }))} />
        {isReject || (choice.ownRead && !renameTrip) ? null : <VerificationPhoto label={refLabel} device={referenceDevice} at={referenceAt} plate={candidate?.plate ?? plate} relation={refRelation} onState={s => setPhotos(p => ({ ...p, ref: s }))} />}
      </div>
      {!isReject && candidate && !choice.ownRead ? <div className="pv-scores">
        <div><span>Apoyo del modelo a este candidato</span><strong>{pct(candidate.probability)}</strong><small>Estimación relativa entre los candidatos listados; no es una certeza calibrada.</small></div>
        <div><span>Factor: parecido de patente</span><strong>{pct(candidate.similarity)}</strong><small>Cuánto se parecen los caracteres, nada más.</small></div>
        <div><span>Factor: esperado en este punto</span><strong>{pct(candidate.nodeProbability)}</strong></div>
        <div><span>Factor: circuito compatible</span><strong>{candidate.circuit ? `${candidate.circuit} · ${pct(candidate.circuitProbability)}` : 'Sin circuito confirmado'}</strong></div>
      </div> : null}
      {!isReject && candidate && !choice.ownRead && (candidate.similarity ?? 0) - (candidate.probability ?? 0) > 0.4 ? <p className="pv-note">La patente se parece, pero el modelo le da poco apoyo: hay otros candidatos o el recorrido no cierra. Los porcentajes no se suman ni se reemplazan entre sí.</p> : null}
      {!isReject && candidate?.comparisons?.length && !choice.ownRead ? <div className="pv-comparisons"><b>Detectado por cámara</b>{candidate.comparisons.map(c => <span key={c.kind} className={c.result === 'distinto' ? 'is-different' : ''}>{ATTR[c.kind] ?? c.kind}: {es(c.read) ?? 'sin dato'} → {es(c.candidate) ?? 'sin dato'} · {c.result === 'coincide' ? 'coincide' : c.result === 'distinto' ? 'difiere' : 'sin dato'}</span>)}</div> : null}
      {choice.ownRead && candidate ? <fieldset className="pv-scope"><legend>¿Qué afirmás?</legend>
        <label><input type="radio" name="own" checked={!renameTrip} onChange={() => setRenameTrip(false)} disabled={saving} /> La lectura {readPlate} es correcta; es otro vehículo (no se toca ningún viaje).</label>
        <label><input type="radio" name="own" checked={renameTrip} onChange={() => setRenameTrip(true)} disabled={saving} /> Es el mismo vehículo que figura como {candidate.plate}: corregir la patente de ese viaje a {readPlate}.</label>
        {renameTrip ? <p className="pv-warn">Se renombrará el viaje {candidate.plate} → {readPlate}. Compará las dos fotos.</p> : null}
        <p className="pv-note">«Ningún candidato listado»: {pct(evidence?.otherProbability)} — agrupa lectura correcta u otro vehículo; no es certeza de {readPlate}.</p>
      </fieldset> : null}
      {isReject ? <fieldset className="pv-scope"><legend>Motivo del descarte (obligatorio)</legend>
        {REJECT_REASONS.map(r => <label key={r}><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} disabled={saving} /> {r}</label>)}
        {reason === 'Otro' ? <input className="pv-input" aria-label="Motivo" value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="Describí el motivo" /> : null}
      </fieldset> : null}
      {siblings.length ? <fieldset className="pv-scope"><legend>Otras lecturas «{readPlate}» pendientes (±3 h)</legend>
        <p className="pv-note">Por defecto solo se decide esta captura. Marcá las que verificaste que son el mismo vehículo.</p>
        {siblings.map(s => <label key={s.fragmentKey}><input type="checkbox" disabled={saving} checked={applyTo.includes(s.fragmentKey)} onChange={e => setApplyTo(list => e.target.checked ? [...list, s.fragmentKey] : list.filter(k => k !== s.fragmentKey))} /> {hhmm(s.at)} · {s.nodeLabel} · {s.deviceCode}</label>)}
      </fieldset> : null}
      {!isReject && !photosLoading && !(queryReady && refReady) ? <label className="pv-exception"><input type="checkbox" checked={noPhotoOk} disabled={saving} onChange={e => setNoPhotoOk(e.target.checked)} /> Falta una foto: confirmo igual por otra evidencia (queda registrado como confirmación sin foto).</label> : null}
      <p className="pv-note">Alcance: {isReject ? 'se descarta' : 'se confirma'} esta captura{applyTo.length ? ` y ${applyTo.length} lectura(s) marcada(s)` : ' únicamente'}{choice.ownRead && renameTrip ? `, y se renombra el viaje ${candidate?.plate}` : ''}.</p>
    </div>
    <footer className="pv-footer"><span role="status" className={err ? 'pv-error' : ''}>{status}</span>
      <button type="button" disabled={saving} onClick={onCancel}>{errKind === 'conflict' && err ? 'Cerrar y revisar' : 'Cancelar'}</button>
      {errKind === 'conflict' && err ? null : <button type="button" className="pv-confirm" disabled={!canConfirm || saving} onClick={() => void submit()}>{saving ? 'Guardando…' : err ? 'Reintentar' : isReject ? 'Descartar detección' : `Confirmar ${plate}`}</button>}
    </footer>
  </dialog>, document.body)
}
