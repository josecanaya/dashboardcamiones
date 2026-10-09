import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
export type AnalysisScope = {
  mode: 'live' | 'historical'
  site: 'ricardone' | 'san_lorenzo' | 'both'
  sector?: string | null; zone?: string | null; plate?: string | null; label?: string | null
  from?: string | null; to?: string | null; runIds?: string[]; metricId?: string | null
  circuit?: string | null; product?: string | null; fromPoint?: string | null; toPoint?: string | null
  franja?: string | null
  question?: string
  revisions?: Record<string,string>
}
const Context = createContext<{ scope: AnalysisScope; publish: (next: AnalysisScope) => void; ask: (scope:AnalysisScope, question:string) => void } | null>(null)
export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<AnalysisScope>({ mode: 'live', site: 'ricardone' })
  const publish = useCallback((next: AnalysisScope) => setScope(old => JSON.stringify(old) === JSON.stringify(next) ? old : next), [])
  const ask = useCallback((next:AnalysisScope, question:string) => { publish({ ...next, question }); window.dispatchEvent(new Event('truckflow:analysis-open')) }, [publish])
  const value = useMemo(() => ({ scope, publish, ask }), [scope, publish, ask])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useAnalysis() {
  const value = useContext(Context)
  if (!value) throw new Error('AnalysisProvider requerido')
  return value
}
export function usePublishAnalysis(scope: AnalysisScope, enabled = true) {
  const { publish } = useAnalysis()
  const serialized = JSON.stringify(scope)
  useEffect(() => { if (enabled) publish(JSON.parse(serialized) as AnalysisScope) }, [serialized, enabled, publish])
}
