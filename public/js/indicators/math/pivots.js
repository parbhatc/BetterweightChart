/**
 * Pine ta.pivothigh / ta.pivotlow at confirmation bar `i`.
 * Pivot occurred at bar `i - right`; label time should use that bar.
 */

/** @param {{ high: number }[]} bars @param {number} i @param {number} left @param {number} right */
export function pivotHighAt(bars, i, left, right) {
  const pivotRange = left + right;
  if (i < pivotRange || i >= bars.length) return null;

  const candidateIdx = i - right;
  let maxVal = -Infinity;
  for (let j = i - pivotRange; j <= i; j++) {
    maxVal = Math.max(maxVal, bars[j].high);
  }

  let lastMaxIdx = i - pivotRange;
  for (let j = i - pivotRange; j <= i; j++) {
    if (bars[j].high === maxVal) lastMaxIdx = j;
  }

  if (lastMaxIdx !== candidateIdx) return null;
  return bars[candidateIdx].high;
}

/** @param {{ low: number }[]} bars @param {number} i @param {number} left @param {number} right */
export function pivotLowAt(bars, i, left, right) {
  const pivotRange = left + right;
  if (i < pivotRange || i >= bars.length) return null;

  const candidateIdx = i - right;
  let minVal = Infinity;
  for (let j = i - pivotRange; j <= i; j++) {
    minVal = Math.min(minVal, bars[j].low);
  }

  let lastMinIdx = i - pivotRange;
  for (let j = i - pivotRange; j <= i; j++) {
    if (bars[j].low === minVal) lastMinIdx = j;
  }

  if (lastMinIdx !== candidateIdx) return null;
  return bars[candidateIdx].low;
}

/** Strict pivot: the candidate must be higher than every surrounding bar. */
export function pivotHighStrictAt(bars, i, left, right) {
  const pivotRange = left + right;
  if (i < pivotRange || i >= bars.length) return null;
  const candidateIdx = i - right;
  const candidate = bars[candidateIdx].high;
  for (let j = i - pivotRange; j <= i; j++) {
    if (j !== candidateIdx && bars[j].high >= candidate) return null;
  }
  return candidate;
}

/** Strict pivot: the candidate must be lower than every surrounding bar. */
export function pivotLowStrictAt(bars, i, left, right) {
  const pivotRange = left + right;
  if (i < pivotRange || i >= bars.length) return null;
  const candidateIdx = i - right;
  const candidate = bars[candidateIdx].low;
  for (let j = i - pivotRange; j <= i; j++) {
    if (j !== candidateIdx && bars[j].low <= candidate) return null;
  }
  return candidate;
}

/** @param {number} confirmBarIndex @param {number} right */
export function pivotBarIndex(confirmBarIndex, right) {
  return confirmBarIndex - right;
}

/** @param {object} inputs @param {string} leftKey @param {string} rightKey @param {number} [def] @returns {[number, number]} */
export function pivotLens(inputs, leftKey, rightKey, def = 10) {
  return [
    Math.max(1, Number(inputs[leftKey]) || def),
    Math.max(1, Number(inputs[rightKey]) || def),
  ];
}

/**
 * Return true when two intraday pivots are separated by a closed-market gap.
 *
 * The normal cadence is inferred from the loaded bars so this works for every
 * intraday resolution without relying on a resolution string. Daily/weekly
 * series intentionally remain continuous: skipped weekend dates are normal
 * bars on those timeframes and can still form valid higher-timeframe SMT.
 *
 * @param {{ time: number }[]} bars
 * @param {number} startIdx
 * @param {number} endIdx
 */
export function hasIntradaySessionBreak(bars, startIdx, endIdx) {
  if (!Array.isArray(bars) || bars.length < 2) return false;

  const deltas = [];
  for (let i = 1; i < bars.length; i++) {
    const delta = Number(bars[i]?.time) - Number(bars[i - 1]?.time);
    if (Number.isFinite(delta) && delta > 0) deltas.push(delta);
  }
  if (!deltas.length) return false;

  deltas.sort((a, b) => a - b);
  const cadence = deltas[Math.floor(deltas.length / 2)];
  if (cadence >= 24 * 60 * 60) return false;

  // Ignore routine pauses while still catching the Friday -> Sunday reopen.
  const breakThreshold = Math.max(6 * 60 * 60, cadence * 3);
  const from = Math.max(1, Math.min(startIdx, endIdx) + 1);
  const to = Math.min(bars.length - 1, Math.max(startIdx, endIdx));
  for (let i = from; i <= to; i++) {
    if (Number(bars[i]?.time) - Number(bars[i - 1]?.time) > breakThreshold) return true;
  }
  return false;
}

