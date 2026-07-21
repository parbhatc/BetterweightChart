// Scaffold a new built-in indicator: npm run new:indicator myIndicator
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raw = process.argv[2];
if (!raw || !/^[A-Za-z][A-Za-z0-9_]*$/.test(raw)) {
  console.error("Usage: npm run new:indicator <name>   (letters/digits/underscore, starts with a letter)");
  process.exit(1);
}

const id = raw.toLowerCase();
const className = `${raw[0].toUpperCase()}${raw.slice(1)}Indicator`;
const root = path.dirname(fileURLToPath(import.meta.url));
const defsDir = path.join(root, "..", "public", "js", "indicators", "definitions");
const dir = path.join(defsDir, id);
const manifestPath = path.join(defsDir, "index.js");

if (existsSync(dir)) {
  console.error(`Directory already exists: ${dir}`);
  process.exit(1);
}
let manifest = readFileSync(manifestPath, "utf8");
if (manifest.includes(`"${id}"`) || manifest.includes(`/${id}/`)) {
  console.error(`Indicator id "${id}" already appears in definitions/index.js`);
  process.exit(1);
}

const template = `import { defineIndicator } from "../../defineIndicator.js";
import { calcInputs, createInt, plot } from "../../builders.js";

const COLORS = {
  main: "#2962ff",
};

const ${className} = defineIndicator({
  id: "${id}",
  title: "${className.replace(/Indicator$/, "")}",
  shortTitle: "${raw.toUpperCase()}",
  primaryPlot: "main",
  plots: [plot("main", "${className.replace(/Indicator$/, "")}", COLORS.main)],
  inputs: [createInt("length", "Length", 14), ...calcInputs()],
  /**
   * Return one value array per plot id, aligned with \`bars\`.
   * @param {object[]} bars @param {object} inputs @param {object} style
   */
  compute(bars, inputs, style) {
    const length = Math.max(1, Math.floor(Number(inputs.length) || 14));
    void length;
    void style;
    // TODO: replace with real calculation.
    return { main: bars.map(() => null) };
  },
});

export default ${className};
`;

mkdirSync(dir, { recursive: true });
const filePath = path.join(dir, `${className}.js`);
writeFileSync(filePath, template);

// Manifest edits: import line, ALL_INDICATORS entry, named export.
const importLine = `import ${className} from "./${id}/${className}.js";\n`;
manifest = manifest.replace(/((?:^import .+\n)+)/m, `$1${importLine}`);
manifest = manifest.replace(/(export const ALL_INDICATORS = \[[^\]]*?)(\];)/s, `$1  ${className},\n$2`);
manifest = manifest.replace(/(export \{[^}]*?)(\};)/s, `$1  ${className},\n$2`);
writeFileSync(manifestPath, manifest);

console.log(`Created ${filePath}`);
console.log(`Registered ${className} in definitions/index.js`);
console.log("Next: implement compute() — UI, settings, defaults, rendering, and serialization are automatic.");
