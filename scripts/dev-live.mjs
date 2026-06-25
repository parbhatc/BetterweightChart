/**
 * LWC rollup watch + BWC dev server (live fork bundle, hard-refresh browser after LWC rebuild).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LWC_ROOT = path.join(ROOT, "node_modules", "lightweight-charts");
const LWC_DIST = path.join(LWC_ROOT, "dist", "lightweight-charts.standalone.development.mjs");
const ROLLUP_BIN = path.join(
  LWC_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "rollup.cmd" : "rollup",
);

const children = [];

function run(cmd, args, cwd, label, { optional = false } = {}) {
  const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: true, env: process.env });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[dev:live] ${label} exited with code ${code}`);
      if (optional) {
        console.warn(`[dev:live] continuing without ${label}`);
        return;
      }
      for (const c of children) c.kill();
      process.exit(code);
    }
  });
  children.push(child);
  return child;
}

console.info("[dev:live] LWC rollup watch + BWC server (BWC_LWC_LIVE=1)");
console.info("[dev:live] After LWC rebuilds, hard-refresh the browser (Ctrl+Shift+R)");

if (fs.existsSync(ROLLUP_BIN)) {
  run("npm", ["run", "rollup-watch"], LWC_ROOT, "lwc:watch", { optional: true });
} else if (fs.existsSync(LWC_DIST)) {
  console.warn(
    "[dev:live] rollup not installed in lightweight-charts — skipping watch (using prebuilt dist/)",
  );
  console.warn(
    "[dev:live] To enable LWC rebuilds: npm install --prefix node_modules/lightweight-charts",
  );
} else {
  console.error("[dev:live] Missing LWC dist/ and rollup — run one of:");
  console.error("  npm install --prefix node_modules/lightweight-charts && npm run lwc:build:dev");
  console.error("  npm run dev   (uses public/vendor/ instead of live fork)");
  process.exit(1);
}

run("node", ["scripts/dev-server.mjs"], ROOT, "bwc:dev");

process.on("SIGINT", () => {
  for (const c of children) c.kill("SIGINT");
  process.exit(0);
});
