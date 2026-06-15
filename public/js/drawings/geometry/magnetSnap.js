/** @param {number} time @param {{ time: number }[]} bars */
function nearestBar(time, bars) {
  if (!bars.length) return null;
  let best = bars[0];
  let bestDist = Math.abs(bars[0].time - time);
  for (let i = 1; i < bars.length; i += 1) {
    const dist = Math.abs(bars[i].time - time);
    if (dist < bestDist) {
      best = bars[i];
      bestDist = dist;
    }
  }
  return best;
}

/**
 * @param {{ time: number, price: number }} point
 * @param {"off" | "weak" | "strong"} mode
 * @param {{ time: number, open?: number, high?: number, low?: number, close?: number }[]} bars
 */
export function applyMagnetSnap(point, mode, bars) {
  if (mode === "off" || !bars.length) return point;
  const bar = nearestBar(point.time, bars);
  if (!bar) return point;

  if (mode === "weak") {
    return { time: bar.time, price: bar.close ?? point.price };
  }

  const candidates = [
    { time: bar.time, price: bar.open },
    { time: bar.time, price: bar.high },
    { time: bar.time, price: bar.low },
    { time: bar.time, price: bar.close },
  ].filter((c) => c.price != null);

  let best = candidates[0] ?? point;
  let bestDist = Math.abs(point.price - best.price);
  for (let i = 1; i < candidates.length; i += 1) {
    const dist = Math.abs(point.price - candidates[i].price);
    if (dist < bestDist) {
      best = candidates[i];
      bestDist = dist;
    }
  }
  return best;
}
