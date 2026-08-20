import { randomBytes } from "node:crypto";
import type { Request, Response, Router } from "express";
import express from "express";
import type { AppConfig } from "../config.js";
import { AppError, toToolError } from "../lib/errors.js";
import { logger } from "../lib/logging.js";
import { buildAuthUrl, createOAuthClient } from "./oauthClient.js";
import { getTokenStore, type StoredTokens } from "./tokenStore.js";

/**
 * State CSRF de corta vida: mapea `state -> { userId, exp }`. En memoria (el
 * flujo OAuth dura segundos). Para multi-instancia, mover a Redis/Supabase.
 */
const pendingStates = new Map<string, { userId: string; exp: number }>();
const STATE_TTL_MS = 10 * 60 * 1000;

function newState(userId: string): string {
  const state = randomBytes(24).toString("hex");
  pendingStates.set(state, { userId, exp: Date.now() + STATE_TTL_MS });
  return state;
}

function consumeState(state: string): string | null {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state);
  if (Date.now() > entry.exp) return null;
  return entry.userId;
}

export function createOAuthRouter(cfg: AppConfig): Router {
  const router = express.Router();

  // Inicia el flujo: redirige al consentimiento de Google.
  // GET /oauth/start?userId=<opcional>
  router.get("/oauth/start", (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId ?? cfg.DEFAULT_USER_ID);
      const state = newState(userId);
      const url = buildAuthUrl(cfg, state);
      logger.info("OAuth start", { userId });
      res.redirect(url);
    } catch (err) {
      const e = toToolError(err);
      res.status(500).json({ error: e });
    }
  });

  // Callback de Google: intercambia code por tokens y los guarda cifrados.
  // GET /oauth/callback?code=...&state=...
  router.get("/oauth/callback", async (req: Request, res: Response) => {
    try {
      const { code, state, error: oauthError } = req.query as Record<string, string>;
      if (oauthError) {
        throw new AppError("AUTH_REQUIRED", `Google devolvió un error: ${oauthError}`);
      }
      if (!code || !state) {
        throw new AppError("INVALID_ARGUMENT", "Faltan parámetros code/state en el callback");
      }
      const userId = consumeState(state);
      if (!userId) {
        throw new AppError("AUTH_REQUIRED", "State inválido o expirado (posible CSRF)");
      }

      const client = createOAuthClient(cfg);
      const { tokens } = await client.getToken(code);

      if (!tokens.refresh_token) {
        throw new AppError(
          "AUTH_REQUIRED",
          "Google no devolvió refresh_token. Revocá el acceso previo en " +
            "https://myaccount.google.com/permissions y reintentá (se fuerza prompt=consent).",
        );
      }

      const stored: StoredTokens = {
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token ?? undefined,
        expiry_date: tokens.expiry_date ?? undefined,
        scope: tokens.scope ?? undefined,
        token_type: tokens.token_type ?? undefined,
        updated_at: new Date().toISOString(),
      };
      await getTokenStore(cfg).set(userId, stored);
      logger.info("OAuth callback OK: refresh token almacenado", { userId });

      res
        .status(200)
        .type("html")
        .send(
          `<!doctype html><meta charset="utf-8"><title>Autorización completa</title>` +
            `<body style="font-family:system-ui;max-width:640px;margin:48px auto;line-height:1.5">` +
            `<h1>✅ Autorización completa</h1>` +
            `<p>El servidor MCP ya puede acceder a Google Slides/Drive para el usuario ` +
            `<code>${escapeHtml(userId)}</code>.</p>` +
            `<p>Podés cerrar esta pestaña y volver a tu cliente MCP (Claude / ChatGPT).</p>` +
            `</body>`,
        );
    } catch (err) {
      const e = toToolError(err);
      logger.error("OAuth callback falló", e);
      res
        .status(400)
        .type("html")
        .send(
          `<!doctype html><meta charset="utf-8"><title>Error de autorización</title>` +
            `<body style="font-family:system-ui;max-width:640px;margin:48px auto">` +
            `<h1>❌ Error de autorización</h1><p><code>${escapeHtml(e.message)}</code></p></body>`,
        );
    }
  });

  // Estado de autorización de un usuario (sin exponer tokens).
  // GET /oauth/status?userId=<opcional>
  router.get("/oauth/status", async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId ?? cfg.DEFAULT_USER_ID);
      const tokens = await getTokenStore(cfg).get(userId);
      res.json({
        userId,
        authorized: Boolean(tokens?.refresh_token),
        scope: tokens?.scope ?? null,
        updated_at: tokens?.updated_at ?? null,
      });
    } catch (err) {
      res.status(500).json({ error: toToolError(err) });
    }
  });

  return router;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
