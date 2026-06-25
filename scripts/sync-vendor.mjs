import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VENDOR = path.join(ROOT, "public", "vendor");
const LOCAL_LWC_DIST = path.join(ROOT, "..", "lightweightchart", "dist");

/** Set BWC_LWC_DEV=1 or pass --dev to copy the faster unminified standalone build. */
const useDevBundle =
  process.argv.includes("--dev") ||
  process.env.BWC_LWC_DEV === "1" ||
  process.env.BWC_LWC_DEV === "true";

const useSymlink = process.argv.includes("--link");

const VENDOR_FILES = [
  {
    src: useDevBundle
      ? "lightweight-charts.standalone.development.mjs"
      : "lightweight-charts.standalone.production.mjs",
    dest: "lightweight-charts.mjs",
  },
];

function resolveVendorSource(fileName) {
  const local = path.join(LOCAL_LWC_DIST, fileName);
  if (fs.existsSync(local)) return local;
  const fromModules = path.join(ROOT, "node_modules", "lightweight-charts", "dist", fileName);
  if (fs.existsSync(fromModules)) return fromModules;
  return null;
}

fs.mkdirSync(VENDOR, { recursive: true });

for (const { src, dest } of VENDOR_FILES) {
  const from = resolveVendorSource(src);
  const to = path.join(VENDOR, dest);
  if (!from) {
    console.error(`Missing dependency: ${src} — build ../lightweightchart or run npm install`);
    process.exit(1);
  }
  if (fs.existsSync(to)) {
    fs.unlinkSync(to);
  }
  if (useSymlink) {
    try {
      fs.symlinkSync(from, to, "file");
      console.log(`vendor: ${dest} -> ${path.relative(ROOT, from)} (symlink${useDevBundle ? ", dev" : ""})`);
      continue;
    } catch (err) {
      console.warn(`vendor: symlink failed (${err.message}), copying instead`);
    }
  }
  fs.copyFileSync(from, to);
  console.log(`vendor: ${dest} <- ${path.relative(ROOT, from)}${useDevBundle ? " (dev)" : ""}`);
}

// Remove legacy drawing bundle if present
const legacy = path.join(VENDOR, "lightweight-charts-drawing.js");
if (fs.existsSync(legacy)) {
  fs.unlinkSync(legacy);
  console.log("removed: lightweight-charts-drawing.js");
}
