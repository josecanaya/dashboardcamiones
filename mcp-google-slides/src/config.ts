import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

/**
 * Esquema de configuración del servidor. Toda la config sensible viene de
 * variables de entorno; nunca hay secretos hardcodeados.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8790),
  HOST: z.string().default("127.0.0.1"),
  PUBLIC_BASE_URL: z.string().url().default("http://127.0.0.1:8790"),

  MCP_AUTH_TOKEN: z.string().default(""),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().default(""),
  GOOGLE_SCOPES: z
    .string()
    .default(
      "https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
    ),

  TOKEN_STORE: z.enum(["file", "supabase"]).default("file"),
  TOKEN_ENCRYPTION_KEY: z.string().default(""),
  TOKEN_STORE_PATH: z.string().default("./.tokens/tokens.json.enc"),

  SUPABASE_URL: z.string().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
  SUPABASE_TOKENS_TABLE: z.string().default("mcp_google_oauth_tokens"),

  DEFAULT_USER_ID: z.string().default("default"),

  GOOGLE_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  GOOGLE_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = ReturnType<typeof buildConfig>;

function buildConfig() {
  const parsed = EnvSchema.parse(process.env);

  const redirectUri =
    parsed.GOOGLE_OAUTH_REDIRECT_URI ||
    `${parsed.PUBLIC_BASE_URL.replace(/\/$/, "")}/oauth/callback`;

  const scopes = parsed.GOOGLE_SCOPES.split(/\s+/).map((s) => s.trim()).filter(Boolean);

  return {
    ...parsed,
    PUBLIC_BASE_URL: parsed.PUBLIC_BASE_URL.replace(/\/$/, ""),
    GOOGLE_OAUTH_REDIRECT_URI: redirectUri,
    GOOGLE_SCOPE_LIST: scopes,
  };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cached) cached = buildConfig();
  return cached;
}

/** Reinicia el cache (usado en tests). */
export function resetConfig(): void {
  cached = null;
}

/**
 * Valida que las credenciales de Google estén presentes. Se llama antes de
 * cualquier operación que requiera hablar con Google (no al arrancar, así el
 * servidor puede levantar y exponer /health aunque falte configurar OAuth).
 */
export function assertGoogleOAuthConfigured(cfg: AppConfig): void {
  const missing: string[] = [];
  if (!cfg.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!cfg.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (missing.length > 0) {
    throw new Error(
      `Faltan credenciales OAuth de Google: ${missing.join(", ")}. ` +
        `Completá el .env (ver .env.example) y reiniciá el servidor.`,
    );
  }
}
