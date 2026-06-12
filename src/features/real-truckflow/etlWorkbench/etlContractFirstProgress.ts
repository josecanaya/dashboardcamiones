export const CONTRACT_FIRST_SLOW_STEP_MS = 30_000
export const CONTRACT_FIRST_LONG_RUN_WARN_MS = 3 * 60_000

export type ContractFirstProgressEvent = {
  step: string
  label: string
  current: number
  total: number
  elapsedMs: number
  details?: Record<string, unknown>
}

export type ContractFirstProgressCallback = (event: ContractFirstProgressEvent) => void

export type ContractFirstStageTiming = {
  step: string
  label: string
  durationMs: number
  details?: Record<string, unknown>
}

export function countUniqueNormalizedPlates(values: string[]): number {
  const s = new Set<string>()
  for (const v of values) {
    const t = String(v ?? '').trim().toUpperCase()
    if (t) s.add(t)
  }
  return s.size
}

export async function runContractFirstStage<T>(
  step: string,
  label: string,
  runStartedAt: number,
  onProgress: ContractFirstProgressCallback | undefined,
  fn: () => T | Promise<T>,
  details?: Record<string, unknown>
): Promise<{ result: T; timing: ContractFirstStageTiming }> {
  const t0 = performance.now()
  onProgress?.({
    step,
    label,
    current: 0,
    total: 1,
    elapsedMs: Math.round(performance.now() - runStartedAt),
    details: { phase: 'start', ...details },
  })
  const result = await fn()
  const durationMs = Math.round(performance.now() - t0)
  const timing: ContractFirstStageTiming = { step, label, durationMs, details }
  if (durationMs >= CONTRACT_FIRST_SLOW_STEP_MS) {
    console.warn('[SLOW_STEP]', {
      step,
      label,
      durationMs,
      ...details,
      hint: 'Posible cuello de botella — revisar loops O(mov×journey) o fuzzy OCR',
    })
  }
  onProgress?.({
    step,
    label,
    current: 1,
    total: 1,
    elapsedMs: Math.round(performance.now() - runStartedAt),
    details: { phase: 'done', durationMs, ...details },
  })
  return { result, timing }
}

export function emitContractFirstProgress(
  onProgress: ContractFirstProgressCallback | undefined,
  runStartedAt: number,
  event: Omit<ContractFirstProgressEvent, 'elapsedMs'> & { elapsedMs?: number }
): void {
  if (!onProgress) return
  const elapsedMs = event.elapsedMs ?? Math.round(performance.now() - runStartedAt)
  const payload: ContractFirstProgressEvent = { ...event, elapsedMs }
  if (elapsedMs >= CONTRACT_FIRST_LONG_RUN_WARN_MS) {
    payload.details = {
      ...payload.details,
      longRunning: true,
      message: `El cruce sigue en ejecución. Última etapa: ${event.label}.`,
    }
  }
  onProgress(payload)
  if (elapsedMs >= CONTRACT_FIRST_LONG_RUN_WARN_MS) {
    console.warn('[CONTRACT_FIRST_LONG_RUN]', payload)
  }
}
