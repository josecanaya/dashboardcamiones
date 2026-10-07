import { useCallback, useEffect, useRef, useState } from 'react'
import type { IdentificationItem, IdentificationLevel, IdentificationsResponse } from '../../services/live/plantStateApi'
import { decideIdentification, getIdentifications } from '../../services/live/plantStateApi'
import { CapturePhoto } from './CapturePhoto'
import { ReviewCandidates, type ReviewDecision, type SiblingRead } from './ReviewCandidates'
import type { DecisionOptions } from '../../services/live/plantStateApi'
import './identificationDesk.css'

type Site = 'ricardone' | 'san_lorenzo'
type Queue = 'actual' | 'anteriores' | 'resueltas'
type Sort = 'antiguedad' | 'punto' | 'recientes'
type Row = { site: Site; item: IdentificationItem; key: string }
const LABEL: Record<IdentificationLevel, string> = { confirmado: 'Confirmada por operador', casi_seguro: 'Aplicada automáticamente', provisorio: 'Por confirmar', pendiente: 'Lectura ilegible', rechazado: 'Descartada' }
const isPending = (item: IdentificationItem) => item.level === 'provisorio' || item.level === 'pendiente'
const siteName = (site: Site) => site === 'ricardone' ? 'Ricardone' : 'San Lorenzo'
const TZ = 'America/Argentina/Buenos_Aires'
function stamp(at: string) {
  return new Date(at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
}
function age(at: string, now: number) {
  const m = Math.max(0, Math.round((now - Date.parse(at)) / 60000))
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d`
}
/**
 * Cortes de turno en hora argentina (UTC−3). Configurables con VITE_SHIFT_HOURS="0,8,16" (EV-21)
 * hasta acordar los turnos reales con planta.
 */
const SHIFT_HOURS = String(import.meta.env.VITE_SHIFT_HOURS ?? '0,8,16').split(',').map(Number).filter(h => h >= 0 && h < 24).sort((a, b) => a - b)
function shiftStart(now = Date.now()) {
  const local = new Date(now - 3 * 3600000)
  const h = local.getUTCHours()
  const start = [...SHIFT_HOURS].reverse().find(x => x <= h)
  if (start == null) { local.setUTCDate(local.getUTCDate() - 1); local.setUTCHours(SHIFT_HOURS[SHIFT_HOURS.length - 1] ?? 0, 0, 0, 0) }
  else local.setUTCHours(start, 0, 0, 0)
  return local.getTime() + 3 * 3600000
}
const shiftText = SHIFT_HOURS.map((h, i) => `${String(h).padStart(2, '0')}–${String(SHIFT_HOURS[(i + 1) % SHIFT_HOURS.length] || 24).padStart(2, '0')}`).join(', ')

/** Sesión de revisión: sobrevive al cambio de vista (EV-19). */
type Session = { queue: Queue; search: string; point: string; selected: string | null; sort: Sort; locate?: boolean }
const SESSION_KEY = 'id-desk-session'
function loadSession(): Session {
  try { const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null'); if (v) return { queue: 'actual', search: '', point: '', selected: null, sort: 'antiguedad', ...v } } catch { /* sin storage */ }
  return { queue: 'actual', search: '', point: '', selected: null, sort: 'antiguedad' }
}

/** Deja preseleccionado un caso para cuando se abra la bandeja (desde el feed, cámaras o plano). */
export function openIdentificationCase(site: Site, fragmentKey: string) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...loadSession(), search: '', point: '', selected: `${site}:${fragmentKey}`, locate: true })) } catch { /* sin storage */ }
}

type SiteState ={ data?: IdentificationsResponse; error?: string; fetchedAt?: number }

export function IdentificationPanel({ sites, mode = 'desk', onOpen }: { sites: Site[]; mode?: 'desk' | 'monitor'; onOpen?: () => void }) {
  const [state, setState] = useState<Partial<Record<Site, SiteState>>>({})
  const [session, setSession] = useState<Session>(loadSession)
  const { queue, search, point, selected, sort } = session
  const patch = (p: Partial<Session>) => setSession(s => ({ ...s, ...p }))
  useEffect(() => { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)) } catch { /* sin storage */ } }, [session])
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [receipt, setReceipt] = useState('')
  const [now, setNow] = useState(Date.now())
  const sitesKey = sites.join(',')
  const generation = useRef(0)
  // EV-34: cada planta se carga sola; una falla no descarta la otra, y respuestas de un alcance viejo se ignoran.
  const load = useCallback(async () => {
    const gen = ++generation.current
    await Promise.all(sitesKey.split(',').map(async s => {
      const site = s as Site
      try {
        const data = await getIdentifications(site)
        if (gen === generation.current) setState(prev => ({ ...prev, [site]: { data, fetchedAt: Date.now() } }))
      } catch (e) {
        if (gen === generation.current) setState(prev => ({ ...prev, [site]: { ...prev[site], error: e instanceof Error ? e.message : String(e) } }))
      }
    }))
    if (gen === generation.current) { setLoaded(true); setNow(Date.now()) }
  }, [sitesKey])
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 15000); return () => clearInterval(timer) }, [load])

  const rows: Row[] = sites.flatMap(site => (state[site]?.data?.items ?? []).map(item => ({ site, item, key: `${site}:${item.fragmentKey}` })))
  const start = shiftStart(now)
  const current = rows.filter(row => isPending(row.item) && Date.parse(row.item.at) >= start)
  const previous = rows.filter(row => isPending(row.item) && Date.parse(row.item.at) < start)
  const resolved = rows.filter(row => !isPending(row.item))
  // Caso pedido desde otra vista: se ubica en la cola que lo contiene.
  useEffect(() => {
    if (!session.locate || !loaded || !selected) return
    const q: Queue | null = current.some(r => r.key === selected) ? 'actual' : previous.some(r => r.key === selected) ? 'anteriores' : resolved.some(r => r.key === selected) ? 'resueltas' : null
    patch({ locate: false, ...(q ? { queue: q } : {}) })
  })
  const queueRows = queue ==='actual' ? current : queue === 'anteriores' ? previous : resolved
  const filtered = Boolean(search || point)
  const visible = queueRows
    .filter(({ site, item }) => (!point || `${site}:${item.node}` === point) && `${item.readPlate} ${item.assignedPlate ?? ''} ${item.candidates.map(c => c.plate).join(' ')}`.includes(search.toUpperCase()))
    .sort((a, b) => queue === 'resueltas' || sort === 'recientes' ? b.item.at.localeCompare(a.item.at) : sort === 'punto' ? `${a.site}${a.item.nodeLabel}${a.item.at}`.localeCompare(`${b.site}${b.item.nodeLabel}${b.item.at}`) : a.item.at.localeCompare(b.item.at))
  // El caso abierto queda fijo aunque la lista se refresque (EV-20): sin selección explícita no se salta a otro.
  const active = (selected ? visible.find(row => row.key === selected) : null) ?? (selected ? null : visible[0] ?? null)
  const selectedGone = Boolean(selected && !active)
  const errors = sites.filter(s => state[s]?.error)
  const stale = sites.filter(s => state[s]?.fetchedAt && now - (state[s]!.fetchedAt!) > 60000)

  const siblingsOf = (row: Row): SiblingRead[] => rows
    .filter(r => r.site === row.site && r.key !== row.key && isPending(r.item) && r.item.readPlate === row.item.readPlate && Math.abs(Date.parse(r.item.at) - Date.parse(row.item.at)) <= 3 * 3600000)
    .map(r => ({ fragmentKey: r.item.fragmentKey, at: r.item.at, nodeLabel: r.item.nodeLabel, deviceCode: r.item.deviceCode }))

  /** Guarda; los errores suben al diálogo (EV-05). Tras el éxito, recibo y siguiente caso anunciado. */
  async function decide(row: Row, decision: ReviewDecision | { action: 'clear'; reason?: string }, options: DecisionOptions = {}, opId?: string) {
    setBusy(true)
    try {
      const result = await decideIdentification(row.site, row.item.fragmentKey, decision, { ...options, expectedVersion: row.item.decision?.updatedAt ?? null }, opId)
      const idx = visible.findIndex(r => r.key === row.key)
      const next = visible.filter(r => r.key !== row.key && !(options.applyTo ?? []).includes(r.item.fragmentKey))[Math.max(0, idx)] ?? null
      const what = decision.action === 'confirm' ? `${row.item.readPlate} → ${decision.plate}` : decision.action === 'reject' ? `${row.item.readPlate} descartada (${decision.reason})` : decision.action === 'defer' ? `${row.item.readPlate} pospuesta (${decision.reason})` : `${row.item.readPlate} reabierta para revisión humana`
      setReceipt(`Guardado: ${what} · ${siteName(row.site)} · ${row.item.nodeLabel} · ${stamp(row.item.at)}${result.siblings.length ? ` · también ${result.siblings.length} lectura(s) marcada(s)` : ''}${result.replayed ? ' · (ya estaba aplicado)' : ''}${next && decision.action !== 'clear' ? `. Abierto ahora: ${next.item.readPlate} (${next.item.nodeLabel}).` : '.'}`)
      patch({ selected: decision.action === 'clear' ? row.key : next?.key ?? null })
      await load()
    } finally { setBusy(false) }
  }

  if (mode === 'monitor') return <section className="id-monitor" aria-label="Alertas de patentes">
    <div className="id-monitor__icon" aria-hidden="true">{current.length + previous.length ? '!' : '✓'}</div>
    <div><strong>{!loaded ? 'Consultando casos de patentes…' : current.length ? `${current.length} casos por confirmar en este turno` : 'Sin casos por confirmar en este turno'}</strong><p>{errors.length ? `Sin actualizar: ${errors.map(siteName).join(', ')}` : `${previous.length} casos pendientes de turnos anteriores · supervisión de ${sites.length === 2 ? 'ambas plantas' : siteName(sites[0])}`}</p></div>
    <button type="button" onClick={onOpen}>Abrir bandeja <span aria-hidden="true">→</span></button>
  </section>

  const emptyMessage = !loaded ? 'Cargando casos…' : errors.length === sites.length ? 'No se pudo consultar la bandeja.' : filtered && queueRows.length ? `Sin coincidencias: 0 de ${queueRows.length} casos con estos filtros.` : queue === 'actual' ? 'Sin casos pendientes en este turno.' : queue === 'anteriores' ? 'No hay pendientes anteriores registrados.' : 'Todavía no hay decisiones registradas.'
  // EV-17: «al día» solo si de verdad no hay pendientes, la carga terminó y ninguna planta falló.
  const reallyClear = loaded && !errors.length && !current.length && !previous.length

  return <section className="id-desk" aria-label="Bandeja de confirmación de patentes">
    <header className="id-desk__header"><div><span className="id-eyebrow">Supervisión de reconocimiento</span><h2>Bandeja de patentes</h2><p>El sistema reconoce. Vos resolvés los casos que necesitan una decisión.</p></div>
      <div className="id-auto">{sites.map(s => <div key={s}><span className={state[s]?.error ? 'is-down' : stale.includes(s) ? 'is-stale' : ''} /> {siteName(s)}: {state[s]?.error ? 'sin respuesta' : state[s]?.fetchedAt ? `actualizado ${new Date(state[s]!.fetchedAt!).toLocaleTimeString('es-AR', { timeZone: TZ, hour12: false })}` : 'consultando…'}</div>)}<small>Indica la última respuesta de la bandeja, no que las cámaras estén leyendo.</small></div></header>
    <div className="id-summary"><div><strong>{loaded ? current.length : '—'}</strong><span>Casos por confirmar · turno actual</span></div><div><strong>{loaded ? previous.length : '—'}</strong><span>Casos pendientes anteriores</span></div><div><strong>{resolved.filter(r => r.item.level === 'casi_seguro').length}</strong><span>Aplicadas automáticamente · archivo</span></div><div><strong>{resolved.filter(r => r.item.level === 'confirmado').length}</strong><span>Confirmadas por operador · archivo</span></div></div>
    <div className="id-toolbar"><div role="group" aria-label="Cola de revisión">{([['actual', 'Turno actual', current.length], ['anteriores', 'Turnos anteriores', previous.length], ['resueltas', 'Resueltas', resolved.length]] as const).map(([id, label, count]) => <button type="button" key={id} aria-pressed={queue === id} onClick={() => patch({ queue: id, selected: null })}>{label} <b>{count}</b></button>)}</div>
      <input aria-label="Buscar patente o candidato" placeholder="Buscar patente o candidato" value={search} onChange={e => patch({ search: e.target.value })} />
      <select aria-label="Filtrar punto de control" value={point} onChange={e => patch({ point: e.target.value })}><option value="">Todos los puntos</option>{Array.from(new Map(rows.map(r => [`${r.site}:${r.item.node}`, `${siteName(r.site)} · ${r.item.nodeLabel}`])).entries()).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      {queue !== 'resueltas' ? <select aria-label="Orden" value={sort} onChange={e => patch({ sort: e.target.value as Sort })}><option value="antiguedad">Más antiguos primero</option><option value="recientes">Más recientes primero</option><option value="punto">Por planta y punto</option></select> : null}
      {filtered ? <button type="button" onClick={() => patch({ search: '', point: '' })}>Limpiar filtros</button> : null}</div>
    <p className="id-shift">{queue === 'anteriores' ? 'Pendientes conservados con sus candidatos originales, aunque ya no estén en el estado de planta.' : queue === 'actual' ? `Turnos de referencia: ${shiftText} h · hora argentina. La antigüedad indica hace cuánto se capturó, no que el camión siga esperando.` : 'Registro de decisiones. Ver la decisión no la modifica; reabrir es una acción aparte.'}</p>
    {errors.length ? <div className="id-error" role="alert">No se pudo actualizar {errors.map(s => `${siteName(s)} (${state[s]?.error})`).join(' · ')}. {errors.length < sites.length ? 'La otra planta sigue actualizada.' : ''}<button type="button" onClick={() => void load()}>Reintentar</button></div> : null}
    {receipt ? <p className="id-notice" role="status">{receipt}</p> : null}
    <div className="id-workspace"><aside className="id-queue" aria-label="Casos por revisar"><div className="id-queue__title">{filtered ? `${visible.length} de ${queueRows.length} casos` : `${visible.length} casos`}</div>
      {visible.map(row => <button type="button" disabled={busy} key={row.key} className={active?.key === row.key ? 'is-selected' : ''} aria-pressed={active?.key === row.key} onClick={() => { patch({ selected: row.key }); setReceipt('') }}>
        <span className={`id-level id-level--${row.item.level}`}>{row.item.decision?.action === 'defer' ? 'Pospuesta' : row.item.decision?.action === 'review' ? 'Revisión solicitada' : LABEL[row.item.level]}</span>
        <strong>{row.item.readPlate === 'SIN_PATENTE' ? 'Sin lectura' : row.item.readPlate}</strong><span>{siteName(row.site)} · {row.item.nodeLabel}</span>
        <small>{stamp(row.item.at)}{queue !== 'resueltas' ? ` · hace ${age(row.item.at, now)}` : ''} · {row.item.candidates.length} candidatos{row.item.events > 1 ? ` · ${row.item.events} capturas` : ''}</small>
        {row.item.decision?.action === 'defer' ? <small className="id-defer">Motivo: {row.item.decision.reason}{row.item.decision.attempts ? ` · ${row.item.decision.attempts} intento(s)` : ''}</small> : null}
      </button>)}
      {!visible.length ? <p className="id-empty">{emptyMessage}{filtered && queueRows.length ? <button type="button" onClick={() => patch({ search: '', point: '' })}>Limpiar filtros</button> : null}</p> : null}</aside>
    <main className="id-case">{active ? <><header className="id-case__header"><div><span className="id-eyebrow">{siteName(active.site)} · {active.item.nodeLabel}</span><h3>{isPending(active.item) ? 'Confirmar identidad del camión' : 'Identificación resuelta'}</h3><p>{stamp(active.item.at)} · {active.item.deviceCode}</p></div><span className={`id-level id-level--${active.item.level}`}>{LABEL[active.item.level]}</span></header>
      <p className="id-reason">{active.item.reason}</p>
      {isPending(active.item)
        ? <ReviewCandidates key={active.key} site={active.site} fragmentKey={active.item.fragmentKey} readPlate={active.item.readPlate} validFormat={active.item.validFormat} deviceCode={active.item.deviceCode} at={active.item.at} nodeLabel={active.item.nodeLabel} candidates={active.item.candidates} busy={busy} siblings={siblingsOf(active)} onDecide={(d, o, id) => decide(active, d, o, id)} />
        : <ResolvedView key={active.key} row={active} busy={busy} onReopen={reason => decide(active, { action: 'clear', reason })} />}</>
      : <div className="id-case__empty"><span aria-hidden="true">{reallyClear ? '✓' : '·'}</span>
        <h3>{selectedGone ? 'El caso abierto ya no está en esta lista' : queue === 'resueltas' ? 'Registro de revisión' : reallyClear ? 'La bandeja está al día' : !loaded ? 'Cargando…' : filtered ? 'Sin coincidencias para estos filtros' : 'Sin casos en esta cola'}</h3>
        <p>{selectedGone ? 'Pudo resolverse en otra sesión o cambiar de cola. Elegí otro caso.' : reallyClear ? 'Podés seguir monitoreando las plantas.' : `Hay ${current.length + previous.length} casos pendientes en total.`}</p>
        {filtered ? <button type="button" onClick={() => patch({ search: '', point: '' })}>Limpiar filtros</button> : null}
        {queue === 'actual' && previous.length ? <button type="button" onClick={() => patch({ queue: 'anteriores', selected: null })}>Revisar {previous.length} pendientes anteriores</button> : null}</div>}</main></div>
    <footer className="id-footer">Cada decisión registra lectura, cámara, candidatos, motivo y versión para auditoría y futura calibración. El entrenamiento automático del modelo todavía no está conectado.</footer>
  </section>
}

/** EV-22: ver una decisión no la reabre; reabrir pide motivo. */
function ResolvedView({ row, busy, onReopen }: { row: Row; busy: boolean; onReopen: (reason: string) => Promise<void> }) {
  const [reopening, setReopening] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const d = row.item.decision
  return <div className="id-resolved">
    <strong>{row.item.readPlate} → {row.item.assignedPlate ?? 'Descartada'}</strong>
    <p>{row.item.level === 'casi_seguro' ? 'Aplicada automáticamente por el sistema.' : d?.updatedAt ? `Decidida ${stamp(d.updatedAt)}${d.reason ? ` · motivo: ${d.reason}` : ''}${d.sameAs ? ' · aplicada junto con otra lectura' : ''}.` : ''}</p>
    {row.item.candidates.length ? <p>Candidatos evaluados: {row.item.candidates.map(c => `${c.plate} (puntaje ${c.score})`).join(' · ')}</p> : null}
    <CapturePhoto deviceCode={row.item.deviceCode} at={row.item.at} readPlate={row.item.readPlate} />
    {!reopening ? <button disabled={busy} type="button" onClick={() => setReopening(true)}>Reabrir revisión…</button>
      : <form onSubmit={e => { e.preventDefault(); if (!reason.trim()) return; setError(''); onReopen(reason.trim()).catch(err => setError(err instanceof Error ? err.message : String(err))) }}>
        <input aria-label="Motivo de reapertura" placeholder="Motivo (obligatorio)" value={reason} onChange={e => setReason(e.target.value)} />
        <button type="submit" disabled={busy || !reason.trim()}>Reabrir: queda en revisión manual</button>
        <button type="button" disabled={busy} onClick={() => setReopening(false)}>Cancelar</button>
        {error ? <span role="alert">No se reabrió: {error}</span> : null}
      </form>}
  </div>
}
