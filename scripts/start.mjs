import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";

const child = spawn(process.execPath, [".next/standalone/server.js"], { stdio: "inherit", env: { ...process.env, HOSTNAME: "0.0.0.0" } });
const port = process.env.PORT || "3000";
let stopped = false;
let busy = false;
let lastTickWarning = 0;
const warn = (message) => {
  if (Date.now() - lastTickWarning > 60_000) { console.error(`[ai-worker] ${message}`); lastTickWarning = Date.now(); }
};
const tick = async () => {
  if (stopped || busy || !process.env.AUTH_SECRET) return;
  busy = true;
  try {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", process.env.AUTH_SECRET).update(timestamp).digest("hex");
    const response = await fetch(`http://127.0.0.1:${port}/api/internal/ai-tick`, {
      method: "POST", headers: { "x-worker-time": timestamp, "x-worker-signature": signature }, signal: AbortSignal.timeout(55000),
    });
    if (!response.ok) warn(`Tick HTTP ${response.status}; se reintentará.`);
  } catch { warn("Tick no disponible; se reintentará."); }
  finally { busy = false; }
};
const timer = setInterval(tick, 2500);
timer.unref();
setTimeout(tick, 4000).unref();
const stop = (signal) => { stopped = true; clearInterval(timer); child.kill(signal); };
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
child.on("exit", (code) => { stopped = true; clearInterval(timer); process.exit(code ?? 1); });
