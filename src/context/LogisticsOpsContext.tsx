import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { IfcSelectedTruckInfo } from '../components/IfcViewer'
import type { SiteId } from '../domain/sites'
import type { CameraEventRaw, HistoricalTrip, IfcCameraCatalogItem, OperationalAlert, TruckInPlant } from '../domain/logistics'
import { CAMERA_CATALOG_BY_SITE } from '../data/cameraCatalog'
import {
  buildCameraEventsFromFleet,
  buildOperationalAlerts,
  projectTrucksInPlantFromFleet,
  rollCurrentToHistory,
} from '../engine/logisticsPipeline'

interface LogisticsOpsContextValue {
  cameraEvents: CameraEventRaw[]
  trucksInPlant: TruckInPlant[]
  historicalTrips: HistoricalTrip[]
  operationalAlerts: OperationalAlert[]
  cameraCatalog: IfcCameraCatalogItem[]
  ingestFleetSnapshot: (fleet: IfcSelectedTruckInfo[], siteId: SiteId) => void
  setAlertStatus: (alertId: string, status: OperationalAlert['status']) => void
}

const LogisticsOpsContext = createContext<LogisticsOpsContextValue | null>(null)

export function LogisticsOpsProvider({ children }: { children: ReactNode }) {
  const [cameraEvents, setCameraEvents] = useState<CameraEventRaw[]>([])
  const [trucksInPlant, setTrucksInPlant] = useState<TruckInPlant[]>([])
  const [historicalTrips, setHistoricalTrips] = useState<HistoricalTrip[]>([])
  const [operationalAlerts, setOperationalAlerts] = useState<OperationalAlert[]>([])
  const [cameraCatalog, setCameraCatalog] = useState<IfcCameraCatalogItem[]>(CAMERA_CATALOG_BY_SITE.ricardone)

  const ingestFleetSnapshot = useCallback(
    (fleet: IfcSelectedTruckInfo[], siteId: SiteId) => {
      const eventsEnvelope = buildCameraEventsFromFleet(fleet, siteId)
      const currentEnvelope = projectTrucksInPlantFromFleet(fleet, eventsEnvelope.data, siteId)
      const historyEnvelope = rollCurrentToHistory(historicalTrips, currentEnvelope.data, siteId)
      const alertsEnvelope = buildOperationalAlerts(currentEnvelope.data, historyEnvelope.data, siteId)

      setCameraEvents(eventsEnvelope.data)
      setTrucksInPlant(currentEnvelope.data)
      setHistoricalTrips(historyEnvelope.data)
      setOperationalAlerts(alertsEnvelope.data)
      setCameraCatalog(CAMERA_CATALOG_BY_SITE[siteId])
    },
    [historicalTrips]
  )

  const setAlertStatus = useCallback((alertId: string, status: OperationalAlert['status']) => {
    setOperationalAlerts((prev) =>
      prev.map((alert) =>
        alert.alertId === alertId
          ? { ...alert, status, updatedAt: new Date().toISOString() }
          : alert
      )
    )
  }, [])

  const value = useMemo(
    () => ({
      cameraEvents,
      trucksInPlant,
      historicalTrips,
      operationalAlerts,
      cameraCatalog,
      ingestFleetSnapshot,
      setAlertStatus,
    }),
    [cameraEvents, trucksInPlant, historicalTrips, operationalAlerts, cameraCatalog, ingestFleetSnapshot, setAlertStatus]
  )

  return <LogisticsOpsContext.Provider value={value}>{children}</LogisticsOpsContext.Provider>
}

export function useLogisticsOps() {
  const ctx = useContext(LogisticsOpsContext)
  if (!ctx) throw new Error('useLogisticsOps must be used within LogisticsOpsProvider')
  return ctx
}
