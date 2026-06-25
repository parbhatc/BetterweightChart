import { resolveTimezone } from "./list.js";

/**
 * LWC stores series times as UTC. Display timezone is applied via chart
 * `timezoneProvider` (O(log N) offset lookup) at axis/crosshair format time.
 * `utcToChartTime` / `shiftBarsToChartTime` remain for one-off UTC ↔ wall-clock
 * conversion outside the render loop (dialogs, tests, transition table build).
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

/** @param {Intl.DateTimeFormatPart[]} parts */
function partsToChartSec(parts) {
  let year = 0;
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;
  for (const p of parts) {
    switch (p.type) {
      case "year":
        year = Number(p.value);
        break;
      case "month":
        month = Number(p.value);
        break;
      case "day":
        day = Number(p.value);
        break;
      case "hour":
        hour = Number(p.value);
        break;
      case "minute":
        minute = Number(p.value);
        break;
      case "second":
        second = Number(p.value);
        break;
      default:
        break;
    }
  }
  return Date.UTC(year, month - 1, day, hour, minute, second) / 1000;
}

/** @param {number} unixSec @param {string} timeZone */
export function utcToChartTime(unixSec, timeZone) {
  if (!Number.isFinite(unixSec)) return unixSec;
  if (timeZone === "Etc/UTC") return unixSec;
  const { fmt, cache } = tzState(timeZone);
  const hit = cache.get(unixSec);
  if (hit !== undefined) return hit;
  const chartSec = partsToChartSec(fmt.formatToParts(new Date(unixSec * 1000)));
  cache.set(unixSec, chartSec);
  return chartSec;
}

/** @param {number} unixSec @param {string} timeZone */
export function chartOffsetSec(unixSec, timeZone) {
  return utcToChartTime(unixSec, timeZone) - unixSec;
}

/** @param {number} fromSec @param {string} timeZone @param {number} offsetSec */
export function nextOffsetChangeAfter(fromSec, timeZone, offsetSec) {
  let t = fromSec;
  let step = 86400;
  const end = fromSec + 10 * 365 * 86400;
  while (t < end) {
    t += step;
    if (chartOffsetSec(t, timeZone) !== offsetSec) {
      let lo = t - step;
      let hi = t;
      while (hi - lo > 1) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (chartOffsetSec(mid, timeZone) !== offsetSec) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    step = Math.min(step * 2, 30 * 86400);
  }
  return Infinity;
}

/** @param {object[]} bars @param {string} timeZone */
export function shiftBarsToChartTime(bars, timeZone) {
  if (!bars.length) return [];
  if (timeZone === "Etc/UTC") return bars;

  const n = bars.length;
  const out = new Array(n);
  let i = 0;

  while (i < n) {
    const offset = chartOffsetSec(bars[i].time, timeZone);
    const segEnd = nextOffsetChangeAfter(bars[i].time, timeZone, offset);

    while (i < n && bars[i].time < segEnd) {
      const b = bars[i];
      const time = b.time + offset;
      out[i] = time === b.time ? b : { ...b, time };
      i += 1;
    }
  }

  return out;
}

/** @param {object} pane @param {object} settingsStore @param {object | null} symbolInfo */
export function chartTimeZoneForPane(pane, settingsStore, symbolInfo) {
  const sym = settingsStore.get().symbol ?? {};
  return resolveTimezone(sym.timezone, pane.symbolInfo ?? symbolInfo);
}
