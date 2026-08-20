import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppConfig } from "../config.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logging.js";
import { loadKey, open, seal, type SealedPayload } from "./crypto.js";

/** Credenciales OAuth persistidas por usuario (refresh token es el core). */
export interface StoredTokens {
  refresh_token: string;
  access_token?: string;
  expiry_date?: number; // epoch ms
  scope?: string;
  token_type?: string;
  updated_at: string;
}

export interface TokenStore {
  get(userId: string): Promise<StoredTokens | null>;
  set(userId: string, tokens: StoredTokens): Promise<void>;
  delete(userId: string): Promise<void>;
  list(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// File store: mapa { userId -> StoredTokens } cifrado con AES-256-GCM en disco.
// ---------------------------------------------------------------------------
class EncryptedFileStore implements TokenStore {
  private key: Buffer;
  private path: string;
  private cache: Record<string, StoredTokens> | null = null;

  constructor(cfg: AppConfig) {
    this.key = loadKey(cfg.TOKEN_ENCRYPTION_KEY);
    this.path = cfg.TOKEN_STORE_PATH;
  }

  private async load(): Promise<Record<string, StoredTokens>> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.path, "utf8");
      const sealed = JSON.parse(raw) as SealedPayload;
      this.cache = open<Record<string, StoredTokens>>(this.key, sealed);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "ENOENT") {
        this.cache = {};
      } else {
        throw new AppError("CONFIG_ERROR", "No se pudo leer/descifrar el token store", {
          details: (err as Error).message,
        });
      }
    }
    return this.cache!;
  }

  private async persist(): Promise<void> {
    const sealed = seal(this.key, this.cache ?? {});
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(sealed), { mode: 0o600 });
  }

  async get(userId: string): Promise<StoredTokens | null> {
    const all = await this.load();
    return all[userId] ?? null;
  }

  async set(userId: string, tokens: StoredTokens): Promise<void> {
    const all = await this.load();
    all[userId] = tokens;
    await this.persist();
  }

  async delete(userId: string): Promise<void> {
    const all = await this.load();
    delete all[userId];
    await this.persist();
  }

  async list(): Promise<string[]> {
    return Object.keys(await this.load());
  }
}

// ---------------------------------------------------------------------------
// Supabase store: reutiliza el proyecto Supabase del dashboard si se desea.
// Guarda el refresh token ya CIFRADO (columna `sealed` jsonb). RLS: usar
// service role key en el server; nunca exponer al cliente.
// ---------------------------------------------------------------------------
class SupabaseStore implements TokenStore {
  private key: Buffer;
  private table: string;
  // Importado dinámicamente para no cargar el SDK si no se usa.
  private clientPromise: Promise<import("@supabase/supabase-js").SupabaseClient>;

  constructor(cfg: AppConfig) {
    this.key = loadKey(cfg.TOKEN_ENCRYPTION_KEY);
    this.table = cfg.SUPABASE_TOKENS_TABLE;
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_SERVICE_ROLE_KEY) {
      throw new AppError(
        "CONFIG_ERROR",
        "TOKEN_STORE=supabase requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY",
      );
    }
    this.clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
  }

  async get(userId: string): Promise<StoredTokens | null> {
    const client = await this.clientPromise;
    const { data, error } = await client
      .from(this.table)
      .select("sealed")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new AppError("CONFIG_ERROR", `Supabase get falló: ${error.message}`);
    if (!data?.sealed) return null;
    return open<StoredTokens>(this.key, data.sealed as SealedPayload);
  }

  async set(userId: string, tokens: StoredTokens): Promise<void> {
    const client = await this.clientPromise;
    const sealed = seal(this.key, tokens);
    const { error } = await client
      .from(this.table)
      .upsert({ user_id: userId, sealed, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new AppError("CONFIG_ERROR", `Supabase set falló: ${error.message}`);
  }

  async delete(userId: string): Promise<void> {
    const client = await this.clientPromise;
    const { error } = await client.from(this.table).delete().eq("user_id", userId);
    if (error) throw new AppError("CONFIG_ERROR", `Supabase delete falló: ${error.message}`);
  }

  async list(): Promise<string[]> {
    const client = await this.clientPromise;
    const { data, error } = await client.from(this.table).select("user_id");
    if (error) throw new AppError("CONFIG_ERROR", `Supabase list falló: ${error.message}`);
    return (data ?? []).map((r: { user_id: string }) => r.user_id);
  }
}

let singleton: TokenStore | null = null;

export function getTokenStore(cfg: AppConfig): TokenStore {
  if (singleton) return singleton;
  singleton =
    cfg.TOKEN_STORE === "supabase" ? new SupabaseStore(cfg) : new EncryptedFileStore(cfg);
  logger.info("Token store inicializado", { backend: cfg.TOKEN_STORE });
  return singleton;
}

/** Solo para tests: permite inyectar un store en memoria. */
export function __setTokenStoreForTests(store: TokenStore | null): void {
  singleton = store;
}
