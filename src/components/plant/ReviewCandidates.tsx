import { Fragment, useEffect, useRef, useState } from 'react'
import type { AttributeComparison, CandidateEvidence, IdentificationCandidate, IdentificationEvidence } from '../../services/live/plantStateApi'
import type { DecisionOptions, IdentificationDecision } from '../../services/live/plantStateApi'
import { getIdentificationEvidence } from '../../services/live/plantStateApi'
import { CapturePhoto } from './CapturePhoto'
import { PlateVerification, type VerificationChoice } from './PlateVerification'

export type ReviewDecision = IdentificationDecision
/** Guarda la decisión; rechaza con DecisionError para que el diálogo muestre el resultado (EV-05). */
export type DecideFn = (d: ReviewDecision, options?: DecisionOptions, opId?: string) => Promise<void>
/** Lectura gemela (misma patente leída, pendiente, ±3 h) que recibe la misma decisión solo si el operador la marca. */
export type SiblingRead = { fragmentKey: string; at: string; nodeLabel: string; deviceCode: string }
const DEFER_REASONS = ['Foto ilegible o tapada', 'Dos candidatos igual de parecidos', 'Falta foto de referencia', 'Necesito otra captura del mismo camión', 'Consultar con balanza / portería']

function hhmm(iso?: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/** Celda de atributo: valor del candidato y si coincide con la lectura. */
function AttrCell({ cmp }: { cmp?: AttributeComparison }) {
  if (!cmp || cmp.result === 'sin_dato') return <span className="text-slate-400">{cmp?.candidate ?? 'sin dato'}</span>
  const ok = cmp.result === 'coincide'
  return (
    <span className={ok ? 'text-emerald-700' : 'text-rose-700'}>
      {ok ? '✓' : '✗'} {cmp.candidate}
    </span>
  )
}

function routeText(c: IdentificationCandidate) {
  const node = c.lastNodeLabel ?? c.lastNode ?? ''
  const where =
    c.where === 'leido_despues' ? `leído después en ${node}` : c.where === 'otra_planta' ? `en la otra planta (${node})` : `en planta, último paso ${node}`
  // Circuito SI la lectura es de este camión (nodos que hizo + este nodo).
  const circuit = c.circuit ? `si es él: ${c.circuit} ${pct(c.circuitProbability)}` : 'si es él: ningún circuito pasa por acá'
  const here = c.sameNode ? 'ya estaba en este nodo' : c.nodeProbability >= 0.05 ? `esperado acá (${pct(c.nodeProbability)})` : 'no lo esperábamos acá'
  const before = c.circuitBefore && c.circuitBefore !== c.circuit ? `venía haciendo ${c.circuitBefore}` : null
  return { where: `${where} ${hhmm(c.lastSeenAt)}`, circuit, before, here, expected: Boolean(c.sameNode) || c.nodeProbability >= 0.05, possible: Boolean(c.circuit) }
}

/**
 * Revisión de una lectura dudosa: qué leyó la cámara (con su foto y atributos del DSS) y, por
 * candidato, patente, color, marca, tipo, circuito y la probabilidad combinada.
 */
export function ReviewCandidates({
  site,
  fragmentKey,
  readPlate,
  validFormat,
  deviceCode,
  at,
  nodeLabel,
  candidates: liveCandidates,
  busy,
  onDecide,
  siblings = [],
  compact = false,
}: {
  site: string
  fragmentKey: string
  readPlate: string
  validFormat: boolean
  deviceCode: string
  at: string
  nodeLabel: string
  candidates: IdentificationCandidate[]
  busy: boolean
  onDecide: DecideFn
  siblings?: SiblingRead[]
  compact?: boolean
}) {
  // EV-36: lo que se está inspeccionando queda fijo; si llegan candidatos nuevos se avisa y se actualiza a pedido.
  const signature = (list: IdentificationCandidate[]) => list.map((c) => `${c.plate}:${c.score}`).join('|')
  const [candidates, setCandidates] = useState(liveCandidates)
  const changed = signature(liveCandidates) !== signature(candidates)
  // EV-19: el borrador de patente escrita sobrevive al cambio de vista.
  const draftKey = `id-draft:${site}:${fragmentKey}`
  const [typed, setTypedState] = useState(() => {
    try { return sessionStorage.getItem(draftKey) ?? '' } catch { return '' }
  })
  const setTyped = (v: string) => {
    setTypedState(v)
    try { if (v) sessionStorage.setItem(draftKey, v); else sessionStorage.removeItem(draftKey) } catch { /* sin storage */ }
  }
  const [openReads, setOpenReads] = useState<string | null>(null)
  const [ev, setEv] = useState<IdentificationEvidence | null>(null)
  const [evError, setEvError] = useState<string | null>(null)
  const [evAttempt, setEvAttempt] = useState(0)
  const [verification, setVerification] = useState<VerificationChoice | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [deferOpen, setDeferOpen] = useState(false)
  const [deferReason, setDeferReason] = useState('')
  const [deferError, setDeferError] = useState('')

  // La evidencia (consultas al DSS) se pide recién cuando la tarjeta aparece en pantalla:
  // pedir todas juntas supera el límite de consultas del DSS (HTTP 429).
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [onScreen, setOnScreen] = useState(false)
  useEffect(() => {
    const el = rootRef.current
    if (!el || onScreen) return
    if (typeof IntersectionObserver === 'undefined') return setOnScreen(true)
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setOnScreen(true)
        io.disconnect()
      }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [onScreen])

  useEffect(() => {
    let alive = true
    setEv(null)
    setEvError(null)
    if (!fragmentKey || !onScreen) return
    getIdentificationEvidence(site, fragmentKey)
      .then((r) => {
        if (alive) setEv(r)
      })
      .catch((e) => {
        if (alive) setEvError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      alive = false
    }
  }, [site, fragmentKey, onScreen, evAttempt])

  // Mientras llega la evidencia se muestran los candidatos sin atributos.
  const rows: (IdentificationCandidate & Partial<CandidateEvidence>)[] =
    ev?.candidates ?? candidates.filter((c) => c.similarity >= 0.4 || c.nodeProbability >= 0.5).slice(0, 3)
  // EV-14: los candidatos guardados que la evidencia no muestra siguen accesibles bajo demanda.
  const extra: typeof rows = showAll ? candidates.filter((c) => !rows.some((r) => r.plate === c.plate)) : []
  const ranked = [...rows, ...extra].sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
  const readAttrs = ev?.read.attrs
  const normalizedTyped = typed.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const typedValid = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/.test(normalizedTyped)
  const btn = 'rounded-md border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50'
  const cmp = (c: Partial<CandidateEvidence>, kind: AttributeComparison['kind']) => c.comparisons?.find((x) => x.kind === kind)

  return (
    <div ref={rootRef} className="space-y-3">
      {changed && !verification ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[12px] text-sky-900" role="status">
          Llegaron candidatos o puntajes nuevos para esta lectura.
          <button type="button" className="underline" onClick={() => { setCandidates(liveCandidates); setEvAttempt((n) => n + 1) }}>Actualizar</button>
        </div>
      ) : null}
      <div className={compact ? 'space-y-1' : 'flex flex-wrap items-start gap-4'}>
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">La cámara leyó</div>
          <div className="font-mono text-[18px] font-bold text-slate-900">{readPlate}</div>
          <div className="text-[12px] text-slate-500">
            {deviceCode} · {nodeLabel} · {hhmm(at)}
          </div>
          <div className="mt-1 text-[12px] text-slate-700">
            {readAttrs
              ? [readAttrs.vehicleColor, readAttrs.vehicleBrand, readAttrs.vehicleCategory].filter(Boolean).join(' · ') || 'sin color, marca ni tipo'
              : ev?.dssError
                ? 'no se pudo consultar el DSS'
                : ev
                  ? 'el DSS no tiene esta lectura'
                : 'buscando color, marca y tipo…'}
            {readAttrs?.confidence != null ? ` · confianza ${readAttrs.confidence}` : ''}
          </div>
        </div>
        <div className={compact ? '' : 'min-w-[260px] max-w-[420px] flex-1'}>
          <CapturePhoto deviceCode={deviceCode} at={at} readPlate={readPlate} buttonClassName={`${btn} border-slate-300 bg-white text-slate-700`} />
        </div>
      </div>

      {candidates.length > rows.length ? (
        <div className="text-[12px] text-slate-600">
          {rows.length} sugeridos de {candidates.length} evaluados (los más parecidos o esperados en este punto).{' '}
          <button type="button" className="underline" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Ver solo sugeridos' : 'Ver todos'}</button>
        </div>
      ) : null}
      {ranked.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="text-[12px] text-slate-500">
              <tr>
                <th className="py-1 pr-2">Candidato</th>
                <th className="py-1 pr-2">Patente</th>
                <th className="py-1 pr-2" title="Detectado por cámara; puede equivocarse">Color*</th>
                <th className="py-1 pr-2" title="Detectado por cámara; puede equivocarse">Marca*</th>
                <th className="py-1 pr-2" title="Detectado por cámara; puede equivocarse">Tipo*</th>
                <th className="py-1 pr-2">Recorrido</th>
                <th className="py-1 pr-2 text-right" title="Apoyo relativo del modelo entre los candidatos listados">Apoyo del modelo</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {ranked.map((c) => {
                const r = routeText(c)
                return (
                  <Fragment key={c.plate}>
                  <tr className="border-t border-slate-100 align-top">
                    <td className="py-1.5 pr-2">
                      <button
                        type="button"
                        className="font-mono text-[14px] font-bold text-slate-900 underline decoration-dotted underline-offset-2"
                        onClick={() => setVerification({ decision: { action: 'confirm', plate: c.plate, journeyUid: c.journeyUid }, candidate: c })}
                        title="Comparar fotos y probabilidades antes de confirmar"
                      >
                        {c.plate}
                      </button>
                      <button type="button" className="ml-2 text-xs text-slate-500" onClick={() => setOpenReads(openReads === c.plate ? null : c.plate)} aria-label={`Ver últimas lecturas de ${c.plate}`}>{openReads === c.plate ? '▾' : '▸'}</button>
                      {c.photoDevice && c.photoAt ? (
                        <CapturePhoto deviceCode={c.photoDevice} at={c.photoAt} readPlate={c.plate} buttonClassName="mt-1 rounded border border-slate-300 px-1.5 py-0.5 text-[12px]" />
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2">{pct(c.similarity)} parecida</td>
                    <td className="py-1.5 pr-2"><AttrCell cmp={cmp(c, 'color')} /></td>
                    <td className="py-1.5 pr-2"><AttrCell cmp={cmp(c, 'marca')} /></td>
                    <td className="py-1.5 pr-2"><AttrCell cmp={cmp(c, 'tipo')} /></td>
                    <td className="py-1.5 pr-2">
                      <div className={r.possible ? '' : 'text-rose-700'}>{r.circuit}</div>
                      {r.before ? <div className="text-slate-500">{r.before}</div> : null}
                      <div className={r.expected ? 'text-emerald-700' : 'text-amber-700'}>{r.here}</div>
                      <div className="text-slate-500">{r.where}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-[14px] font-bold">{c.probability != null ? pct(c.probability) : '…'}</td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        className={`${btn} border-emerald-700 bg-emerald-700 text-white`}
                        disabled={busy}
                        onClick={() => setVerification({ decision: { action: 'confirm', plate: c.plate, journeyUid: c.journeyUid }, candidate: c })}
                        title={`La lectura ${readPlate} pasa a ser ${c.plate}`}
                      >
                        Comparar {c.plate}
                      </button>
                    </td>
                  </tr>
                  {openReads === c.plate ? (
                    <tr>
                      <td colSpan={8} className="bg-slate-50 px-3 py-2">
                        <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Últimas lecturas de {c.plate}</div>
                        {c.recentReads?.length ? (
                          <ul className="space-y-1">
                            {c.recentReads.map((x) => (
                              <li key={`${x.device}-${x.at}`} className="flex flex-wrap items-start gap-3 text-[12px]">
                                <span className="w-12 font-mono tabular-nums text-slate-600">{hhmm(x.at)}</span>
                                <span className="w-40 text-slate-800">{x.nodeLabel}{x.otherSite ? ' (otra planta)' : ''}</span>
                                <span className="w-36 text-slate-500">{x.device}</span>
                                <CapturePhoto deviceCode={x.device} at={x.at} readPlate={c.plate} buttonClassName="rounded border border-slate-300 px-1.5 py-0.5 text-[12px]" />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-[12px] text-slate-500">Sin lecturas registradas.</span>
                        )}
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                )
              })}
              {ev ? (
                <tr className="border-t border-slate-100 text-slate-600">
                  <td className="py-1.5 pr-2" colSpan={6}>
                    Ningún candidato listado{validFormat ? ` (la cámara pudo leer bien ${readPlate}, o es otro vehículo)` : ''}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-[14px] font-bold">{pct(ev.otherProbability)}</td>
                  <td className="py-1.5">
                    {validFormat && ranked[0] ? (
                      <button
                        type="button"
                        className={`${btn} border-slate-300 bg-white text-slate-800`}
                        disabled={busy}
                        onClick={() => setVerification({ decision: { action: 'confirm', plate: readPlate, journeyUid: null }, candidate: ranked[0], ownRead: true })}
                        title={`La lectura ${readPlate} es correcta. No renombra ningún viaje salvo que lo elijas explícitamente.`}
                      >
                        La lectura {readPlate} es correcta
                      </button>
                    ) : null}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {evError ? <p className="mt-1 text-[12px] text-rose-700">No se pudo calcular la evidencia: {evError}</p> : null}
          {evError || ev?.dssError ? (
            <p className="mt-1 text-[12px] text-rose-700">
              {ev?.dssError ? `El DSS no respondió (${ev.dssError}): color, marca y tipo quedaron sin dato y la probabilidad no los considera. ` : ''}
              <button type="button" className="underline" onClick={() => setEvAttempt((n) => n + 1)}>Reintentar evidencia</button>
            </p>
          ) : null}
          {ev && !ev.dss ? <p className="mt-1 text-[12px] text-slate-500">Sin DSS configurado: color, marca y tipo no entran en la probabilidad.</p> : null}
        </div>
      ) : (
        <div className="text-[12px] text-slate-500">Ningún camión en planta se parece a esta lectura.</div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            const plate = typed.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
            if (typedValid) setVerification({ decision: { action: 'confirm', plate }, candidate: ranked.find(c => c.plate === plate) })
          }}
        >
          <input
            className="w-36 rounded-md border border-slate-300 px-2 py-1 font-mono text-[12px] uppercase"
            placeholder="Otra patente"
            aria-label="Escribir la patente correcta"
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
          />
          <button type="submit" className={`${btn} border-slate-300 bg-white text-slate-800`} disabled={busy || !typedValid}>
            Confirmar patente
          </button>
        </form>
        <button type="button" className={`${btn} border-amber-400 bg-amber-50 text-amber-900`} disabled={busy} onClick={() => setDeferOpen((v) => !v)}>
          No puedo determinar
        </button>
        <button type="button" className={`${btn} border-slate-300 bg-white text-slate-600`} disabled={busy} onClick={() => setVerification({ decision: { action: 'reject', reason: '' } })}>
          Descartar detección
        </button>
      </div>
      {deferOpen ? (
        <form
          className="flex flex-wrap items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-[12px]"
          onSubmit={(e) => {
            e.preventDefault()
            if (!deferReason) return
            setDeferError('')
            onDecide({ action: 'defer', reason: deferReason }).catch((err) => setDeferError(err instanceof Error ? err.message : String(err)))
          }}
        >
          <span>Queda pendiente con motivo:</span>
          <select aria-label="Motivo para posponer" className="rounded border border-amber-300 px-1 py-0.5" value={deferReason} onChange={(e) => setDeferReason(e.target.value)}>
            <option value="">Elegí un motivo…</option>
            {DEFER_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="submit" className={`${btn} border-amber-600 bg-amber-600 text-white`} disabled={busy || !deferReason}>Posponer</button>
          {deferError ? <span className="text-rose-700">No se guardó: {deferError}</span> : null}
        </form>
      ) : null}
      {typed && !typedValid ? <p className="text-xs text-amber-700">Usá el formato ABC123 o AB123CD.</p> : null}
      {verification ? <PlateVerification choice={verification} evidence={ev} readPlate={readPlate} device={deviceCode} at={at} siblings={siblings} onCancel={() => setVerification(null)} onConfirm={onDecide} /> : null}
    </div>
  )
}
