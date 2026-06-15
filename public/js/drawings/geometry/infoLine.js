/** @param {number} n @param {number} precision */
export function fmtDrawingPrice(n, precision) {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

/** @param {number} sec */
export function formatDurationShort(sec) {
  if (sec < 60) return `${Math.round(sec)}s`;
  const minutes = Math.round(sec / 60);
  if (sec < 3600) return `${minutes}m`;
  const hours = Math.floor(sec / 3600);
  const rem = Math.round((sec % 3600) / 60);
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

/**
 * @param {{ price: number, time: number }} p0
 * @param {{ price: number, time: number }} p1
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {number} barSec
 * @param {number} precision
 */
export function computeInfoLineStats(p0, p1, a, b, barSec, precision) {
  const priceDiff = p1.price - p0.price;
  const boxBelow = p0.price - p1.price <= 0;
  const pct = p0.price !== 0 ? (priceDiff / p0.price) * 100 : 0;
  const pxDist = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = Math.atan2(a.y - b.y, b.x - a.x) * (180 / Math.PI);
  const sec = barSec > 0 ? barSec : 60;
  const timeSec = Math.abs(p1.time - p0.time);
  const barCount = Math.max(0, Math.round(timeSec / sec));
  const duration = formatDurationShort(timeSec);
  const sign = priceDiff >= 0 ? "" : "-";

  return {
    boxBelow,
    lines: [
      `${sign}${fmtDrawingPrice(Math.abs(priceDiff), precision)} (${Math.abs(pct).toFixed(2)})`,
      `${barCount} bars (${duration})`,
      `distance ${Math.round(pxDist)}px`,
      angle.toFixed(2),
    ],
  };
}
