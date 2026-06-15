/**
 * Rewrite relative imports after restructure (fixes Windows path normalization).
 * Usage: node scripts/rewrite-imports.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(ROOT, "docs", "restructure-manifest.json");

/** @param {string} p */
function toPosix(p) {
  return p.replace(/\\/g, "/");
}

/** @param {string} rel */
function absFromRel(rel) {
  return toPosix(path.resolve(ROOT, rel));
}

/** @param {string} fromDir @param {string} toAbs */
function relativeImport(fromDir, toAbs) {
  let rel = toPosix(path.relative(fromDir, toAbs));
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

/** @param {string} fileAbs @param {string} specifier */
function resolveSpecifier(fileAbs, specifier) {
  if (!specifier.startsWith(".")) return null;
  const dir = path.dirname(fileAbs);
  let resolved = path.resolve(dir, specifier);
  if (!path.extname(resolved)) resolved += ".js";
  return toPosix(resolved);
}

/** @param {string} abs @param {Map<string, string>} forward @param {Map<string, string>} reverse */
function canonicalNewPath(abs, forward, reverse) {
  const old = reverse.get(abs) ?? abs;
  return forward.get(old) ?? abs;
}

/** @param {string} content @param {string} fileNewAbs @param {Map<string, string>} forward @param {Map<string, string>} reverse */
function rewriteImports(content, fileNewAbs, forward, reverse) {
  const fileOldAbs = reverse.get(fileNewAbs) ?? fileNewAbs;
  const re = /(\bfrom\s+['"])([^'"]+)(['"])|(\bimport\s*\(\s*['"])([^'"]+)(['"]\s*\))/g;

  return content.replace(re, (match, fromPre, fromSpec, fromSuf, dynPre, dynSpec, dynSuf) => {
    const specifier = fromSpec ?? dynSpec;
    const pre = fromPre ?? dynPre;
    const suf = fromSuf ?? dynSuf;
    if (!specifier.startsWith(".")) return match;

    const resolvedOld = resolveSpecifier(fileOldAbs, specifier);
    if (!resolvedOld) return match;

    const targetNew = canonicalNewPath(resolvedOld, forward, reverse);
    const newSpec = relativeImport(path.dirname(fileNewAbs), targetNew);
    if (newSpec === specifier) return match;
    return `${pre}${newSpec}${suf}`;
  });
}

function collectTextFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) collectTextFiles(full, acc);
    else if (/\.(js|mjs|css|html)$/.test(ent.name)) acc.push(full);
  }
  return acc;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const forward = new Map();
  const reverse = new Map();

  for (const [oldRel, newRel] of Object.entries(manifest.moves)) {
    const oldAbs = absFromRel(oldRel);
    const newAbs = absFromRel(newRel);
    forward.set(oldAbs, newAbs);
    reverse.set(newAbs, oldAbs);
  }

  let rewritten = 0;
  for (const fileAbs of collectTextFiles(ROOT)) {
    const fileNewAbs = toPosix(path.resolve(fileAbs));
    const content = fs.readFileSync(fileAbs, "utf8");
    const next = rewriteImports(content, fileNewAbs, forward, reverse);
    if (next !== content) {
      rewritten += 1;
      fs.writeFileSync(fileAbs, next, "utf8");
    }
  }
  console.log(`Rewrote imports in ${rewritten} files.`);
}

main();
