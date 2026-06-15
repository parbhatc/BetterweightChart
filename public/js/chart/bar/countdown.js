const TICK_MS = 1000;

/** @param {number} totalSec */
export function formatBarCloseCountdown(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/** @param {number} barSec @param {number} [nowMs] */
export function secondsUntilBarClose(barSec, nowMs = Date.now()) {
  const sec = barSec > 0 ? barSec : 60;
  const now = Math.floor(nowMs / 1000);
  const barEnd = Math.floor(now / sec) * sec + sec;
  return barEnd - now;
}

export { TICK_MS };
