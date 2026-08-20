import { AppError, normalizeError } from "./errors.js";
import { logger } from "./logging.js";

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  context?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ejecuta `fn` con reintentos y backoff exponencial + jitter. Solo reintenta
 * errores marcados como `retryable` (429 / 5xx / timeouts de red).
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const base = opts.baseDelayMs ?? 300;
  const max = opts.maxDelayMs ?? 8000;
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (raw) {
      const err = raw instanceof AppError ? raw : normalizeError(raw, opts.context);
      const canRetry = err.retryable && attempt < opts.maxRetries;
      if (!canRetry) throw err;

      const delay = Math.min(max, base * 2 ** attempt) + Math.floor(Math.random() * 200);
      attempt += 1;
      logger.warn("Reintentando llamada a Google", {
        context: opts.context,
        attempt,
        code: err.code,
        delayMs: delay,
      });
      await sleep(delay);
    }
  }
}

/** Envuelve una promesa con un timeout duro. */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  context = "operación",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AppError("TIMEOUT", `${context}: excedió ${ms}ms`, { retryable: true }));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
