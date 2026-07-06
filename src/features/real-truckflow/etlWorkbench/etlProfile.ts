export type EtlProfilerSpan = {
  name: string
  durationMs: number
}

export type EtlProfiler = {
  enabled: boolean
  span: <T>(name: string, fn: () => T | Promise<T>) => Promise<T>
  mark: (name: string, durationMs: number) => void
  end: () => void
  getSpans: () => EtlProfilerSpan[]
  heapMbApprox: () => number | null
}

function readProfileEnv(): boolean {
  try {
    if (typeof process !== 'undefined' && process.env?.ETL_PROFILE === 'true') return true
  } catch {
    /* ignore */
  }
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env
    if (String(env?.VITE_ETL_PROFILE ?? '').toLowerCase() === 'true') return true
  } catch {
    /* ignore */
  }
  return false
}

export function isEtlProfileEnabled(): boolean {
  return readProfileEnv()
}

function heapMb(): number | null {
  try {
    if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
      return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10
    }
  } catch {
    /* ignore */
  }
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
    if (m?.usedJSHeapSize) return Math.round((m.usedJSHeapSize / 1024 / 1024) * 10) / 10
  }
  return null
}

export function createEtlProfiler(force?: boolean): EtlProfiler {
  const enabled = force === true || (force !== false && readProfileEnv())
  const spans: EtlProfilerSpan[] = []
  const startedAt = performance.now()
  let heapStart = heapMb()

  const noopProfiler: EtlProfiler = {
    enabled: false,
    async span<T>(_name: string, fn: () => T | Promise<T>): Promise<T> {
      return await fn()
    },
    mark() {},
    end() {},
    getSpans: () => [],
    heapMbApprox: () => null,
  }

  if (!enabled) return noopProfiler

  return {
    enabled: true,
    async span<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
      const t0 = performance.now()
      try {
        return await fn()
      } finally {
        spans.push({ name, durationMs: Math.round(performance.now() - t0) })
      }
    },
    mark(name: string, durationMs: number) {
      spans.push({ name, durationMs: Math.round(durationMs) })
    },
    end() {
      const totalMs = Math.round(performance.now() - startedAt)
      const heapEnd = heapMb()
      const lines: string[] = ['[ETL PROFILE]']
      const merged = new Map<string, number>()
      for (const s of spans) {
        merged.set(s.name, (merged.get(s.name) ?? 0) + s.durationMs)
      }
      for (const [name, ms] of merged) {
        lines.push(`${name}: ${(ms / 1000).toFixed(1)}s`)
      }
      lines.push(`total: ${(totalMs / 1000).toFixed(1)}s`)
      if (heapStart != null || heapEnd != null) {
        lines.push(
          `memoryHeapMb: ${heapStart ?? '?'} → ${heapEnd ?? '?'} (approx)`
        )
      }
      console.info(lines.join('\n'))
    },
    getSpans: () => [...spans],
    heapMbApprox: heapMb,
  }
}

/** Profiler compartido opcional para una corrida (p. ej. script Node). */
let globalProfiler: EtlProfiler | null = null

export function getGlobalEtlProfiler(): EtlProfiler {
  if (!globalProfiler) globalProfiler = createEtlProfiler()
  return globalProfiler
}

export function resetGlobalEtlProfiler(): EtlProfiler {
  globalProfiler = createEtlProfiler()
  return globalProfiler
}
