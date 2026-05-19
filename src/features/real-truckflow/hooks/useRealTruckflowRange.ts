import { useRealTruckflowWorkspace } from '../RealTruckflowWorkspaceContext'

/** Acceso tipado solo al selector de rango + metadatos de carga (sin dataset). */
export function useRealTruckflowRange() {
  const ws = useRealTruckflowWorkspace()
  return {
    status: ws.status,
    error: ws.error,
    rangeStartDate: ws.rangeStartDate,
    rangeStartTime: ws.rangeStartTime,
    rangeEndDate: ws.rangeEndDate,
    rangeEndTime: ws.rangeEndTime,
    setRangeStartDate: ws.setRangeStartDate,
    setRangeStartTime: ws.setRangeStartTime,
    setRangeEndDate: ws.setRangeEndDate,
    setRangeEndTime: ws.setRangeEndTime,
    loadedRange: ws.loadedRange,
    loadedAt: ws.loadedAt,
    loadPeriod: ws.loadPeriod,
    clearData: ws.clearData,
  }
}
