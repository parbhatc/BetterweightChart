/**
 * Start BWC dev server with live LWC fork bundle (no vendor copy on each LWC rebuild).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

process.env.BWC_LWC_LIVE = "1";

const child = spawn(
  "npx",
  ["nodemon", "--watch", "server", "--watch", "testing_web", "server/index.mjs"],
  {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: process.env,
  },
);

child.on("exit", (code) => process.exit(code ?? 0));
