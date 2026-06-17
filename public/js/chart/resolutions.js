import {
  mergeResolutionLists,
  normalizeResolutionId,
  resolutionSec as computeResolutionSec,
} from "./resolutionFormat.js";
import { loadCustomResolutions } from "../ui/timeframe/custom.js";
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

export const BAR_SEC = Object.fromEntries(CHART_RESOLUTIONS.map((r) => [r.id, r.sec]));

export const CHART_RESOLUTION_IDS = CHART_RESOLUTIONS.map((r) => r.id);

/** @param {string} id */
export function resolutionSec(id) {
  const norm = normalizeResolutionId(id);
  if (BAR_SEC[norm] != null) return BAR_SEC[norm];
  return computeResolutionSec(norm) ?? 60;
}

export { normalizeResolutionId };
export {
  buildResolutionId,
  CUSTOM_INTERVAL_LIMITS,
  isValidResolutionId,
  resolutionDisplayTitle,
  resolutionGroupId,
  resolutionShortLabel,
  resolutionDef,
  validateCustomInterval,
} from "./resolutionFormat.js";

/**
 * @param {Array<{ id: string, label?: string, sec?: number }>} [base]
 * @returns {Array<{ id: string, label: string, sec: number }>}
 */
export function mergeWithCustomResolutions(base = CHART_RESOLUTIONS, custom) {
  return mergeResolutionLists(base, custom ?? loadCustomResolutions());
}

/** @param {string[] | undefined} symbolResolutions */
export function supportedResolutionsForSymbol(symbolResolutions) {
  if (!Array.isArray(symbolResolutions) || !symbolResolutions.length) {
    return CHART_RESOLUTION_IDS;
  }
  const allowed = new Set([
    ...CHART_RESOLUTION_IDS,
    ...loadCustomResolutions().map((r) => r.id),
  ]);
  const picked = [
    ...new Set(
      symbolResolutions
        .map(normalizeResolutionId)
        .filter((id) => allowed.has(id)),
    ),
  ];
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
