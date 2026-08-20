import { getConfig } from "../config.js";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Patrones de claves/valores sensibles que jamás deben aparecer en logs.
 * El logger redacta recursivamente cualquier objeto antes de imprimirlo.
 */
const SENSITIVE_KEY = /(token|secret|password|authorization|refresh|access_token|client_secret|api[_-]?key|encryption)/i;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._-]+/g;
const LONG_TOKEN_RE = /\b(ya29|1\/\/|gho_|sk-)[A-Za-z0-9._-]{10,}\b/g;

function redactString(s: string): string {
  return s.replace(BEARER_RE, "Bearer [REDACTED]").replace(LONG_TOKEN_RE, "[REDACTED]");
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function shouldLog(level: Level): boolean {
  const configured = getConfig().LOG_LEVEL as Level;
  return ORDER[level] >= ORDER[configured];
}

function emit(level: Level, msg: string, meta?: unknown) {
  if (!shouldLog(level)) return;
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: redactString(msg),
  };
  if (meta !== undefined) line.meta = redact(meta);
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit("debug", msg, meta),
  info: (msg: string, meta?: unknown) => emit("info", msg, meta),
  warn: (msg: string, meta?: unknown) => emit("warn", msg, meta),
  error: (msg: string, meta?: unknown) => emit("error", msg, meta),
};
