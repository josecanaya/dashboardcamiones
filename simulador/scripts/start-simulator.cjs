const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const runDir = path.join(rootDir, ".runtime");
const pidFile = path.join(runDir, "simulator.pid");

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (!fs.existsSync(runDir)) {
  fs.mkdirSync(runDir, { recursive: true });
}

if (fs.existsSync(pidFile)) {
  const existingPid = Number(fs.readFileSync(pidFile, "utf8").trim());
  if (Number.isFinite(existingPid) && isProcessAlive(existingPid)) {
    console.log(`El simulador ya esta corriendo (PID ${existingPid}).`);
    console.log("Para detenerlo: pnpm run simulator:stop (desde la raiz) o cd simulador && npm run simulate:stop");
    process.exit(0);
  }
  // Proceso muerto: eliminar pid file obsoleto
  fs.unlinkSync(pidFile);
}

const tsxCli = require.resolve("tsx/cli");
const forwardArgs = process.argv.slice(2);
const child = spawn(process.execPath, [tsxCli, "src/service.ts", ...forwardArgs], {
  cwd: rootDir,
  detached: true,
  stdio: "ignore"
});

child.unref();
fs.writeFileSync(pidFile, String(child.pid), "utf8");

console.log(`Simulador iniciado en segundo plano (PID ${child.pid}).`);
console.log("Para detenerlo: npm run simulate:stop");
