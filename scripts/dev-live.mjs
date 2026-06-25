/**
 * LWC rollup watch + BWC dev server (live fork bundle, hard-refresh browser after LWC rebuild).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LWC_ROOT = path.join(ROOT, "node_modules", "lightweight-charts");

const children = [];

function run(cmd, args, cwd, label) {
  const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: true, env: process.env });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[dev:live] ${label} exited with code ${code}`);
      for (const c of children) c.kill();
      process.exit(code);
    }
  });
  children.push(child);
  return child;
}

console.info("[dev:live] LWC rollup watch + BWC server (BWC_LWC_LIVE=1)");
console.info("[dev:live] After LWC rebuilds, hard-refresh the browser (Ctrl+Shift+R)");

run("npm", ["run", "rollup-watch"], LWC_ROOT, "lwc:watch");
run("node", ["scripts/dev-server.mjs"], ROOT, "bwc:dev");

process.on("SIGINT", () => {
  for (const c of children) c.kill("SIGINT");
  process.exit(0);
});
