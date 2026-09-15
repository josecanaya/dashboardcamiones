import { useEffect, useState } from 'react'
import {
  getPlantState,
  openPlantStateStream,
  type PlantSnapshot,
} from '../services/live/plantStateApi'

const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000] as const
const AFTER_BACKOFF_MS = 30_000
const STALE_AFTER_MS = 60_000

export function useLivePlantState(site: string): {
  snapshot: PlantSnapshot | null
  status: 'connecting' | 'live' | 'stale' | 'error'
  lastUpdateMs: number | null
} {
  const [snapshot, setSnapshot] = useState<PlantSnapshot | null>(null)
  const [status, setStatus] = useState<'connecting' | 'live' | 'stale' | 'error'>('connecting')
  const [lastUpdateMs, setLastUpdateMs] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    let closeStream: (() => void) | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let staleTimer: ReturnType<typeof setInterval> | null = null
    let attempt = 0
    let lastMs: number | null = null
    let hasSnapshot = false

    const applySnapshot = (snap: PlantSnapshot) => {
      if (cancelled) return
      hasSnapshot = true
      setSnapshot(snap)
      const now = Date.now()
      lastMs = now
      setLastUpdateMs(now)
      setStatus('live')
      attempt = 0
    }

    const scheduleReconnect = () => {
      if (cancelled) return
      const delay = attempt < BACKOFF_MS.length ? BACKOFF_MS[attempt] : AFTER_BACKOFF_MS
      attempt += 1
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connectStream()
      }, delay)
    }

    const connectStream = () => {
      if (cancelled) return
      closeStream?.()
      closeStream = null
      const handle = openPlantStateStream(site, applySnapshot)
      closeStream = handle.close
      handle.es.onerror = () => {
        if (cancelled) return
        handle.close()
        closeStream = null
        setStatus(hasSnapshot ? 'stale' : 'error')
        scheduleReconnect()
      }
    }

    staleTimer = setInterval(() => {
      if (cancelled || lastMs == null) return
      if (Date.now() - lastMs > STALE_AFTER_MS) {
        setStatus((prev) => (prev === 'error' ? prev : 'stale'))
      }
    }, 5_000)

    ;(async () => {
      try {
        const snap = await getPlantState(site)
        applySnapshot(snap)
      } catch {
        if (!cancelled) setStatus(hasSnapshot ? 'stale' : 'error')
      }
      if (!cancelled) connectStream()
    })()

    return () => {
      cancelled = true
      closeStream?.()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (staleTimer) clearInterval(staleTimer)
    }
  }, [site])

  return { snapshot, status, lastUpdateMs }
}
