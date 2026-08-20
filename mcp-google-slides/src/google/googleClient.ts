import { google, type slides_v1, type drive_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { AppConfig } from "../config.js";
import { createOAuthClient } from "../auth/oauthClient.js";
import { getTokenStore, type StoredTokens } from "../auth/tokenStore.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logging.js";

export interface GoogleClients {
  auth: OAuth2Client;
  slides: slides_v1.Slides;
  drive: drive_v3.Drive;
}

/**
 * Construye clientes autorizados de Slides + Drive para un usuario, usando su
 * refresh token almacenado. La librería `google-auth-library` refresca el
 * access token automáticamente; persistimos los tokens nuevos vía evento.
 */
export async function getGoogleClients(
  cfg: AppConfig,
  userId: string,
): Promise<GoogleClients> {
  const store = getTokenStore(cfg);
  const stored = await store.get(userId);
  if (!stored?.refresh_token) {
    throw new AppError(
      "AUTH_REQUIRED",
      `El usuario "${userId}" no está autorizado. Abrí ${cfg.PUBLIC_BASE_URL}/oauth/start` +
        (userId === cfg.DEFAULT_USER_ID ? "" : `?userId=${encodeURIComponent(userId)}`) +
        " para conceder acceso a Google.",
    );
  }

  const auth = createOAuthClient(cfg);
  auth.setCredentials({
    refresh_token: stored.refresh_token,
    access_token: stored.access_token,
    expiry_date: stored.expiry_date,
    scope: stored.scope,
    token_type: stored.token_type,
  });

  // Persistir tokens refrescados (access_token nuevo, y refresh_token si rota).
  auth.on("tokens", (tokens) => {
    const next: StoredTokens = {
      ...stored,
      access_token: tokens.access_token ?? stored.access_token,
      expiry_date: tokens.expiry_date ?? stored.expiry_date,
      scope: tokens.scope ?? stored.scope,
      token_type: tokens.token_type ?? stored.token_type,
      refresh_token: tokens.refresh_token ?? stored.refresh_token,
      updated_at: new Date().toISOString(),
    };
    store.set(userId, next).catch((err) => {
      logger.warn("No se pudo persistir el token refrescado", { userId, err: String(err) });
    });
  });

  const slides = google.slides({ version: "v1", auth, timeout: cfg.GOOGLE_HTTP_TIMEOUT_MS });
  const drive = google.drive({ version: "v3", auth, timeout: cfg.GOOGLE_HTTP_TIMEOUT_MS });

  return { auth, slides, drive };
}
