import { createContext, useContext, useState, type ReactNode } from 'react'
import type { ReconstructedVisit } from '../domain/events'

interface SimulatorVisitContextValue {
  visitToSimulate: ReconstructedVisit | null
  setVisitToSimulate: (v: ReconstructedVisit | null) => void
}

const SimulatorVisitContext = createContext<SimulatorVisitContextValue | null>(null)

export function SimulatorVisitProvider({ children }: { children: ReactNode }) {
  const [visitToSimulate, setVisitToSimulate] = useState<ReconstructedVisit | null>(null)
  return (
    <SimulatorVisitContext.Provider value={{ visitToSimulate, setVisitToSimulate }}>
      {children}
    </SimulatorVisitContext.Provider>
  )
}

export function useSimulatorVisit() {
  const ctx = useContext(SimulatorVisitContext)
  if (!ctx) throw new Error('useSimulatorVisit must be used within SimulatorVisitProvider')
  return ctx
}
