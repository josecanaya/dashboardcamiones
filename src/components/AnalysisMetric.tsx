import { useEffect, useState } from 'react'
import { useAnalysis } from '../context/AnalysisContext'
type Metric = { value: number | null; n: number | null; unmapped?:number; evidenceId: string; definition: { label: string; unit: string; source:string; population:string }; coverage: string; rulesVersion: string[]; runIds: string[] }
/** Mismo endpoint y definición que get_metric del MCP. */
export function AnalysisMetric() {
  const { scope, ask } = useAnalysis()
  const [result, setResult] = useState<Metric | null>(null)
  const [error, setError] = useState('')
  const request = JSON.stringify({ ...scope, metricId: scope.metricId ?? (scope.mode === 'live' ? 'plant.trucks_present' : 'circuit.duration_median') })
  useEffect(() => {
    const controller = new AbortController()
    setResult(null); setError('')
    const refresh = () => fetch('/api/truckflow/analytics/metric', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request, signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body as Metric })
      .then(setResult).catch(e => { if (e.name !== 'AbortError') setError(e.message) })
    void refresh()
    const interval = JSON.parse(request).mode === 'live' ? setInterval(refresh, 30000) : null
    return () => { controller.abort(); if (interval) clearInterval(interval) }
  }, [request])
  return <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600" aria-live="polite">
    <strong>Métrica compartida · </strong>{error ? `Sin resultado: ${error}` : result ? <>
      {result.definition.label}: <strong>{result.value == null ? 'sin datos' : result.value.toLocaleString('es-AR', { maximumFractionDigits: 1 })} {result.definition.unit}</strong>
      {result.n != null ? ` · N=${result.n} ${result.definition.source === 'segment_timing_legs' ? 'observaciones del tramo' : 'operaciones'}` : ''} · {result.coverage === 'partial' ? 'Cobertura de corridas parcial' : result.coverage === 'live' ? 'En vivo' : 'Corridas cubren el período'}
      {result.unmapped ? ` · ${result.unmapped} observaciones sin fecha, excluidas` : ''}
      <details className="inline-block ml-2"><summary className="cursor-pointer">Fuente y evidencia</summary><div className="break-all p-2">{result.definition.population}<br />{result.runIds.join(', ') || 'Motor de planta'} · {result.rulesVersion.join(', ')}<br />{result.evidenceId}{scope.mode === 'historical' ? <a className="block underline" href={`/api/truckflow/analytics/evidence/${result.evidenceId}`} target="_blank" rel="noreferrer">Abrir evidencia del cálculo</a> : null}</div></details>
      <button type="button" className="ml-3 font-semibold text-emerald-800 underline" onClick={() => ask(scope, 'Explicá este KPI con el período y los filtros seleccionados. Citá su evidencia y aclarame los datos faltantes.')}>Analizar con NVAi</button>
    </> : 'Consultando fuente…'}
  </div>
}
