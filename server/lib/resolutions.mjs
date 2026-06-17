/** @typedef {{ id: string, label: string, sec: number }} ResolutionDef */

const MONTH_SEC = 2592000;

/** @param {string} id */
export function normalizeResolutionId(id) {
  const s = String(id ?? "").trim();
  if (!s) return s;
  if (s === "1D") return "D";
  if (s === "1W") return "W";
  if (s === "1M") return "M";
  return s;
}

/** @param {string} id */
function computeResolutionSec(id) {
  const s = normalizeResolutionId(id);
  if (!s) return null;
  if (s === "D") return 86400;
  if (s === "W") return 604800;
  if (s === "M") return MONTH_SEC;
  const tick = /^(\d+)T$/i.exec(s);
  if (tick) return 1;
  const sec = /^(\d+)S$/i.exec(s);
  if (sec) return Number(sec[1]);
  if (/^\d+$/.test(s)) return Number(s) * 60;
  const months = /^(\d+)M$/i.exec(s);
  if (months) return Number(months[1]) * MONTH_SEC;
  return null;
}

/** @param {string} id */
export function resolutionSec(id) {
  const norm = normalizeResolutionId(id);
  if (RESOLUTION_SEC[norm] != null) return RESOLUTION_SEC[norm];
  return computeResolutionSec(norm) ?? 60;
}

/** @param {string} id */
export function isValidResolutionId(id) {
  return resolutionSec(id) != null;
}

/**
 * @param {object | null | undefined} symbolMeta
 * @param {string} resolution
 */
export function isSymbolResolutionSupported(symbolMeta, resolution) {
  const list = symbolMeta?.supported_resolutions;
  if (!Array.isArray(list) || !list.length) return true;
  const norm = normalizeResolutionId(resolution);
  return list.some((id) => normalizeResolutionId(id) === norm);
}

/** @param {string} id */
export function resolutionShortLabel(id) {
  const s = normalizeResolutionId(id);
  if (s === "D") return "1D";
  if (s === "W") return "1W";
  if (s === "M") return "1M";
  const tick = /^(\d+)T$/i.exec(s);
  if (tick) return `${tick[1]}t`;
  const sec = /^(\d+)S$/i.exec(s);
  if (sec) return `${sec[1]}s`;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n % 60 === 0 && n >= 60) return `${n / 60}h`;
    return `${n}m`;
  }
  return s;
}

/** @param {ResolutionDef[]} list */
export function sortResolutions(list) {
  const order = { ticks: 0, seconds: 1, minutes: 2, hours: 3, days: 4 };
  const group = (id) => {
    const s = normalizeResolutionId(id);
    if (/^\d+T$/i.test(s)) return "ticks";
    if (/^\d+S$/i.test(s)) return "seconds";
    if (s === "D" || s === "W" || s === "M") return "days";
    const sec = resolutionSec(s);
    if (sec != null && sec >= 3600 && sec < 86400) return "hours";
    return "minutes";
  };
  return [...list].sort((a, b) => {
    const ga = order[group(a.id)] ?? 9;
    const gb = order[group(b.id)] ?? 9;
    if (ga !== gb) return ga - gb;
    return a.sec - b.sec;
  });
}

/** @param {ResolutionDef[]} base @param {ResolutionDef[]} extra */
export function mergeResolutionLists(base, extra) {
  const map = new Map();
  for (const r of base) map.set(r.id, r);
  for (const r of extra) {
    if (!map.has(r.id)) map.set(r.id, r);
  }
  return sortResolutions([...map.values()]);
}

/** Default chart intervals (UDF resolution ids) — TradingView standard list. */
export const CHART_RESOLUTIONS = [
  { id: "1", label: "1m", sec: 60 },
  { id: "3", label: "3m", sec: 180 },
  { id: "5", label: "5m", sec: 300 },
  { id: "15", label: "15m", sec: 900 },
  { id: "30", label: "30m", sec: 1800 },
  { id: "45", label: "45m", sec: 2700 },
  { id: "60", label: "1h", sec: 3600 },
  { id: "120", label: "2h", sec: 7200 },
  { id: "180", label: "3h", sec: 10800 },
  { id: "240", label: "4h", sec: 14400 },
  { id: "D", label: "1D", sec: 86400 },
  { id: "W", label: "1W", sec: 604800 },
  { id: "M", label: "1M", sec: 2592000 },
];

export const RESOLUTION_SEC = Object.fromEntries(CHART_RESOLUTIONS.map((r) => [r.id, r.sec]));
export const CHART_RESOLUTION_IDS = CHART_RESOLUTIONS.map((r) => r.id);

/** @param {string[] | undefined} symbolResolutions */
export function supportedResolutionsForSymbol(symbolResolutions) {
  if (!Array.isArray(symbolResolutions) || !symbolResolutions.length) {
    return CHART_RESOLUTION_IDS;
  }
  const allowed = new Set(CHART_RESOLUTION_IDS);
  const picked = [...new Set(symbolResolutions.map(normalizeResolutionId).filter((id) => allowed.has(id)))];
  return picked.length ? picked : CHART_RESOLUTION_IDS;
}

/** @param {number} tick */
export function tickToMinmovPricescale(tick) {
  const t = Number(tick) || 0.01;
  let scale = 1;
  while (Math.abs(Math.round(t * scale) - t * scale) > 1e-9 && scale < 1e10) {
    scale *= 10;
  }
  const minmov = Math.round(t * scale);
  return { minmov, pricescale: scale, tick: minmov / scale };
}
