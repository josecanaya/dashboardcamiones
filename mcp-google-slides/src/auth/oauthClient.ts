import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { AppConfig } from "../config.js";
import { assertGoogleOAuthConfigured } from "../config.js";

/**
 * Crea un cliente OAuth2 de Google a partir de la config. NO carga tokens;
 * eso lo hace el googleClient por-usuario.
 */
export function createOAuthClient(cfg: AppConfig): OAuth2Client {
  assertGoogleOAuthConfigured(cfg);
  return new google.auth.OAuth2({
    clientId: cfg.GOOGLE_CLIENT_ID,
    clientSecret: cfg.GOOGLE_CLIENT_SECRET,
    redirectUri: cfg.GOOGLE_OAUTH_REDIRECT_URI,
  });
}

/**
 * Genera la URL de consentimiento. `access_type=offline` + `prompt=consent`
 * garantizan que Google devuelva un refresh_token.
 */
export function buildAuthUrl(cfg: AppConfig, state: string): string {
  const client = createOAuthClient(cfg);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: cfg.GOOGLE_SCOPE_LIST,
    state,
  });
}