/**
 * Map compare OHLCV onto primary bars (same length as primaryChart).
 * Prefer UTC timestamp match, then chart display time. Missing bars are null.
 * @param {object[]} primaryChart
 * @param {object[]} primaryUtc
 * @param {object[]} cmpUtc
 * @param {object[]} cmpChart
 */
export function alignUtcBarsByChartTime(primaryChart, primaryUtc, cmpUtc, cmpChart) {
  /** @type {Map<number, object>} */
  const byUtc = new Map();
  /** @type {Map<number, object>} */
  const byChart = new Map();
  // The chart-time fallback is only meaningful when the compare series carries
  // real tz-aligned chart times. Store/cache-sourced series reuse UTC bars as
  // chartBars — falling back there matches a compare bar hours away (chart
  // display time vs UTC), fabricating divergences on missing-bar gaps.
  let hasDistinctChartTimes = false;
  for (let i = 0; i < cmpUtc.length; i++) {
    const utcT = cmpUtc[i]?.time;
    if (utcT != null) byUtc.set(utcT, cmpUtc[i]);
    const chartT = cmpChart[i]?.time;
    if (chartT != null) {
      byChart.set(chartT, cmpUtc[i]);
      if (chartT !== utcT) hasDistinctChartTimes = true;
    }
  }
  return primaryChart.map((b, i) => {
    const utcT = primaryUtc[i]?.time;
    if (utcT != null && byUtc.has(utcT)) return byUtc.get(utcT);
    if (!hasDistinctChartTimes && utcT != null && b.time !== utcT) return null;
    return byChart.get(b.time) ?? null;
  });
}

/** @param {({ high: number } | null)[]} bars @param {number} i @param {number} left @param {number} right */
export function pivotHighAtSparse(bars, i, left, right) {
  const pivotRange = left + right;
  if (i < pivotRange || i >= bars.length) return null;
  for (let j = i - pivotRange; j <= i; j++) {
    if (!bars[j]) return null;
  }
  return pivotHighAt(/** @type {{ high: number }[]} */ (bars), i, left, right);
}

/** @param {({ low: number } | null)[]} bars @param {number} i @param {number} left @param {number} right */
export function pivotLowAtSparse(bars, i, left, right) {
  const pivotRange = left + right;
  if (i < pivotRange || i >= bars.length) return null;
  for (let j = i - pivotRange; j <= i; j++) {
    if (!bars[j]) return null;
  }
  return pivotLowAt(/** @type {{ low: number }[]} */ (bars), i, left, right);
}

/** @param {({ high: number } | null)[]} bars @param {number} i @param {number} left @param {number} right */
export function pivotHighStrictAtSparse(bars, i, left, right) {
  const pivotRange = left + right;
  if (i < pivotRange || i >= bars.length) return null;
  for (let j = i - pivotRange; j <= i; j++) if (!bars[j]) return null;
  return pivotHighStrictAt(/** @type {{ high: number }[]} */ (bars), i, left, right);
}

/** @param {({ low: number } | null)[]} bars @param {number} i @param {number} left @param {number} right */
export function pivotLowStrictAtSparse(bars, i, left, right) {
  const pivotRange = left + right;
  if (i < pivotRange || i >= bars.length) return null;
  for (let j = i - pivotRange; j <= i; j++) if (!bars[j]) return null;
  return pivotLowStrictAt(/** @type {{ low: number }[]} */ (bars), i, left, right);
}

/** Compare two prices using an instrument tick-size tolerance. */
export function pricesEqualWithinTicks(a, b, tickSize, toleranceTicks) {
  const tick = Number(tickSize);
  const tolerance = Math.max(0, Number(toleranceTicks) || 0);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(tick) || tick <= 0) return false;
  return Math.abs(a - b) <= tick * tolerance + tick * 1e-9;
}
