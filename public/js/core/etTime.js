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

/** @param {number} unixSec */
export function etParts(unixSec) {
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
