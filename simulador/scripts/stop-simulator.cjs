const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const pidFile = path.join(rootDir, ".runtime", "simulator.pid");

function removePidFile() {
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}

if (!fs.existsSync(pidFile)) {
  console.log("No hay simulador en ejecucion (pid file no encontrado).");
  process.exit(0);
}

const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
if (!Number.isFinite(pid)) {
  removePidFile();
  console.log("PID invalido. Se limpio el estado local.");
  process.exit(0);
}

try {
  process.kill(pid);
  removePidFile();
  console.log(`Simulador detenido (PID ${pid}).`);
} catch (error) {
  removePidFile();
  console.log(`No se pudo detener PID ${pid} (quizas ya no existia). Estado limpiado.`);
}
