import { resolveTimezone } from "./list.js";

/**
 * LWC treats all times as UTC. To align day boundaries with a user timezone,
 * bar times are converted to pseudo-UTC whose components match wall-clock time
 * in the target zone (see lightweight-charts time-zones docs).
 */

/** @param {number} unixSec @param {string} timeZone */
export function utcToChartTime(unixSec, timeZone) {
  if (!Number.isFinite(unixSec)) return unixSec;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(unixSec * 1000));
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "0";
  return (
    Date.UTC(
      Number(get("year")),
      Number(get("month")) - 1,
      Number(get("day")),
      Number(get("hour")),
      Number(get("minute")),
      Number(get("second")),
    ) / 1000
  );
}

/** @param {number} chartSec @param {string} timeZone */
export function chartTimeToUtc(chartSec, timeZone) {
  if (!Number.isFinite(chartSec)) return chartSec;
  let lo = chartSec - 93600;
  let hi = chartSec + 93600;
  for (let i = 0; i < 32; i += 1) {
    const mid = (lo + hi) >> 1;
    const ct = utcToChartTime(mid, timeZone);
    if (ct === chartSec) return mid;
    if (ct < chartSec) lo = mid + 1;
    else hi = mid - 1;
  }
  return chartSec;
}

/** @param {object} pane @param {object} settingsStore @param {object | null} symbolInfo */
export function chartTimeZoneForPane(pane, settingsStore, symbolInfo) {
  const sym = settingsStore.get().symbol ?? {};
  return resolveTimezone(sym.timezone, pane.symbolInfo ?? symbolInfo);
}
