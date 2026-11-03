import { useEffect, useState } from 'react'
import { decideIdentification, getAlerts, getIdentifications,type IdentificationDecision, type LiveAlert } from '../../services/live/plantStateApi'
import { CapturePhoto } from './CapturePhoto'
import { IdentificationPanel } from './IdentificationPanel'
import './liveAlerts.css'

type Site = 'ricardone' | 'san_lorenzo'

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

/** Quién resolvió una alerta, en palabras. */
const BY: Record<string, string> = {
  operaciones: 'operaciones',
  ia_imagen: 'la IA por imagen',
  vinculo: 'el vínculo',
  carta_porte: 'la carta de porte',
  vehiculo_permitido: 'Vehículos Permitidos',
  corregida_antes: 'la base histórica',
  confirmada_antes: 'la base histórica',
  no_camion: 'la base de no camiones',
}

/** Tipos de vehículo que la cámara (atributos DSS) ve livianos, tal como los escribe el motivo del reconocedor. */
const LIVIANO = /\((?:liviano|auto|SUV|camioneta|utilitario|sed[aá]n|moto)\b/i

/**
 * Lectura dudosa: ninguna capa supo qué patente es (ilegible, o un candidato parecido de verdad).
 * Sin registro: la patente se leyó bien y no se parece a nada; el vehículo no figura en carta ni en
 * Vehículos Permitidos. Eso no es una falla de lectura (29/10: 3 de cada 4 alertas eran esto).
 */
export function alertKind(a: LiveAlert): 'dudosa' | 'sin_registro' | 'liviano' {
  const parecido = (a.candidatos ?? []).some(c => (c.similarity ?? 0) >= 0.5) || /\((?:[5-9]\d|100) ?%\)/.test(a.capas.algoritmo)
  if (!a.validFormat || (a.level !== 'fuera_sistema' && parecido)) return 'dudosa'
  return LIVIANO.test(a.capas.motivo ?? '') ? 'liviano' : 'sin_registro'
}

/** Motivos de «no es un camión»: el texto es el que lee el aprendizaje (kindOf en aprendizaje.mjs). */
const NO_CAMION = ['Auto particular / camioneta', 'Tractor o maquinaria', 'Vehículo de servicio', 'Colectivo']

/**
 * Resolver la alerta desde la tarjeta: la patente correcta (un candidato, la leída o escrita a mano) o
 * qué es si no es un camión. Es la misma decisión de operaciones que la bandeja de revisión, así que
 * enseña: la corrección va a data/padron/corregidos.json y el «no es camión» a no-camiones.json.
 */
function AlertResolve({ alert, onDone }: { alert: LiveAlert; onDone: (plate: string | null) => void }) {
  const [plate, setPlate] = useState('')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const typed = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

  async function send(decision: IdentificationDecision) {
    setBusy(true)
    setError(null)
    try {
      await decideIdentification(alert.site, alert.fragmentKey, decision)
      onDone(decision.action === 'confirm' ? decision.plate : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const confirm = (p: string) => send({ action: 'confirm', plate: p, reason: p === alert.readPlate ? 'alerta: la cámara leyó bien' : `alerta: corregida a ${p}` })
  const reject = (reason: string) => send({ action: 'reject', reason })

  return (
    <div className="la-fix">
      <div className="la-fix-row">
        <span className="la-fix-label">Es</span>
        {/* Un candidato al 10–40 % no es esta patente: solo se ofrecen los que se parecen de verdad. */}
        {(alert.candidatos ?? []).filter(c => (c.similarity ?? 0) >= 0.5).map(c => <button key={c.plate} type="button" disabled={busy} onClick={() => confirm(c.plate)}>{c.plate}{c.similarity != null ? <small> {Math.round(c.similarity * 100)} %</small> : null}</button>)}
        {alert.validFormat ? <button type="button" disabled={busy} onClick={() => confirm(alert.readPlate)}>{alert.readPlate} <small>leyó bien</small></button> : null}
        <form onSubmit={e => { e.preventDefault(); if (typed.length >= 6) void confirm(typed) }}>
          <input value={plate} onChange={e => setPlate(e.target.value)} placeholder="Otra patente" className="la-fix-plate" aria-label="Patente correcta" maxLength={9} disabled={busy} />
          <button type="submit" disabled={busy || typed.length < 6}>Confirmar</button>
        </form>
      </div>
      <div className="la-fix-row">
        <span className="la-fix-label">No es camión</span>
        {NO_CAMION.map(r => <button key={r} type="button" disabled={busy} onClick={() => reject(r)}>{r}</button>)}
        <form onSubmit={e => { e.preventDefault(); if (other.trim()) void reject(other.trim()) }}>
          <input value={other} onChange={e => setOther(e.target.value)} placeholder="Otro motivo (aclaración)" aria-label="Otro motivo" maxLength={300} disabled={busy} />
          <button type="submit" disabled={busy || !other.trim()}>Descartar</button>
        </form>
      </div>
      {error ? <p className="la-error">No se guardó: {error}</p> : null}
    </div>
  )
}

/**
 * Alertas: cada captura que atravesó las capas (2: carta de porte / Vehículos Permitidos; 3: algoritmo,
 * base histórica e IA por imagen) sin que ninguna la identifique. Quedan guardadas por día; las que después
 * se resuelven siguen en la lista como resueltas. La bandeja de revisión es donde operaciones las cierra.
 */
export function LiveAlertsPanel({ site }: { site: Site }) {
  const [day, setDay] = useState(today)
  const [data, setData] = useState<{ open: number; resolved: number; alertas: LiveAlert[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<'dudosas' | 'sin_registro' | 'resueltas' | 'bandeja'>('dudosas')

  useEffect(() => {
    let alive = true
    setData(null)
    // Las alertas guardadas antes del 29/10 no traen candidatos: se completan con los del reconocedor.
    const load = () => Promise.all([getAlerts(site, day), getIdentifications(site).catch(() => null)]).then(([r, ids]) => {
      if (!alive) return
      const byKey = new Map((ids?.items ?? []).map(it => [it.fragmentKey, it.candidates]))
      setData({ ...r, alertas: r.alertas.map(a => (a.candidatos?.length || !byKey.get(a.fragmentKey)?.length ? a : { ...a, candidatos: byKey.get(a.fragmentKey)!.slice(0, 4).map(c => ({ plate: c.plate, similarity: c.similarity ?? null })) })) })
      setError(null)
    }).catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    void load()
    const t = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [site, day])

  /** Resuelta desde acá: queda como resuelta por operaciones sin esperar la próxima pasada del reconocedor. */
  const markResolved = (a: LiveAlert, plate: string | null) => setData(d => d && {
    ...d,
    alertas: d.alertas.map(x => (x.fragmentKey === a.fragmentKey ? { ...x, resolved: { at: new Date().toISOString(), by: 'operaciones', plate, level: plate ? 'confirmado' : 'rechazado' } } : x)),
  })

  const alertas = data?.alertas ?? []
  const open = alertas.filter(a => !a.resolved)
  const dudosas = open.filter(a => alertKind(a) === 'dudosa')
  const sinRegistro = open.filter(a => alertKind(a) !== 'dudosa')
  const camiones = sinRegistro.filter(a => alertKind(a) === 'sin_registro')
  const livianos = sinRegistro.filter(a => alertKind(a) === 'liviano')
  const resueltas = alertas.filter(a => a.resolved)

  const card = (a: LiveAlert, full: boolean) => <li key={a.fragmentKey} className={a.resolved ? 'is-resolved' : ''}>
    <div className="la-head">
      <strong>{a.readPlate}</strong>
      <span>{a.nodeLabel} · {hora(a.at)} · <span title="Cámara">{a.deviceCode}</span></span>
      {a.resolved ? <em className="la-ok">Resuelta por {BY[a.resolved.by] ?? a.resolved.by}{a.resolved.plate ? ` → ${a.resolved.plate}` : ''}</em> : full ? <em className="la-bad">Alerta</em> : null}
    </div>
    {full ? <dl className="la-layers">
      <div><dt>Capa 2 · ¿Quién es?</dt><dd>{a.capas.capa2}</dd></div>
      <div><dt>Capa 3 · Algoritmo</dt><dd>{a.capas.algoritmo}</dd></div>
      <div><dt>Capa 3 · Base histórica</dt><dd>{a.capas.historica}</dd></div>
      <div><dt>Capa 3 · IA por imagen</dt><dd>{a.capas.ia}</dd></div>
    </dl> : <p className="la-why">{a.capas.motivo ?? a.capas.capa2}</p>}
    <CapturePhoto deviceCode={a.deviceCode} at={a.at} readPlate={a.readPlate} buttonClassName="la-photo" />
    {a.resolved ? null : <AlertResolve alert={a} onDone={plate => markResolved(a, plate)} />}
  </li>
  const empty = (text: string) => (data ? <li className="la-empty">{text}</li> : !error ? <li className="la-empty">Cargando alertas…</li> : null)

  return (
    <section className="la">
      <header className="la-top">
        <div className="la-counts">
          <button type="button" aria-pressed={show === 'dudosas'} onClick={() => setShow('dudosas')}><b>{data ? dudosas.length : '—'}</b> lectura dudosa</button>
          <button type="button" aria-pressed={show === 'sin_registro'} onClick={() => setShow('sin_registro')}><b>{data ? sinRegistro.length : '—'}</b> sin registro</button>
          <button type="button" aria-pressed={show === 'resueltas'} onClick={() => setShow('resueltas')}><b>{data ? resueltas.length : '—'}</b> resueltas después</button>
          <button type="button" aria-pressed={show === 'bandeja'} onClick={() => setShow('bandeja')}>Bandeja de revisión</button>
        </div>
        <label className="la-day">Día <input type="date" value={day} max={today()} onChange={e => e.target.value && setDay(e.target.value)} /></label>
      </header>
      <p className="la-note">{show === 'sin_registro'
        ? 'La cámara leyó bien la patente, pero el vehículo no está en una carta de porte ni en Vehículos Permitidos. No es una falla de lectura: marcá qué es (particular, servicio…) y deja de aparecer.'
        : 'Lectura dudosa: ninguna capa pudo decir qué patente es (ilegible, o parecida a un camión en planta sin alcanzar para decidir). Elegí la correcta y la base histórica la aprende.'}</p>
      {error ? <p className="la-error">No se pudieron leer las alertas ({error}).</p> : null}

      {show === 'bandeja' ? <div className="la-desk"><IdentificationPanel sites={[site]} /></div> : (
        <ol className="la-list">
          {show === 'dudosas' ? <>{dudosas.map(a => card(a, true))}{!dudosas.length ? empty('Sin lecturas dudosas.') : null}</> : null}
          {show === 'resueltas' ? <>{resueltas.map(a => card(a, true))}{!resueltas.length ? empty('Ninguna alerta se resolvió después.') : null}</> : null}
          {show === 'sin_registro' ? <>
            <li className="la-group">Camiones y vehículos sin tipo · {camiones.length}</li>
            {camiones.map(a => card(a, false))}
            <li className="la-group">Autos y camionetas (la cámara los ve livianos) · {livianos.length}</li>
            {livianos.map(a => card(a, false))}
            {!sinRegistro.length ? empty('Ningún vehículo sin registro.') : null}
          </> : null}
        </ol>
      )}
    </section>
  )
}
