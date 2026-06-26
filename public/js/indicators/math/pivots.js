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
  for (let i = 0; i < cmpUtc.length; i++) {
    const utcT = cmpUtc[i]?.time;
    if (utcT != null) byUtc.set(utcT, cmpUtc[i]);
    const chartT = cmpChart[i]?.time;
    if (chartT != null) byChart.set(chartT, cmpUtc[i]);
  }
  return primaryChart.map((b, i) => {
    const utcT = primaryUtc[i]?.time;
    if (utcT != null && byUtc.has(utcT)) return byUtc.get(utcT);
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
