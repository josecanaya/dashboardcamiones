/** Cliente del endpoint de video en vivo DSS→go2rtc del server local (:8787). */
import { fetchLocalTruckflow } from '../../features/real-truckflow/api/truckflowLocalFetch'

export type LiveCameraStatus = {
  dssConfigured: boolean
  go2rtcOk: boolean
  go2rtcBase: string
}

export type LiveCameraStream = {
  deviceCode: string
  streamName: string
  playerUrl: string
}

export async function getLiveCameraStatus(): Promise<LiveCameraStatus> {
  const res = await fetchLocalTruckflow('/live-camera/status', { headers: { Accept: 'application/json' } })
  const body = (await res.json()) as Partial<LiveCameraStatus> & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return {
    dssConfigured: Boolean(body.dssConfigured),
    go2rtcOk: Boolean(body.go2rtcOk),
    go2rtcBase: body.go2rtcBase ?? '',
  }
}

export async function requestLiveCameraStream(deviceCode: string): Promise<LiveCameraStream> {
  const res = await fetchLocalTruckflow(`/live-camera/${encodeURIComponent(deviceCode)}/stream`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  })
  const body = (await res.json()) as Partial<LiveCameraStream> & { error?: string; suggestions?: string[] }
  if (!res.ok || !body.playerUrl) {
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return { deviceCode, streamName: body.streamName ?? deviceCode, playerUrl: body.playerUrl }
}
