import { getConfig } from "./config.js";
import { createHttpApp } from "./server/httpServer.js";
import { logger } from "./lib/logging.js";

function main(): void {
  const cfg = getConfig();
  const app = createHttpApp(cfg);

  const server = app.listen(cfg.PORT, cfg.HOST, () => {
    logger.info("mcp-google-slides arriba", {
      url: `http://${cfg.HOST}:${cfg.PORT}`,
      publicBaseUrl: cfg.PUBLIC_BASE_URL,
      health: `http://${cfg.HOST}:${cfg.PORT}/health`,
      mcpEndpoint: `${cfg.PUBLIC_BASE_URL}/mcp`,
      oauthStart: `${cfg.PUBLIC_BASE_URL}/oauth/start`,
      authEnabled: Boolean(cfg.MCP_AUTH_TOKEN),
      googleOAuthConfigured: Boolean(cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET),
    });
  });

  const shutdown = (sig: string) => {
    logger.info(`Recibido ${sig}, cerrando...`);
    server.close(() => process.exit(0));
    // Fallback si close cuelga.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
