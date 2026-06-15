import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { regressionInRange } from "../public/js/drawings/tools/channel/index.js";
import { regressionPearsonR } from "../public/js/drawings/tools/regression/trend.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(__dirname, "pearson-user.json"), "utf8"));
const bars = raw.t.map((time, i) => ({
  time,
  open: raw.o[i],
  high: raw.h[i],
  low: raw.l[i],
  close: raw.c[i],
}));

const TZ = "America/New_York"; // EST/EDT UTC-4
const fmt = (t) =>
  new Date(t * 1000).toLocaleString("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const tLo = 1781548200; // 2:30 PM EST
const tHi = 1781549220; // 2:47 PM EST
console.log("Range:", fmt(tLo), "->", fmt(tHi));

const expected = {
  close: 0.859996375764223,
  open: 0.8872347132248344,
  high: 0.8989853043559695,
  low: 0.87414773283565,
};

/** Pine-style Pearson R: (n*Exy - Ex*Ey) / sqrt((n*Ex2-Ex^2)(n*Ey2-Ey^2)) */
function pearsonPine(values) {
  const n = values.length;
  let Ex = 0;
  let Ey = 0;
  let Exy = 0;
  let Ex2 = 0;
  let Ey2 = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i];
    Ex += x;
    Ey += y;
    Exy += x * y;
    Ex2 += x * x;
    Ey2 += y * y;
  }
  const num = n * Exy - Ex * Ey;
  const den = Math.sqrt((n * Ex2 - Ex * Ex) * (n * Ey2 - Ey * Ey));
  return den < 1e-12 ? 0 : num / den;
}

/** corr(fitted line, values) */
function pearsonFit(values, slope, intercept) {
  const n = values.length;
  const fitted = values.map((_, i) => intercept + slope * i);
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sx2 = 0;
  let sy2 = 0;
  for (let i = 0; i < n; i++) {
    const x = fitted[i];
    const y = values[i];
    sx += x;
    sy += y;
    sxy += x * y;
    sx2 += x * x;
    sy2 += y * y;
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
  return den < 1e-12 ? 0 : num / den;
}

console.log("\n--- Current regressionPearsonR ---");
for (const source of Object.keys(expected)) {
  const reg = regressionInRange(bars, tLo, tHi, source);
  if (!reg) {
    console.log(source, "no reg");
    continue;
  }
  const r = regressionPearsonR(reg);
  const pine = pearsonPine(reg.values);
  const fit = pearsonFit(reg.values, reg.slope, reg.intercept);
  console.log(
    source,
    "n=",
    reg.values.length,
    "ours=",
    r,
    "pine=",
    pine,
    "fit=",
    fit,
    "exp=",
    expected[source],
    "match=",
    Math.abs(r - expected[source]) < 1e-6,
  );
}

// Try bar index range instead of time filter
const iLo = bars.findIndex((b) => b.time === tLo);
const iHi = bars.findIndex((b) => b.time === tHi);
console.log("\nBar indices:", iLo, iHi);
if (iLo >= 0 && iHi >= 0) {
  const slice = bars.slice(iLo, iHi + 1);
  const values = slice.map((b) => b.close);
  console.log("slice close pearson", pearsonPine(values), "ours", regressionPearsonR({ values }));
}
