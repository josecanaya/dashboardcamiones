import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PlantIfcEditor } from '../components/plant/PlantIfcEditor'
import { downloadCameraDay, getCoverage, runWeek, type Coverage, type SavedWindow } from '../services/datos/corridasApi'
// El editor del plano usa los botones ui-* del dashboard (tokens bajo .tf-ui).
import '../components/ui/ui.css'

/**
 * Datos: la corrida semanal que leen los agentes y los decks (runs/windows/<lunes>_<domingo>)
 * y el editor del plano sobre el modelo IFC. Una semana = una corrida; no se crean ventanas a medida.
 */
export function DatosPage() {
  const [params, setParams] = useSearchParams()
  const vista = params.get('vista') === 'plano' ? 'plano' : 'corridas'
  return (
    <section className="tf-ui space-y-4 pb-4">
      <div className="flex gap-2" role="tablist">
        {(['corridas', 'plano'] as const).map(v => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={vista === v}
            onClick={() => setParams(v === 'plano' ? { vista: 'plano' } : {})}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${vista === v ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}
          >
            {v === 'corridas' ? 'Corridas semanales' : 'Editar plano'}
          </button>
        ))}
      </div>
      {vista === 'plano' ? <PlantIfcEditor /> : <Corridas />}
    </section>
  )
}

const TZ = 'America/Argentina/Buenos_Aires'
const WEEKS_SHOWN = 10
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ })
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7))
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

type Progress = { week: string; text: string } | null

function Corridas() {
  const [cov, setCov] = useState<Coverage | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<Progress>(null)
  const [redownload, setRedownload] = useState(false)
  const [done, setDone] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    getCoverage().then(c => { setCov(c); setError('') }).catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(load, [load])

  const process = async (from: string, to: string) => {
    if (!cov) return
    const hoy = today()
    const days = Array.from({ length: 7 }, (_, i) => addDays(from, i)).filter(d => d <= hoy)
    const toDownload = days.filter(d => redownload || d === hoy || !cov.cameraDays.has(d))
    try {
      for (const [i, d] of toDownload.entries()) {
        setProgress({ week: from, text: `Bajando cámaras ${dm(d)} (${i + 1}/${toDownload.length})…` })
        const r = await downloadCameraDay(d)
        if (r.status && r.status !== 'ok') throw new Error(`cámaras ${d}: ${r.error || r.status}`)
      }
      setProgress({ week: from, text: 'Procesando la semana…' })
      const { runId } = await runWeek(from, to)
      setDone(x => ({ ...x, [from]: `Corrida ${runId} lista` }))
    } catch (e) {
      setDone(x => ({ ...x, [from]: `Falló: ${e instanceof Error ? e.message : String(e)}` }))
    } finally {
      setProgress(null)
      load()
    }
  }

  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">No se pudo leer el estado de las corridas: {error}</p>
  if (!cov) return <p className="text-sm text-slate-500">Cargando corridas…</p>

  const hoy = today()
  const byFrom = new Map<string, SavedWindow>(cov.windows.map(w => [`${w.from}_${w.to}`, w]))
  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, i) => addDays(mondayOf(hoy), -7 * i))

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Corridas semanales</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Lunes a domingo. De acá leen los agentes y los decks del comité. Reglas vigentes: <code className="font-mono">{cov.currentRulesVersion}</code>.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
          <input type="checkbox" checked={redownload} onChange={e => setRedownload(e.target.checked)} disabled={Boolean(progress)} />
          Volver a bajar las cámaras de días ya guardados
        </label>
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11.5px] uppercase tracking-wide text-slate-500">
            <th className="py-1.5">Semana</th>
            <th>Cámaras · movimientos por día</th>
            <th>Corrida</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {weeks.map(from => {
            const to = addDays(from, 6)
            const w = byFrom.get(`${from}_${to}`)
            const busy = progress?.week === from
            const state = !w ? { label: 'Sin corrida', cls: 'text-slate-500' }
              : w.stale ? { label: 'Desactualizada', cls: 'text-amber-700' }
              : { label: 'Al día', cls: 'text-emerald-700' }
            return (
              <tr key={from} className="border-t border-slate-100 align-middle">
                <td className="py-2 font-semibold text-slate-800">{dm(from)} → {dm(to)}</td>
                <td>
                  <div className="flex gap-1">
                    {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d, i) => {
                      const future = d > hoy
                      const cam = cov.cameraDays.has(d)
                      const mov = cov.movimientosRows.get(d) ?? 0
                      return (
                        <span
                          key={d}
                          title={future ? `${d}: todavía no` : `${d}: cámaras ${cam ? 'sí' : 'no'} · ${mov} movimientos`}
                          className={`grid h-7 w-7 place-items-center rounded text-[11px] font-semibold ${future ? 'bg-slate-50 text-slate-300' : cam && mov ? 'bg-emerald-100 text-emerald-800' : cam || mov ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'}`}
                        >
                          {WEEKDAYS[i]}
                        </span>
                      )
                    })}
                  </div>
                </td>
                <td>
                  <span className={`font-semibold ${state.cls}`}>{state.label}</span>
                  {w?.createdAt ? <span className="ml-2 text-[12px] text-slate-400">{new Date(w.createdAt).toLocaleString('es-AR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })}</span> : null}
                  {busy ? <div className="text-[12px] text-slate-600">{progress?.text}</div> : done[from] ? <div className="text-[12px] text-slate-600">{done[from]}</div> : null}
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    disabled={Boolean(progress) || from > hoy}
                    onClick={() => void process(from, to)}
                    className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1 text-[12.5px] font-semibold text-white disabled:opacity-40"
                  >
                    {w ? 'Reprocesar' : 'Procesar'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] text-slate-500">
        Verde: hay cámaras y movimientos. Amarillo: falta uno de los dos. Rojo: no hay nada. Procesar baja las cámaras que falten (y siempre las de hoy) y vuelve a correr la semana.
      </p>
    </div>
  )
}
