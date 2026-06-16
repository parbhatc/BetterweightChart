import { resolveTimezone } from "./list.js";

/**
 * LWC treats all times as UTC. To align day boundaries with a user timezone,
 * bar times are converted to pseudo-UTC whose components match wall-clock time
 * in the target zone (see lightweight-charts time-zones docs).
 */

/** @type {Map<string, { fmt: Intl.DateTimeFormat, cache: Map<number, number> }>} */
const tzCaches = new Map();

/** @param {string} timeZone */
function tzState(timeZone) {
  let state = tzCaches.get(timeZone);
  if (!state) {
    state = {
      fmt: new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
      cache: new Map(),
    };
    tzCaches.set(timeZone, state);
  }
  return state;
}

/** @param {string} [timeZone] */
export function invalidateChartTimeCache(timeZone) {
  if (timeZone) tzCaches.delete(timeZone);
  else tzCaches.clear();
}

/** @param {number} unixSec @param {string} timeZone */
export function utcToChartTime(unixSec, timeZone) {
  if (!Number.isFinite(unixSec)) return unixSec;
  const { fmt, cache } = tzState(timeZone);
  const hit = cache.get(unixSec);
  if (hit !== undefined) return hit;
  const parts = fmt.formatToParts(new Date(unixSec * 1000));
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "0";
  const chartSec =
    Date.UTC(
      Number(get("year")),
      Number(get("month")) - 1,
      Number(get("day")),
      Number(get("hour")),
      Number(get("minute")),
      Number(get("second")),
    ) / 1000;
  cache.set(unixSec, chartSec);
  return chartSec;
}

/** @param {object[]} bars @param {string} timeZone */
export function shiftBarsToChartTime(bars, timeZone) {
  return bars.map((b) => ({ ...b, time: utcToChartTime(b.time, timeZone) }));
}

/** @param {object} pane @param {object} settingsStore @param {object | null} symbolInfo */
export function chartTimeZoneForPane(pane, settingsStore, symbolInfo) {
  const sym = settingsStore.get().symbol ?? {};
  return resolveTimezone(sym.timezone, pane.symbolInfo ?? symbolInfo);
}
