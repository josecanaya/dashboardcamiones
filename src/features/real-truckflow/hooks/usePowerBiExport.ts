import { useCallback, useEffect, useRef } from 'react'
import {
  buildCommitteePowerBiEtlExport,
  downloadPowerBiNamedCsvZipSync,
  POWER_BI_ETL_FILENAMES,
  triggerSinglePowerBiCsvDownload,
  type PowerBiNamedCsv,
} from '../../../services/powerBiEtlExport'
import { resolveRealTruckflowApiOrigin } from '../../../services/realTruckflowApi'
import type { RealTruckflowWorkspaceContextValue } from '../RealTruckflowWorkspaceContext'

export const POWER_BI_STANDARD_EXPORT_ROWS = [
  { filename: POWER_BI_ETL_FILENAMES.raw_events_api, label: 'Raw eventos API' },
  { filename: POWER_BI_ETL_FILENAMES.raw_alerts_api, label: 'Raw alertas API' },
  { filename: POWER_BI_ETL_FILENAMES.clean_events, label: 'Clean events' },
  { filename: POWER_BI_ETL_FILENAMES.clean_alerts, label: 'Clean alerts' },
  { filename: POWER_BI_ETL_FILENAMES.clean_circuits, label: 'Clean circuits' },
  { filename: POWER_BI_ETL_FILENAMES.camera_diagnostics, label: 'Camera diagnostics' },
  { filename: POWER_BI_ETL_FILENAMES.etl_summary, label: 'ETL summary' },
] as const

type WorkspacePick = Pick<
  RealTruckflowWorkspaceContextValue,
  'status' | 'loadedRange' | 'loadedAt' | 'rawEventsRicardone' | 'rawAlerts' | 'committee' | 'localFilesPowerBiMeta'
>

export function usePowerBiExport(ws: WorkspacePick) {
  const bundleRef = useRef<PowerBiNamedCsv[] | null>(null)

  const invalidate = useCallback(() => {
    bundleRef.current = null
  }, [])

  useEffect(() => {
    invalidate()
  }, [invalidate, ws.loadedAt, ws.status, ws.localFilesPowerBiMeta])

  const ensureBundle = useCallback((): PowerBiNamedCsv[] | null => {
    if (ws.status !== 'loaded' || !ws.loadedRange || !ws.committee) return null
    if (!bundleRef.current) {
      bundleRef.current = buildCommitteePowerBiEtlExport({
        apiBaseUrl: resolveRealTruckflowApiOrigin(),
        selectedStartDatetime: ws.loadedRange.startIso,
        selectedEndDatetime: ws.loadedRange.endIso,
        queryStart: ws.loadedRange.startIso,
        queryEnd: ws.loadedRange.endIso,
        exportedAtIso: new Date().toISOString(),
        lastLoadedAt: ws.loadedAt ?? '',
        eventsRawRicardone: ws.rawEventsRicardone,
        alertsRaw: ws.rawAlerts,
        committee: ws.committee,
        localFilesMeta: ws.localFilesPowerBiMeta ?? undefined,
      })
    }
    return bundleRef.current
  }, [ws.committee, ws.loadedAt, ws.loadedRange, ws.rawAlerts, ws.rawEventsRicardone, ws.status, ws.localFilesPowerBiMeta])

  const exportCsvByFilename = useCallback(
    (filename: string) => {
      const bundle = ensureBundle()
      const file = bundle?.find((a) => a.filename === filename)
      if (!file) return false
      triggerSinglePowerBiCsvDownload(file)
      return true
    },
    [ensureBundle]
  )

  const exportZip = useCallback(() => {
    const bundle = ensureBundle()
    if (!bundle?.length) return false
    downloadPowerBiNamedCsvZipSync(bundle, { variant: 'debug' })
    return true
  }, [ensureBundle])

  return {
    exportCsvByFilename,
    exportZip,
    canExport: ws.status === 'loaded' && Boolean(ws.committee && ws.loadedRange),
  }
}
