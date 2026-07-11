const ET_ZONE = "America/New_York";

const etFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// `Intl.DateTimeFormat.formatToParts` is ~microseconds/call but etParts runs
// over every chart bar on every replay step (20k+ bars × N steps), which made it
// the single hottest function in the step-forward trace. ET parts are a pure
// function of the timestamp, so memoize by unixSec — after the first pass every
// repeated bar is an O(1) cache hit. Callers only ever read the result (never
// mutate it), so sharing the cached object is safe. Bounded to avoid unbounded
// growth across long sessions / symbol changes.
/** @type {Map<number, Readonly<{ y: number, m: number, d: number, h: number, min: number, ymd: string, hm: string, mod: number }>>} */
const etPartsCache = new Map();
const ET_PARTS_CACHE_MAX = 200000;

/** @param {number} unixSec */
export function etParts(unixSec) {
  const cached = etPartsCache.get(unixSec);
  if (cached) return cached;

  /** @type {{ y: number, m: number, d: number, h: number, min: number, ymd: string, hm: string, mod: number }} */
  const out = { y: 0, m: 0, d: 0, h: 0, min: 0, ymd: "", hm: "", mod: 0 };
  for (const part of etFmt.formatToParts(new Date(unixSec * 1000))) {
    if (part.type === "year") out.y = Number(part.value);
    if (part.type === "month") out.m = Number(part.value);
    if (part.type === "day") out.d = Number(part.value);
    if (part.type === "hour") out.h = Number(part.value === "24" ? 0 : part.value);
    if (part.type === "minute") out.min = Number(part.value);
  }
  out.ymd = `${String(out.y).padStart(4, "0")}-${String(out.m).padStart(2, "0")}-${String(out.d).padStart(2, "0")}`;
  out.hm = `${String(out.h).padStart(2, "0")}:${String(out.min).padStart(2, "0")}`;
  out.mod = out.h * 60 + out.min;

  if (etPartsCache.size >= ET_PARTS_CACHE_MAX) etPartsCache.clear();
  etPartsCache.set(unixSec, out);
  return out;
}

/** @param {string} hm */
export function hmToMinutes(hm) {
  const p = String(hm).split(":");
  if (p.length < 2) return null;
  return Number(p[0]) * 60 + Number(p[1]);
}

/** @param {{ time: number }[]} bars */
export function uniqueEtDaysFromBars(bars) {
  const days = new Set();
  for (const bar of bars ?? []) {
    if (bar?.time != null) days.add(etParts(bar.time).ymd);
  }
  return [...days];
}
