import { birthLevel } from "/js/indicators/script/liquidityMatrix.js";
import { retroactiveSweep } from "./sweep.js";

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

  if (isHigh) {
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
  if (isLow) {
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
