import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { IfcSelectedTruckInfo } from '../components/IfcViewer'
import type { SiteId } from '../domain/sites'
import type { CameraEventRaw, HistoricalTrip, IfcCameraCatalogItem, OperationalAlert, TruckInPlant } from '../domain/logistics'
import { useSite } from './SiteContext'
import { CAMERA_CATALOG_BY_SITE } from '../data/cameraCatalog'
import { loadLogisticsSnapshot, setLogisticsScenario, getLogisticsScenario, type RawCameraEventDebug } from '../services/logisticsDataSource'

interface LogisticsOpsContextValue {
  rawCameraEvents: RawCameraEventDebug[]
  enrichedCameraEvents: CameraEventRaw[]
  cameraEvents: CameraEventRaw[]
  trucksInPlant: TruckInPlant[]
  historicalTrips: HistoricalTrip[]
  operationalAlerts: OperationalAlert[]
  cameraCatalog: IfcCameraCatalogItem[]
  sourceMeta: { basePath: string; scenario: string; loadedAt: string; simulatedGeneratedAt?: string; historicoSource?: string } | null
  isLoading: boolean
  scenario: string
  setScenario: (scenario: string) => void
  refreshFromSource: (showLoader?: boolean) => Promise<void>
  ingestFleetSnapshot: (fleet: IfcSelectedTruckInfo[], siteId: SiteId) => void
  setAlertStatus: (alertId: string, status: OperationalAlert['status']) => void
}

const LogisticsOpsContext = createContext<LogisticsOpsContextValue | null>(null)

function LogisticsOpsProviderInner({ children }: { children: ReactNode }) {
  const { siteId } = useSite()
  const [rawCameraEvents, setRawCameraEvents] = useState<RawCameraEventDebug[]>([])
  const [enrichedCameraEvents, setEnrichedCameraEvents] = useState<CameraEventRaw[]>([])
  const [cameraEvents, setCameraEvents] = useState<CameraEventRaw[]>([])
  const [trucksInPlant, setTrucksInPlant] = useState<TruckInPlant[]>([])
  const [historicalTrips, setHistoricalTrips] = useState<HistoricalTrip[]>([])
  const [operationalAlerts, setOperationalAlerts] = useState<OperationalAlert[]>([])
  const [cameraCatalog, setCameraCatalog] = useState<IfcCameraCatalogItem[]>(CAMERA_CATALOG_BY_SITE.ricardone)
  const [sourceMeta, setSourceMeta] = useState<{ basePath: string; scenario: string; loadedAt: string; simulatedGeneratedAt?: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshFromSource = useCallback(async (showLoader = false) => {
    const start = showLoader ? Date.now() : 0
    try {
      if (showLoader) setIsLoading(true)
      // Cargar TODOS los datos (sin filtrar por planta) para que Home muestre las 3 plantas
      const snapshot = await loadLogisticsSnapshot()
      setRawCameraEvents(snapshot.rawCameraEvents)
      setEnrichedCameraEvents(snapshot.enrichedCameraEvents)
      setCameraEvents(snapshot.enrichedCameraEvents)
      setTrucksInPlant(snapshot.trucksInPlant)
      setHistoricalTrips(snapshot.historicalTrips)
      setOperationalAlerts(snapshot.operationalAlerts)
      setCameraCatalog(CAMERA_CATALOG_BY_SITE[siteId])
      setSourceMeta(snapshot.meta)
    } catch {
      // Si falla la fuente externa, mantenemos el estado actual.
    } finally {
      if (showLoader) {
        const elapsed = Date.now() - start
        const minDisplay = 1500
        if (elapsed < minDisplay) {
          await new Promise((r) => setTimeout(r, minDisplay - elapsed))
        }
        setIsLoading(false)
      }
    }
  }, [siteId])

  let scenarioFromStorage: string | null = null
  try {
    scenarioFromStorage = typeof window !== 'undefined' ? localStorage.getItem('logistics.mock.scenario') : null
  } catch {
    scenarioFromStorage = null
  }
  const [pollInterval, setPollInterval] = useState(scenarioFromStorage === 'live' ? 3000 : 15000)

  useEffect(() => {
    void refreshFromSource(true)
  }, [refreshFromSource])

  useEffect(() => {
    const interval = sourceMeta?.scenario === 'live' ? 3000 : 15000
    setPollInterval(interval)
  }, [sourceMeta?.scenario])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshFromSource(false)
    }, pollInterval)
    return () => window.clearInterval(timer)
  }, [refreshFromSource, pollInterval])

  const ingestFleetSnapshot = useCallback(
    (_fleet: IfcSelectedTruckInfo[], _siteId: SiteId) => {
      // No-op: la fuente de verdad la provee el simulador externo via JSON.
    },
    []
  )

  const [selectedScenario, setSelectedScenario] = useState(() => getLogisticsScenario())

  const setScenario = useCallback((scenario: string) => {
    setLogisticsScenario(scenario)
    setSelectedScenario(scenario)
    void refreshFromSource(true)
  }, [refreshFromSource])

  const setAlertStatus = useCallback((alertId: string, status: OperationalAlert['status']) => {
    setOperationalAlerts((prev) =>
      prev.map((alert) =>
        alert.alertId === alertId
          ? { ...alert, status, updatedAt: new Date().toISOString() }
          : alert
      )
    )
  }, [])

  const scenario = selectedScenario

  const value = useMemo(
    () => ({
      rawCameraEvents,
      enrichedCameraEvents,
      cameraEvents,
      trucksInPlant,
      historicalTrips,
      operationalAlerts,
      cameraCatalog,
      sourceMeta,
      isLoading,
      scenario,
      setScenario,
      refreshFromSource,
      ingestFleetSnapshot,
      setAlertStatus,
    }),
    [
      rawCameraEvents,
      enrichedCameraEvents,
      cameraEvents,
      trucksInPlant,
      historicalTrips,
      operationalAlerts,
      cameraCatalog,
      sourceMeta,
      isLoading,
      scenario,
      setScenario,
      refreshFromSource,
      ingestFleetSnapshot,
      setAlertStatus,
    ]
  )

  return <LogisticsOpsContext.Provider value={value}>{children}</LogisticsOpsContext.Provider>
}

export function LogisticsOpsProvider({ children }: { children: ReactNode }) {
  return <LogisticsOpsProviderInner>{children}</LogisticsOpsProviderInner>
}

export function useLogisticsOps() {
  const ctx = useContext(LogisticsOpsContext)
  if (!ctx) throw new Error('useLogisticsOps must be used within LogisticsOpsProvider')
  return ctx
}
