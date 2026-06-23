/** @param {number | { year: number, month: number, day: number }} t */
export function toDate(t) {
  if (typeof t === "number") return new Date(t * 1000);
  if (t && typeof t === "object" && "year" in t) {
    return new Date(t.year, t.month - 1, t.day);
  }
  return new Date(0);
}

/** @param {number} price @param {number} precision */
export function formatDisplayPrice(price, precision) {
  if (price == null || !Number.isFinite(price)) return "";
  const p = Math.max(0, Number(precision) || 0);
  return Number(price).toLocaleString(undefined, {
    minimumFractionDigits: p,
    maximumFractionDigits: p,
  });
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

/** @param {{ time: number }} bar */
export function barTimeLabel(bar) {
  return dateTime12h(toDate(bar.time));
}
