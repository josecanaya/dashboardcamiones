import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config.js";
import { registerTools } from "../tools/registerTools.js";

/**
 * Crea una instancia de McpServer con todas las tools registradas.
 * Se crea una por sesión de transporte (patrón recomendado del SDK).
 */
export function createMcpServer(cfg: AppConfig): McpServer {
  const server = new McpServer(
    {
      name: "mcp-google-slides",
      version: "0.1.0",
    },
    {
      instructions:
        "Servidor MCP para operar Google Slides (informes operativos de circuitos de " +
        "camiones, cámaras LPR, plantas Ricardone/San Lorenzo/Avellaneda). Usá " +
        "google_slides_get_presentation / list_slides para leer; replace_text con " +
        "placeholders {{...}} para plantillas; las tools destructivas (delete_slide, " +
        "batch_update con delete/replaceAll) requieren confirm=true.",
    },
  );

  registerTools(server, cfg);
  return server;
}
