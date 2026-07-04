/** @typedef {{ price: number; startTime: number; endTime: number; bornTime?: number; startChartTime?: number; endChartTime?: number; sweepChartTime?: number; label: string; color: string; lineWidth: number; kind: "high"|"low"; swept: boolean; sweepTime?: number; showLabel?: boolean; sessionBorn?: number; _drop?: boolean }} LiqLine */

/** @returns {{ active: LiqLine[]; swept: LiqLine[] }} */
export function createMatrix() {
  return { active: [], swept: [] };
}

/** @param {LiqLine} lvl */
export function takenLiquidityKey(lvl) {
  return `${lvl.kind}|${lvl.startTime}|${Math.round(lvl.price * 100)}`;
}

/** @param {LiqLine} lvl */
export function levelBornTime(lvl) {
  return lvl.bornTime ?? lvl.endTime ?? lvl.startTime;
}

/** @param {object} bar @param {"high"|"low"} kind @param {number} price */
export function barSweepsLevel(bar, kind, price) {
  return kind === "high" ? bar.high >= price : bar.low <= price;
}

/** @param {LiqLine} lvl @param {number} utc @param {number} [chartTime] @param {Set<string>} [takenLiquidity] */
export function markSwept(lvl, utc, chartTime, takenLiquidity) {
  lvl.swept = true;
  lvl.sweepTime = utc;
  lvl.endTime = utc;
  if (chartTime != null) {
    lvl.sweepChartTime = chartTime;
    lvl.endChartTime = chartTime;
  }
  takenLiquidity?.add(takenLiquidityKey(lvl));
}

/** @param {LiqLine} level @param {number} proximity @param {Set<string>} [takenLiquidity] */
function isLiquidityPriceTaken(level, proximity, takenLiquidity) {
  if (!takenLiquidity?.size) return false;
  const priceKey = Math.round(level.price * 100);
  for (const key of takenLiquidity) {
    const [kind, startStr, priceStr] = key.split("|");
    if (kind !== level.kind) continue;
    if (Number(startStr) !== level.startTime) continue;
    if (Math.abs(priceKey - Number(priceStr)) <= Math.round(proximity * 100)) return true;
  }
  return false;
}

/** @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix @param {LiqLine} level @param {number} proximity */
function hasDuplicatePivot(matrix, level, proximity) {
  const pool = [...matrix.active, ...matrix.swept];
  return pool.some(
    (l) =>
      l.kind === level.kind &&
      l.startTime === level.startTime &&
      Math.abs(l.price - level.price) <= proximity,
  );
}

/** @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix @param {LiqLine} level @param {number} proximity @param {Set<string>} [takenLiquidity] */
function hasSweptLiquidityAtPrice(matrix, level, proximity, takenLiquidity) {
  if (isLiquidityPriceTaken(level, proximity, takenLiquidity)) return true;
  return matrix.swept.some(
    (l) =>
      l.kind === level.kind &&
      l.swept &&
      l.sweepTime != null &&
      l.startTime === level.startTime &&
      Math.abs(l.price - level.price) <= proximity,
  );
}

/**
 * @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix
 * @param {LiqLine} level
 * @param {number} maxUnswept
 * @param {number} proximity
 * @param {Set<string>} [takenLiquidity]
 */
export function birthLevel(matrix, level, maxUnswept, proximity, takenLiquidity) {
  if (hasDuplicatePivot(matrix, level, proximity)) return null;
  if (hasSweptLiquidityAtPrice(matrix, level, proximity, takenLiquidity)) return null;
  const last = matrix.active[matrix.active.length - 1];
  if (
    last &&
    last.startTime === level.startTime &&
    Math.abs(last.price - level.price) <= proximity
  ) {
    return null;
  }
  matrix.active.push({ ...level, swept: false });
  while (matrix.active.length > maxUnswept) matrix.active.shift();
  return matrix.active[matrix.active.length - 1];
}

/** @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix @param {object} bar @param {number} chartTime @param {"high"|"low"} kind @param {number} maxSwept @param {Set<string>} [takenLiquidity] */
export function sweepMatrix(matrix, bar, chartTime, kind, maxSwept, takenLiquidity) {
  for (let i = matrix.active.length - 1; i >= 0; i--) {
    const lvl = matrix.active[i];
    if (lvl.kind !== kind) continue;
    if (bar.time <= levelBornTime(lvl)) continue;
    if (!barSweepsLevel(bar, kind, lvl.price)) continue;
    markSwept(lvl, bar.time, chartTime, takenLiquidity);
    const moved = matrix.active.splice(i, 1)[0];
    matrix.swept.push(moved);
    while (maxSwept > 0 && matrix.swept.length > maxSwept) matrix.swept.shift();
  }
}

/** @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix @param {number} utc @param {number} chartTime */
export function extendMatrix(matrix, utc, chartTime) {
  for (const lvl of matrix.active) {
    if (lvl.swept) continue;
    lvl.endTime = utc;
    lvl.endChartTime = chartTime;
  }
}
