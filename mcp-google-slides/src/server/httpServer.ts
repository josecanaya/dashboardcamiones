import { randomUUID } from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AppConfig } from "../config.js";
import { logger } from "../lib/logging.js";
import { createMcpServer } from "./mcpServer.js";
import { createOAuthRouter } from "../auth/oauthRoutes.js";

/**
 * Middleware de autenticación del CLIENTE MCP (separado de la autorización
 * OAuth de Google). Verifica `Authorization: Bearer <MCP_AUTH_TOKEN>`.
 * Si MCP_AUTH_TOKEN está vacío (solo dev), no exige token.
 */
function mcpAuth(cfg: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!cfg.MCP_AUTH_TOKEN) return next();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (token !== cfg.MCP_AUTH_TOKEN) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "No autorizado: token de cliente MCP inválido" },
        id: null,
      });
      return;
    }
    next();
  };
}

export function createHttpApp(cfg: AppConfig) {
  const app = express();
  app.use(
    cors({
      origin: true,
      exposedHeaders: ["Mcp-Session-Id"],
      allowedHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "Last-Event-Id"],
    }),
  );

  // Health endpoint (público, sin auth) para readiness/liveness.
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "mcp-google-slides",
      version: "0.1.0",
      transport: "streamable-http",
      googleOAuthConfigured: Boolean(cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET),
      tokenStore: cfg.TOKEN_STORE,
      time: new Date().toISOString(),
    });
  });

  // Rutas OAuth de Google (autorización por usuario).
  app.use(createOAuthRouter(cfg));

  // --- Endpoint MCP (Streamable HTTP) --------------------------------------
  // Un transport por sesión, indexado por Mcp-Session-Id.
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const jsonParser = express.json({ limit: "8mb" });

  app.post("/mcp", mcpAuth(cfg), jsonParser, async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = transport;
            logger.info("Sesión MCP iniciada", { sessionId: sid });
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
            logger.info("Sesión MCP cerrada", { sessionId: transport.sessionId });
          }
        };
        const server = createMcpServer(cfg);
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: falta un Mcp-Session-Id válido" },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error("Error manejando POST /mcp", { err: String(err) });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Error interno del servidor" },
          id: null,
        });
      }
    }
  });

  // GET (stream SSE server->client) y DELETE (cerrar sesión).
  const handleSessionRequest = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Sesión MCP inválida o inexistente");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  };

  app.get("/mcp", mcpAuth(cfg), handleSessionRequest);
  app.delete("/mcp", mcpAuth(cfg), handleSessionRequest);

  return app;
}
