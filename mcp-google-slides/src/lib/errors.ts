/**
 * Normalización de errores. Convierte errores de googleapis / red / auth en un
 * tipo estable con `code` legible, sin filtrar tokens ni payloads sensibles.
 */

export type ErrorCode =
  | "AUTH_REQUIRED" // no hay refresh token para el usuario
  | "AUTH_INVALID" // refresh token vencido/revocado
  | "PERMISSION_DENIED" // 403
  | "NOT_FOUND" // 404
  | "RATE_LIMITED" // 429
  | "INVALID_ARGUMENT" // validación / 400
  | "UPSTREAM_ERROR" // 5xx de Google
  | "TIMEOUT"
  | "CONFIG_ERROR"
  | "UNKNOWN";

export class AppError extends Error {
  code: ErrorCode;
  status?: number;
  details?: unknown;
  retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { status?: number; details?: unknown; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = opts.status;
    this.details = opts.details;
    this.retryable = opts.retryable ?? false;
  }
}

interface GoogleApiErrorLike {
  code?: number;
  status?: number;
  message?: string;
  response?: {
    status?: number;
    data?: { error?: { message?: string; status?: string; errors?: unknown } };
  };
  errors?: Array<{ message?: string; reason?: string }>;
}

function httpStatusOf(err: GoogleApiErrorLike): number | undefined {
  return err.response?.status ?? err.status ?? err.code;
}

/** Extrae un mensaje humano de un error de googleapis sin exponer secretos. */
function messageOf(err: GoogleApiErrorLike, fallback: string): string {
  return (
    err.response?.data?.error?.message ||
    err.errors?.[0]?.message ||
    err.message ||
    fallback
  );
}

export function normalizeError(err: unknown, context = "Google API"): AppError {
  if (err instanceof AppError) return err;

  const e = (err ?? {}) as GoogleApiErrorLike;

  // Timeouts de node/undici (código puede ser string tipo ETIMEDOUT o número HTTP)
  const rawCode = (err as { code?: unknown }).code;
  const codeStr = typeof rawCode === "string" ? rawCode : "";
  if (codeStr === "ETIMEDOUT" || codeStr === "ECONNABORTED" || codeStr === "ECONNRESET") {
    return new AppError("TIMEOUT", `${context}: timeout de red`, { retryable: true });
  }
  if (codeStr === "ENOTFOUND" || codeStr === "ECONNREFUSED") {
    return new AppError("UPSTREAM_ERROR", `${context}: no se pudo conectar a Google`, {
      retryable: true,
    });
  }

  const status = httpStatusOf(e);
  const msg = messageOf(e, `${context}: error desconocido`);

  switch (status) {
    case 400:
      return new AppError("INVALID_ARGUMENT", msg, { status });
    case 401:
      return new AppError("AUTH_INVALID", `${context}: credenciales inválidas o vencidas`, {
        status,
      });
    case 403:
      return new AppError("PERMISSION_DENIED", msg, { status });
    case 404:
      return new AppError("NOT_FOUND", msg, { status });
    case 429:
      return new AppError("RATE_LIMITED", `${context}: rate limit (429)`, {
        status,
        retryable: true,
      });
    case 500:
    case 502:
    case 503:
    case 504:
      return new AppError("UPSTREAM_ERROR", `${context}: error del servidor de Google`, {
        status,
        retryable: true,
      });
    default:
      return new AppError("UNKNOWN", msg, { status });
  }
}

/** Serializa un AppError a un objeto seguro para devolver como resultado de tool. */
export function toToolError(err: unknown): { code: ErrorCode; message: string } {
  const e = err instanceof AppError ? err : normalizeError(err);
  return { code: e.code, message: e.message };
}
