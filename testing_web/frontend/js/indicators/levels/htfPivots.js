import { barSweepsLevel, birthLevel } from "/js/indicators/script/liquidityMatrix.js";
import { firstBarIndexAtOrAfter } from "/js/indicators/script/barIndex.js";
import { retroactiveSweep } from "./sweep.js";

/**
 * True when the level's liquidity was already taken between the END of the
 * pivot's HTF bucket and the pivot's confirmation time. An HTF pivot only
 * confirms `pivotRight` HTF bars after the pivot bar; if price traded through
 * the level in that gap, the liquidity was consumed before the level ever
 * became actionable — birthing it then retro-joins an already-swept cluster
 * and repaints the swept label (e.g. "1H & 15m" gaining a "4H" tag 30 minutes
 * after the sweep). Scanned on chart (LTF) bars, which also compensates for
 * lagging HTF series data.
 * @param {object[]} bars @param {number} pivotEndUtc @param {number} confirmUtc
 * @param {"high"|"low"} kind @param {number} price
 */
function liquidityTakenBeforeConfirm(bars, pivotEndUtc, confirmUtc, kind, price) {
  const from = Math.max(0, firstBarIndexAtOrAfter(bars, pivotEndUtc));
  for (let j = from; j < bars.length; j++) {
    const b = bars[j];
    if (!b || b.time >= confirmUtc) break;
    if (barSweepsLevel(b, kind, price)) return true;
  }
  return false;
}

/**
 * @param {object[]} agg
 * @param {number} idx
 * @param {{ h: number[]; l: number[]; t: number[] }} hist
 * @param {{ active: object[]; swept: object[] }} matrixH
 * @param {{ active: object[]; swept: object[] }} matrixL
 * @param {{ label: string; hiColor: string; loColor: string }} cfg
 * @param {number} endTime
 * @param {number} endChartTime
 * @param {number} maxUnswept
 * @param {number} proximity
 * @param {boolean} showLabels
 * @param {number} pivotLeft
 * @param {number} pivotRight
 * @param {(number | undefined)[]} chartTimes
 * @param {object[]} bars
 * @param {object[]} chartBars
 * @param {number} barIndex
 * @param {number} maxSwept
 * @param {Set<string>} [takenLiquidity]
 * @param {number} scanToBarIdx
 */
export function onHtfBarClose(
  agg,
  idx,
  hist,
  matrixH,
  matrixL,
  cfg,
  endTime,
  endChartTime,
  maxUnswept,
  proximity,
  showLabels,
  pivotLeft,
  pivotRight,
  chartTimes,
  bars,
  chartBars,
  barIndex,
  maxSwept,
  takenLiquidity,
  scanToBarIdx,
) {
  const c = agg[idx];
  hist.h.push(c.high);
  hist.l.push(c.low);
  hist.t.push(c.time);
  const window = pivotLeft + pivotRight + 1;
  while (hist.h.length > window) {
    hist.h.shift();
    hist.l.shift();
    hist.t.shift();
  }
  if (hist.h.length < window) return;

  const p = pivotLeft;
  const pivotAggIdx = idx - pivotRight;
  const startChartTime = pivotAggIdx >= 0 ? chartTimes[pivotAggIdx] : chartTimes[idx];
  let isHigh = true;
  let isLow = true;
  for (let j = 0; j < window; j++) {
    if (j === p) continue;
    if (hist.h[j] >= hist.h[p]) isHigh = false;
    if (hist.l[j] <= hist.l[p]) isLow = false;
  }

  const pivotEndUtc = hist.t[p] + (Number(cfg.tfSec) || 0);

  if (isHigh && !liquidityTakenBeforeConfirm(bars, pivotEndUtc, endTime, "high", hist.h[p])) {
    const born = birthLevel(
      matrixH,
      {
        price: hist.h[p],
        startTime: hist.t[p],
        startChartTime,
        bornTime: endTime,
        endTime,
        endChartTime,
        label: `${cfg.label} High`,
        color: cfg.hiColor,
        lineWidth: 2,
        kind: "high",
        swept: false,
        showLabel: showLabels,
      },
      maxUnswept,
      proximity,
      takenLiquidity,
    );
    retroactiveSweep(matrixH, born, bars, chartBars, scanToBarIdx, maxSwept, takenLiquidity);
  }
  if (isLow && !liquidityTakenBeforeConfirm(bars, pivotEndUtc, endTime, "low", hist.l[p])) {
    const born = birthLevel(
      matrixL,
      {
        price: hist.l[p],
        startTime: hist.t[p],
        startChartTime,
        bornTime: endTime,
        endTime,
        endChartTime,
        label: `${cfg.label} Low`,
        color: cfg.loColor,
        lineWidth: 2,
        kind: "low",
        swept: false,
        showLabel: showLabels,
      },
      maxUnswept,
      proximity,
      takenLiquidity,
    );
    retroactiveSweep(matrixL, born, bars, chartBars, scanToBarIdx, maxSwept, takenLiquidity);
  }
}
