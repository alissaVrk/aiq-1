import { spawn } from "node:child_process";
import net from "node:net";

const PROJECT_ROOT = process.cwd();
const UI_PORT = 5177;

function waitForPort(port, timeoutMs = 30_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => { socket.destroy(); resolve(); });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`port ${port} never opened`));
        else setTimeout(attempt, 1000);
      });
    };
    attempt();
  });
}

function waitForPortClosed(port, timeoutMs = 5000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) resolve();
        else setTimeout(attempt, 300);
      });
      socket.once("error", () => { socket.destroy(); resolve(); });
    };
    attempt();
  });
}

function killTree(child) {
  if (!child || child.pid == null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try { child.kill("SIGTERM"); } catch { /* already gone */ }
  }
}

export async function installDependencies() {
    console.log("RRRRRR DEP DEPENDENCIES");
  return new Promise((resolve) => {
    let output = "";
    const proc = spawn("bash", ["scripts/setup.sh", "--install-dev-ui"], {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "inherit", "pipe"],
    });
    proc.stderr?.on("data", (chunk) => { output += chunk.toString(); });
    proc.on("error", (err) => resolve({ exitCode: 1, output: err.message }));
    proc.on("close", (code) => {
      if (code === 0) resolve({ exitCode: 0, output: "" });
      else resolve({ exitCode: 1, output });
    });
  });
}

export async function startDev() {
  const proc = spawn("bash", ["scripts/start_e2e.sh", "--ui-port", String(UI_PORT)], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: "inherit",
  });

  proc.on("error", (err) => console.error("[aiq] spawn error:", err));

  const stop = () =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("stop timed out: ports still in use")), 5000);
      killTree(proc);
      Promise.all([waitForPortClosed(UI_PORT), waitForPortClosed(8000)]).then(() => {
        clearTimeout(timeout);
        resolve();
      });
    });

  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());

  await waitForPort(UI_PORT, 30_000);

  return { port: UI_PORT, stop };
}
