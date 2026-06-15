/**
 * Core geometry for long/short position tools.
 * Two corner points define the time span and target/stop price extremes.
 */

/** @param {import("../../types.js").UserDrawing} drawing */
export function positionGeometry(drawing) {
  const p0 = drawing.points[0];
  const p1 = drawing.points[1];
  if (!p0 || !p1) return null;

  const isLong = drawing.type === "long-position";
  const tStart = Math.min(p0.time, p1.time);
  const tEnd = Math.max(p0.time, p1.time);
  const topPrice = Math.max(p0.price, p1.price);
  const bottomPrice = Math.min(p0.price, p1.price);
  const targetPrice = isLong ? topPrice : bottomPrice;
  const stopPrice = isLong ? bottomPrice : topPrice;
  const storedEntry = Number(drawing.positionEntryPrice);
  const entryPrice = Number.isFinite(storedEntry) ? storedEntry : (topPrice + bottomPrice) / 2;
  const risk = Math.abs(entryPrice - stopPrice);
  const reward = Math.abs(targetPrice - entryPrice);
  const rr = risk > 0 ? reward / risk : 0;

  return {
    isLong,
    tStart,
    tEnd,
    entryPrice,
    targetPrice,
    stopPrice,
    risk,
    reward,
    rr,
  };
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function positionAnchorPoints(drawing) {
  const geom = positionGeometry(drawing);
  if (!geom) return drawing.points;
  const { tStart, tEnd, entryPrice, targetPrice, stopPrice } = geom;
  return [
    { time: tStart, price: targetPrice },
    { time: tEnd, price: targetPrice },
    { time: tEnd, price: stopPrice },
    { time: tStart, price: stopPrice },
    { time: tStart, price: entryPrice },
    { time: tEnd, price: entryPrice },
  ];
}

/**
 * Vertical price level for the center stats badge (weighted by risk/reward).
 * @param {ReturnType<typeof positionGeometry>} geom
 */
export function positionStatsCenterPrice(geom) {
  if (!geom) return 0;
  const span = geom.targetPrice - geom.stopPrice;
  if (span === 0) return geom.entryPrice;
  const t = geom.rr / (1 + geom.rr);
  return geom.stopPrice + span * t;
}

/**
 * Keep TP/SL on the correct side of entry (TradingView-style limits).
 * Long: TP above entry, SL below. Short: TP below entry, SL above.
 * @param {number} price
 * @param {number} entryPrice
 * @param {boolean} isLong
 * @param {"target" | "stop"} zone
 * @param {number} [tick]
 */
export function clampPositionLevelPrice(price, entryPrice, isLong, zone, tick = 0.01) {
  const minDist = tick > 0 ? tick : 0.00000001;
  if (isLong) {
    if (zone === "target") return price <= entryPrice ? entryPrice + minDist : price;
    return price >= entryPrice ? entryPrice - minDist : price;
  }
  if (zone === "target") return price >= entryPrice ? entryPrice - minDist : price;
  return price <= entryPrice ? entryPrice + minDist : price;
}

/**
 * @param {ReturnType<typeof positionGeometry>} geom
 * @param {number} x1
 * @param {number} x2
 */
export function positionScreenBounds(geom, x1, x2) {
  return {
    left: Math.min(x1, x2),
    right: Math.max(x1, x2),
    width: Math.abs(x2 - x1),
  };
}
