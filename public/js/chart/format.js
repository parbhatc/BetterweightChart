import { formatChartTimeLabel } from "./time/labelFormat.js";

/** @param {number | { year: number, month: number, day: number }} t */
export function toDate(t) {
  if (typeof t === "number") return new Date(t * 1000);
  if (t && typeof t === "object" && "year" in t) {
    return new Date(t.year, t.month - 1, t.day);
  }
  return new Date(0);
}

/** @param {Date} d */
export function dateTime12h(d) {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * @param {{ time: number }} bar
 * @param {object} [scales]
 * @param {string} [timeZone]
 */
export function barTimeLabel(bar, scales, timeZone) {
  if (!scales || !timeZone) return dateTime12h(toDate(bar.time));
  return formatChartTimeLabel(bar.time, scales, timeZone, { includeTime: true });
}
