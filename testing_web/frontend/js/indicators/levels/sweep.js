import { firstBarIndexAtOrAfter } from "/js/indicators/script/barIndex.js";
import {
  barSweepsLevel,
  levelBornTime,
  markSwept,
} from "/js/indicators/script/liquidityMatrix.js";
import { etParts, hmToMinutes } from "/js/core/etTime.js";

/** @param {object} bar @param {string} releaseDay @param {string} releaseHm @param {number} chartSec */
export function barContainsReleaseHm(bar, releaseDay, releaseHm, chartSec) {
  const p = etParts(bar.time);
  if (p.ymd !== releaseDay) return false;
  const rel = hmToMinutes(releaseHm);
  if (rel == null) return false;
  const spanMin = Math.max(1, Math.floor(Math.max(60, chartSec) / 60));
  return p.mod <= rel && rel < p.mod + spanMin;
}

/**
 * @param {{ startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean }} cfg
 * @param {number} unix
 */
export function inSession(unix, cfg) {
  const { mod } = etParts(unix);
  const start = cfg.startH * 60 + cfg.startM;
  const end = cfg.endH * 60 + cfg.endM;
  if (cfg.crossesMidnight) return mod >= start || mod < end;
  return mod >= start && mod < end;
}

/** @param {import("/js/indicators/script/liquidityMatrix.js").LiqLine} lvl @param {object[]} bars @param {object[]} chartBars @param {number} toBarIndex @param {Set<string>} [takenLiquidity] */
export function retroactiveSweepLine(lvl, bars, chartBars, toBarIndex, takenLiquidity) {
  if (!lvl || lvl.swept || toBarIndex < 0) return false;
  const born = levelBornTime(lvl);
  const fromIdx = firstBarIndexAtOrAfter(bars, born + 1);
  for (let j = fromIdx; j <= toBarIndex; j++) {
    const b = bars[j];
    if (!b || b.time <= born) continue;
    const chartTime = chartBars[j]?.time ?? b.time;
    if (!barSweepsLevel(b, lvl.kind, lvl.price)) continue;
    markSwept(lvl, b.time, chartTime, takenLiquidity);
    return true;
  }
  return false;
}

/** @param {import("/js/indicators/script/liquidityMatrix.js").LiqLine} sl @param {{ label: string; startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean }[]} sessions @param {object[]} bars @param {object[]} chartBars @param {number} toBarIndex @param {Set<string>} [takenLiquidity] */
export function retroactiveSweepSessionLine(sl, sessions, bars, chartBars, toBarIndex, takenLiquidity) {
  if (!sl || sl.swept || toBarIndex < 0) return false;
  const cfg = sessions.find((c) => sl.label.startsWith(c.label));
  const born = levelBornTime(sl);
  const fromIdx = firstBarIndexAtOrAfter(bars, born + 1);
  for (let j = fromIdx; j <= toBarIndex; j++) {
    const b = bars[j];
    if (!b || b.time <= born) continue;
    if (cfg && inSession(b.time, cfg)) continue;
    const chartTime = chartBars[j]?.time ?? b.time;
    if (!barSweepsLevel(b, sl.kind, sl.price)) continue;
    markSwept(sl, b.time, chartTime, takenLiquidity);
    return true;
  }
  return false;
}

/** @param {{ active: import("/js/indicators/script/liquidityMatrix.js").LiqLine[]; swept: import("/js/indicators/script/liquidityMatrix.js").LiqLine[] }} matrix @param {import("/js/indicators/script/liquidityMatrix.js").LiqLine | null} lvl @param {object[]} bars @param {object[]} chartBars @param {number} toBarIndex @param {number} maxSwept @param {Set<string>} [takenLiquidity] */
export function retroactiveSweep(matrix, lvl, bars, chartBars, toBarIndex, maxSwept, takenLiquidity) {
  if (!lvl || lvl.swept || toBarIndex < 0) return;
  if (!retroactiveSweepLine(lvl, bars, chartBars, toBarIndex, takenLiquidity)) return;
  const idx = matrix.active.indexOf(lvl);
  if (idx >= 0) {
    const moved = matrix.active.splice(idx, 1)[0];
    matrix.swept.push(moved);
    // Capped later, confluence-aware (see capSweptConfluenceAware in run.js) so
    // same-price twins on different timeframes aren't evicted independently.
  }
}
