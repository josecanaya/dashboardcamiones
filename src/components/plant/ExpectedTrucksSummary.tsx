import { useEffect, useState } from 'react'
import type { ExpectedTrucks } from '../../services/live/plantStateApi'
import { getExpectedTrucks } from '../../services/live/plantStateApi'
import './expectedTrucks.css'

const TZ = 'America/Argentina/Buenos_Aires'
const dayHhmm = (iso: string) => new Date(iso).toLocaleString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
const QUARTERS = [['Q1', '22–04'], ['Q2', '04–10'], ['Q3', '10–16'], ['Q4', '16–22']] as const

/**
 * Esperados del día en el Nodo Sur según carta de porte + turno STOP: cuántos vienen, cuántos
 * llegaron (SGC / cámaras / ARCA), por producto y por cuarto de llegada, y quiénes faltan.
 */
export function ExpectedTrucksSummary() {
  const [data, setData] = useState<ExpectedTrucks | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    const load = () => getExpectedTrucks().then(r => { if (alive) { setData(r); setError('') } }).catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    void load()
    const id = setInterval(load, 120_000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  if (!data) return error ? <p className="ex-error">No se pudo cargar: {error}</p> : <p className="ex-muted">Cargando esperados…</p>
  const pending = data.rows.filter(r => r.status === 'en_camino')
  const maxQ = Math.max(1, ...Object.values(data.arrivedByQuarter))
  return (
    <div className="ex">
      <div className="ex-kpis">
        <div><span>Esperados hoy</span><b>{data.total}</b><small>turno STOP del {data.day.split('-').reverse().slice(0, 2).join('/')}</small></div>
        <div className="is-ok"><span>Ya llegaron</span><b>{data.arrived}</b><small>{data.total ? Math.round((data.arrived / data.total) * 100) : 0} %</small></div>
        <div className="is-pending"><span>Faltan</span><b>{data.pending}</b><small>en camino</small></div>
        <div><span>Turno de ayer</span><b>{data.lateFromYesterday}</b><small>todavía sin llegar ayer</small></div>
      </div>

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

      <h3>Faltan llegar ({pending.length})</h3>
      <ol className="ex-list">
        {pending.map(r => <li key={r.ctg}>
          <strong>{r.plates[0]}</strong>
          <span>{r.grain ?? '—'}{r.late ? <em> · turno de ayer</em> : null}</span>
          <small>partió {r.departure ? dayHhmm(r.departure) : '—'}{r.distanceKm ? ` · ${r.distanceKm} km` : ''} · {r.turnCode ?? 'sin turno'}</small>
        </li>)}
        {!pending.length ? <li className="ex-muted">Ninguno.</li> : null}
      </ol>

      <p className="ex-foot">
        Fuente: cartas de porte ARCA a Vicentin (Nodo Sur) con turno STOP; «llegó» = ingreso en balanza SGC, cámaras o arribo confirmado en ARCA.
        Copia de cartas hasta {data.copy.newestDeparture ? dayHhmm(data.copy.newestDeparture) : '—'}: las cartas emitidas después no aparecen.
      </p>
    </div>
  )
}
