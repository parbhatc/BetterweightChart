import { resolutionGroupId } from "../chart/resolutionFormat.js";

export const VISIBILITY_KEYS = ["ticks", "seconds", "minutes", "hours", "days", "weeks", "months", "ranges"];

/** @returns {Record<string, boolean>} */
export function defaultIndicatorVisibility() {
  return Object.fromEntries(VISIBILITY_KEYS.map((k) => [k, true]));
}

/** @param {string} resolutionId @param {Record<string, boolean>} visibility */
export function isIndicatorVisibleOnResolution(resolutionId, visibility) {
  const group = resolutionGroupId(resolutionId);
  if (group === "days") {
    const id = String(resolutionId).toUpperCase();
    if (id === "W" || /^\d+W$/i.test(id)) return visibility.weeks !== false;
    if (id === "M" || /^\d+M$/i.test(id)) return visibility.months !== false;
    return visibility.days !== false;
  }
  if (group === "ticks") return visibility.ticks !== false;
  if (group === "seconds") return visibility.seconds !== false;
  if (group === "minutes") return visibility.minutes !== false;
  if (group === "hours") return visibility.hours !== false;
  return visibility.ranges !== false;
}
