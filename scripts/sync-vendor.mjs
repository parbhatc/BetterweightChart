import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VENDOR = path.join(ROOT, "public", "vendor");

const VENDOR_FILES = [
  {
    src: "node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.mjs",
    dest: "lightweight-charts.mjs",
  },
];

fs.mkdirSync(VENDOR, { recursive: true });

for (const { src, dest } of VENDOR_FILES) {
  const from = path.join(ROOT, src);
  const to = path.join(VENDOR, dest);
  if (!fs.existsSync(from)) {
    console.error(`Missing dependency: ${src} — run npm install first`);
    process.exit(1);
  }
  fs.copyFileSync(from, to);
  console.log(`vendor: ${dest}`);
}

// Remove legacy drawing bundle if present
const legacy = path.join(VENDOR, "lightweight-charts-drawing.js");
if (fs.existsSync(legacy)) {
  fs.unlinkSync(legacy);
  console.log("removed: lightweight-charts-drawing.js");
}
