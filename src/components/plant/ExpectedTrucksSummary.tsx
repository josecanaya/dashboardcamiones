import { useEffect, useState } from 'react'
import type { ExpectedTruck, ExpectedTrucks, TurnCompliance } from '../../services/live/plantStateApi'
import { getExpectedTrucks, getTurnCompliance } from '../../services/live/plantStateApi'
import './expectedTrucks.css'

const TZ = 'America/Argentina/Buenos_Aires'
const dayHhmm = (iso: string) => new Date(iso).toLocaleString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const SITE_NAME = { ricardone: 'Ricardone', san_lorenzo: 'San Lorenzo' } as const

function arrivedText(r: ExpectedTruck): string {
  if (r.status === 'en_planta') return `en planta${r.site ? ` · ${SITE_NAME[r.site]}` : ''}${r.sgc ? ` · ingresó ${hhmm(r.sgc.ingresoAt)}` : ''}`
  if (r.status === 'salio') return `ingresó ${r.sgc ? hhmm(r.sgc.ingresoAt) : '—'} · salió ${r.sgc?.salidaAt ? hhmm(r.sgc.salidaAt) : '—'}`
  if (r.status === 'arribo') return `arribo confirmado en ARCA ${r.stateSince ? dayHhmm(r.stateSince) : ''}`
  return `descargado según ARCA ${r.stateSince ? dayHhmm(r.stateSince) : ''}`
}

// Último resultado en memoria: reabrir el punto muestra el dato al instante y refresca detrás.
let lastExpected: ExpectedTrucks | null = null
let lastCompliance: TurnCompliance | null = null

/** Turno STOP de ayer contra lo que entró por balanza (SGC). */
function YesterdayCompliance({ c }: { c: TurnCompliance }) {
  const pct = c.turnos ? Math.round((c.cumplidos / c.turnos) * 100) : 0
  const [open, setOpen] = useState(false)
  return <section className="ex-yday">
    <h3>Ayer {c.day.split('-').reverse().slice(0, 2).join('/')}: ¿se cumplió el turno?</h3>
    <div className="ex-yday__bar" aria-hidden>
      <i className="is-ok" style={{ flex: c.counts.antes + c.counts.en_el_dia + c.counts.descargado_sin_sgc }} />
      <i className="is-late" style={{ flex: c.counts.tarde }} />
      <i className="is-miss" style={{ flex: c.counts.no_llego }} />
    </div>
    <p>
      <b>{pct} %</b> cumplido · {c.turnos} turnos: <span className="is-ok">{c.counts.antes + c.counts.en_el_dia + c.counts.descargado_sin_sgc} llegaron en el día</span>
      {' · '}<span className="is-late">{c.counts.tarde} llegaron hoy</span>{' · '}<span className="is-miss">{c.counts.no_llego} no llegaron</span>
      {c.rows.length ? <button type="button" onClick={() => setOpen(o => !o)}>{open ? 'Ocultar' : 'Ver quiénes'}</button> : null}
    </p>
    {open ? <ol className="ex-list ex-list--plain">{c.rows.map(r => <li key={r.ctg}>
      <strong>{r.plates[0]}</strong>
      <span>{r.grain ?? '—'} · {r.result === 'tarde' ? `llegó ${r.ingresoAt ? dayHhmm(`${r.ingresoAt}-03:00`) : ''}` : 'no llegó'}</span>
      <small>{r.turnCode ?? 'sin turno'} · CTG {r.ctg}</small>
    </li>)}</ol> : null}
  </section>
}

const QUARTERS = [['Q1', '22–04'], ['Q2', '04–10'], ['Q3', '10–16'], ['Q4', '16–22']] as const

/**
 * Esperados del día en el Nodo Sur según carta de porte + turno STOP: cuántos vienen, cuántos
 * llegaron (SGC / cámaras / ARCA), por producto y por cuarto de llegada, y quiénes faltan.
 */
