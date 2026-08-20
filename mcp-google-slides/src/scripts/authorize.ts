/**
 * Helper CLI para iniciar la autorización OAuth de Google.
 * Uso: `npm run oauth -- [userId]`
 *
 * Requiere que el servidor esté corriendo (npm run dev / start), porque el
 * callback OAuth se recibe en <PUBLIC_BASE_URL>/oauth/callback.
 */
import { getConfig, assertGoogleOAuthConfigured } from "../config.js";

function main() {
  const cfg = getConfig();
  assertGoogleOAuthConfigured(cfg);
  const userId = process.argv[2] ?? cfg.DEFAULT_USER_ID;
  const startUrl =
    `${cfg.PUBLIC_BASE_URL}/oauth/start` +
    (userId === cfg.DEFAULT_USER_ID ? "" : `?userId=${encodeURIComponent(userId)}`);

  console.log("");
  console.log("=== Autorización OAuth de Google (mcp-google-slides) ===");
  console.log("");
  console.log(`1. Asegurate de que el servidor esté corriendo (npm run dev).`);
  console.log(`2. Abrí esta URL en el navegador y otorgá acceso:`);
  console.log("");
  console.log(`   ${startUrl}`);
  console.log("");
  console.log(`3. Al terminar, el refresh token queda cifrado para el usuario "${userId}".`);
  console.log(`   Verificá con: GET ${cfg.PUBLIC_BASE_URL}/oauth/status`);
  console.log("");
}

main();
