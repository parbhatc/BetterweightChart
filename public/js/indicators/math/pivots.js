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

/** @param {number} price @param {object | null | undefined} symbolInfo */
function formatPivotPrice(price, symbolInfo) {
  const scale = symbolInfo?.pricescale ?? 100;
  const minmov = symbolInfo?.minmov ?? 1;
  const decimals = Math.max(2, Math.round(Math.log10(scale / minmov)));
  return Number(price).toFixed(decimals);
}

/**
 * @param {object[]} utcBars
 * @param {object[]} chartBars
 * @param {object} inputs
 * @param {object} style
 * @param {object | null} [symbolInfo]
 */
export function computePivotLabels(utcBars, chartBars, inputs, style, symbolInfo = null) {
  const leftH = Math.max(1, Number(inputs.leftLenH) || 10);
  const rightH = Math.max(1, Number(inputs.rightLenH) || 10);
  const leftL = Math.max(1, Number(inputs.leftLenL) || 10);
  const rightL = Math.max(1, Number(inputs.rightLenL) || 10);

  /** @type {object[]} */
  const labels = [];

  for (let i = 0; i < utcBars.length; i++) {
    const ph = pivotHighAt(utcBars, i, leftH, rightH);
    if (ph != null) {
      const pivotIdx = pivotBarIndex(i, rightH);
      const chartTime = chartBars[pivotIdx]?.time;
      if (chartTime == null) continue;
      labels.push({
        time: chartTime,
        price: ph,
        kind: "high",
        text: formatPivotPrice(ph, symbolInfo),
        textColor: style.textColorH ?? "#131722",
        bgColor: style.labelColorH ?? "#ffffff",
      });
    }

    const pl = pivotLowAt(utcBars, i, leftL, rightL);
    if (pl != null) {
      const pivotIdx = pivotBarIndex(i, rightL);
      const chartTime = chartBars[pivotIdx]?.time;
      if (chartTime == null) continue;
      labels.push({
        time: chartTime,
        price: pl,
        kind: "low",
        text: formatPivotPrice(pl, symbolInfo),
        textColor: style.textColorL ?? "#131722",
        bgColor: style.labelColorL ?? "#ffffff",
      });
    }
  }

  return labels;
}