export function ExpectedTrucksSummary({ onOpenTrip }: { onOpenTrip?: (truck: ExpectedTruck) => void }) {
  const [data, setData] = useState<ExpectedTrucks | null>(lastExpected)
  const [error, setError] = useState('')
  const [yesterday, setYesterday] = useState<TurnCompliance | null>(lastCompliance)
  useEffect(() => {
    let alive = true
    const load = () => getExpectedTrucks().then(r => { lastExpected = r; if (alive) { setData(r); setError('') } }).catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    void load()
    getTurnCompliance().then(r => { lastCompliance = r; if (alive) setYesterday(r) }).catch(() => undefined)
    const id = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  if (!data) return error ? <p className="ex-error">No se pudo cargar: {error}</p> : <p className="ex-muted">Cargando esperados…</p>
  const pending = data.rows.filter(r => r.status === 'en_camino')
  const arrived = data.rows.filter(r => r.status !== 'en_camino')
  const row = (r: ExpectedTruck, detail: string) => <li key={r.ctg}>
    <button type="button" disabled={!onOpenTrip} onClick={() => onOpenTrip?.(r)} title="Ver recorrido">
      <strong>{r.plates[0]}</strong>
      <span>{r.grain ?? '—'}{r.late ? <em> · turno de ayer</em> : null}</span>
      <small>{detail}</small>
    </button>
  </li>
  const maxQ = Math.max(1, ...Object.values(data.arrivedByQuarter))
  return (
    <div className="ex">
      <div className="ex-kpis">
        <div><span>Esperados hoy</span><b>{data.total}</b><small>turno STOP del {data.day.split('-').reverse().slice(0, 2).join('/')}</small></div>
        <div className="is-ok"><span>Ya llegaron</span><b>{data.arrived}</b><small>{data.total ? Math.round((data.arrived / data.total) * 100) : 0} %</small></div>
        <div className="is-pending"><span>Faltan</span><b>{data.pending}</b><small>en camino</small></div>
        <div><span>Turno de ayer</span><b>{data.lateFromYesterday}</b><small>todavía sin llegar ayer</small></div>
      </div>

      {yesterday ? <YesterdayCompliance c={yesterday} /> : null}

      <h3>Por producto</h3>
      <table className="ex-table">
        <thead><tr><th>Producto</th><th>Esperados</th><th>Llegaron</th><th>Faltan</th><th /></tr></thead>
        <tbody>{data.byProduct.map(p => <tr key={p.product}>
          <td>{p.product}</td><td>{p.esperados}</td><td>{p.llegaron}</td><td>{p.faltan}</td>
          <td className="ex-bar"><i style={{ width: `${(p.llegaron / p.esperados) * 100}%` }} /></td>
        </tr>)}</tbody>
      </table>

      <h3>Llegadas por cuarto</h3>
      <div className="ex-quarters">
        {QUARTERS.map(([q, label]) => <div key={q}>
          <i style={{ height: `${(data.arrivedByQuarter[q] / maxQ) * 100}%` }} />
          <b>{data.arrivedByQuarter[q]}</b>
          <span>{q} · {label}</span>
        </div>)}
      </div>

      {onOpenTrip ? <p className="ex-muted">Clic en una patente para ver su recorrido.</p> : null}
      <div className="ex-lists">
        <section>
          <h3>Faltan llegar ({pending.length})</h3>
          <ol className="ex-list">
            {pending.map(r => row(r, `partió ${r.departure ? dayHhmm(r.departure) : '—'}${r.distanceKm ? ` · ${r.distanceKm} km` : ''} · ${r.turnCode ?? 'sin turno'}`))}
            {!pending.length ? <li className="ex-muted">Ninguno.</li> : null}
          </ol>
        </section>
        <section>
          <h3>Ya llegaron ({arrived.length})</h3>
          <ol className="ex-list">
            {arrived.map(r => row(r, arrivedText(r)))}
            {!arrived.length ? <li className="ex-muted">Ninguno todavía.</li> : null}
          </ol>
        </section>
      </div>

      <p className="ex-foot">
        Fuente: cartas de porte ARCA a Vicentin (Nodo Sur) con turno STOP; «llegó» = ingreso en balanza SGC, cámaras o arribo confirmado en ARCA.
        Copia de cartas hasta {data.copy.newestDeparture ? dayHhmm(data.copy.newestDeparture) : '—'}: las cartas emitidas después no aparecen.
      </p>
    </div>
  )
}
