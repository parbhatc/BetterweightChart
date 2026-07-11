import { firstBarIndexAtOrAfter, lastBarIndexAtOrBefore } from "/js/indicators/script/barIndex.js";
import {
  createMatrix,
  extendMatrix,
  sweepMatrix,
  takenLiquidityKey,
} from "/js/indicators/script/liquidityMatrix.js";
import { buildReleasePlan } from "/js/news/events.js";
import { htfBarCompleteAt } from "/js/indicators/security/htfPolicy.js";
import { buildLevelsEngineConfig } from "./config.js";
import { applyClusterConfluence } from "./confluence.js";
import { onHtfBarClose } from "./htfPivots.js";
import { resolveHtfAggSeries } from "./htfSeries.js";
import {
  retroactiveSweep,
  retroactiveSweepLine,
  retroactiveSweepSessionLine,
} from "./sweep.js";
import {
  sweepReleaseLines,
  sweepSessionLines,
  walkReleaseBar,
  walkSessionBar,
} from "./sessions.js";

/** @typedef {import("/js/indicators/script/liquidityMatrix.js").LiqLine} LiqLine */

/**
 * Cap each matrix's swept levels to the `maxSwept` most recent (by sweepTime),
 * but ALSO retain any swept level that is a same-price/same-kind twin of a level
 * still displayed on another timeframe (active, or within another matrix's kept
 * swept set). Without this, a "1H & 15m" swept confluence loses its 15m tag once
 * ~maxSwept unrelated 15m levels sweep later and evict the 15m twin, while the
 * 1H twin survives — the label repaints from "1H & 15m" to "1H".
 * @param {Record<string, { active: LiqLine[]; swept: LiqLine[] }>} matrices
 * @param {number} maxSwept @param {number} proximity
 */
function capSweptConfluenceAware(matrices, maxSwept, proximity) {
  if (!(maxSwept > 0)) return;
  const mats = Object.values(matrices);

  /** @type {Map<object, Set<LiqLine>>} */
  const keep = new Map();
  /** @type {LiqLine[]} anchors whose price protects same-price twins */
  const anchors = [];
  for (const m of mats) {
    const recent = [...m.swept]
      .sort((a, b) => (b.sweepTime ?? 0) - (a.sweepTime ?? 0))
      .slice(0, maxSwept);
    keep.set(m, new Set(recent));
    anchors.push(...m.active, ...recent);
  }

  for (const m of mats) {
    const kept = keep.get(m);
    for (const lvl of m.swept) {
      if (kept.has(lvl)) continue;
      if (
        anchors.some(
          (a) => a !== lvl && a.kind === lvl.kind && Math.abs(a.price - lvl.price) <= proximity,
        )
      ) {
        kept.add(lvl);
      }
    }
    m.swept = m.swept.filter((lvl) => kept.has(lvl));
  }
}

/**
 * @param {object[]} bars — UTC OHLC bars (chart resolution, usually 1m)
 * @param {number} anchorUnix
 * @param {object} opts
 */
export function runLevelsEngine(bars, anchorUnix, opts) {
  if (!bars.length || anchorUnix == null) return { lines: [], htfState: {} };

  const endIdx = lastBarIndexAtOrBefore(bars, anchorUnix);
  if (endIdx < 19) return { lines: [], htfState: {} };

  const pivotLeft = Math.max(1, Number(opts.pivotLeftBars) || 1);
  const pivotRight = Math.max(1, Number(opts.pivotRightBars) || 1);
  const maxBarsBack = Math.max(10, Number(opts.maxBarsBack) || 300);
  const maxUnswept = Math.max(1, Number(opts.maxUnswept) || 15);
  const maxSwept = Math.max(0, Number(opts.maxSwept) || 5);
  const maxSessions = Math.max(1, Number(opts.maxSessions) || 3);
  const proximity = (Number(opts.tickSize) || 0.25) * 6;
  const showLabels = opts.showLabels !== false;
  const confHi = String(opts.confHiColor ?? "#9400d3");
  const confLo = String(opts.confLoColor ?? "#ffaa00");
  const mergeConfluence = opts.mergeConfluence !== false;

  const { htf, sessions } = buildLevelsEngineConfig(opts.timeLayers ?? [], opts.sessionLayers ?? [], {
    htfStyles: opts.htfStyles,
    sessionDefs: opts.sessionDefs,
  });

  /** @type {Record<string, { h: number[]; l: number[]; t: number[] }>} */
  const hists = {};
  /** @type {Record<string, { active: LiqLine[]; swept: LiqLine[] }>} */
  const matrices = {};
  /** @type {Record<string, { agg: object[]; chartTimes: (number | undefined)[]; ptr: number; source: string }>} */
  const htfState = {};

  for (const cfg of htf) {
    hists[cfg.slot] = { h: [], l: [], t: [] };
    matrices[`${cfg.slot}H`] = createMatrix();
    matrices[`${cfg.slot}L`] = createMatrix();
    const { agg, chartTimes, source } = resolveHtfAggSeries(cfg, bars, opts.chartBars ?? bars, {
      ...opts,
      pivotLeftBars: pivotLeft,
      pivotRightBars: pivotRight,
      anchorUnix,
    });
    htfState[cfg.slot] = { agg, chartTimes, ptr: 1, source };
  }

  /** @type {LiqLine[]} */
  const sessionLines = [];
  /** @type {Record<string, { active: boolean; hi?: LiqLine; lo?: LiqLine; born?: number }>} */
  const sessState = {};
  /** @type {Record<string, number[]>} */
  const sessBornTimes = {};
  for (const cfg of sessions) {
    sessState[cfg.label] = { active: false };
    sessBornTimes[cfg.label] = [];
  }

  /** @type {LiqLine[]} */
  const releaseLines = [];
  const releaseBornDays = new Set();
  const takenLiquidity = new Set();
  const releasePlan =
    opts.releasePlan instanceof Map
      ? opts.releasePlan
      : buildReleasePlan(opts.newsByDay ?? {}, opts.newsRows ?? []);
  const chartSec = Math.max(1, Number(opts.chartSec) || 60);
  const sessionLookback = sessions.length
    ? Math.max(maxBarsBack, Math.ceil((30 * 3600) / chartSec))
    : maxBarsBack;

  let startIdx = 19;
  for (const cfg of htf) {
    const first = htfState[cfg.slot]?.agg?.[0]?.time;
    if (first == null) continue;
    const pivotBuf = (pivotLeft + pivotRight) * cfg.tfSec;
    startIdx = Math.max(startIdx, firstBarIndexAtOrAfter(bars, first - pivotBuf));
  }
  if (sessions.length) {
    startIdx = Math.max(startIdx, Math.max(19, endIdx - sessionLookback + 1));
  }
  if (startIdx > endIdx) return { lines: [], htfState };

  const chartBars = opts.chartBars ?? bars;
  const slotTfSec = Object.fromEntries(htf.map((c) => [c.slot, c.tfSec]));

  for (let i = startIdx; i <= endIdx; i++) {
    const bar = bars[i];
    const chartTime = chartBars[i]?.time ?? bar.time;
    const htfSlotsClosedThisBar = new Set();

    for (const cfg of htf) {
      const state = htfState[cfg.slot];
      if (!state.agg.length) continue;
      const tfSec = cfg.tfSec;
      let { ptr } = state;
      const { agg, chartTimes } = state;
      while (ptr <= agg.length) {
        const closeIdx = ptr - 1;
        if (closeIdx < 0) {
          ptr = 1;
          continue;
        }
        if (closeIdx >= agg.length) break;
        if (bar.time < htfBarCompleteAt(agg[closeIdx].time, tfSec)) break;
        const confirmUtc = htfBarCompleteAt(agg[closeIdx].time, tfSec);
        const confirmBarIdx = Math.min(
          Math.max(0, firstBarIndexAtOrAfter(bars, confirmUtc)),
          bars.length - 1,
        );
        const confirmChartTime = chartBars[confirmBarIdx]?.time ?? chartTimes[closeIdx] ?? chartTime;
        onHtfBarClose(
          agg,
          closeIdx,
          hists[cfg.slot],
          matrices[`${cfg.slot}H`],
          matrices[`${cfg.slot}L`],
          cfg,
          confirmUtc,
          confirmChartTime,
          maxUnswept,
          proximity,
          showLabels,
          pivotLeft,
          pivotRight,
          chartTimes,
          bars,
          chartBars,
          confirmBarIdx,
          maxSwept,
          takenLiquidity,
          endIdx,
        );
        htfSlotsClosedThisBar.add(cfg.slot);
        ptr += 1;
      }
      state.ptr = ptr;
    }

    for (const key of Object.keys(matrices)) {
      const m = matrices[key];
      const slot = key.slice(0, -1);
      const deferHtfSweep =
        opts.replayHostControlled &&
        chartSec < (slotTfSec[slot] ?? chartSec) &&
        !htfSlotsClosedThisBar.has(slot);
      if (!deferHtfSweep) {
        sweepMatrix(m, bar, chartTime, key.endsWith("H") ? "high" : "low", maxSwept, takenLiquidity);
      }
      extendMatrix(m, bar.time, chartTime);
    }

    for (const cfg of sessions) {
      walkSessionBar(
        bar,
        chartTime,
        cfg,
        sessState,
        sessBornTimes,
        sessionLines,
        maxSessions,
        showLabels,
      );
    }
    sweepSessionLines(bar, chartTime, sessionLines, sessions, takenLiquidity);
    walkReleaseBar(bar, chartTime, chartSec, releasePlan, releaseBornDays, releaseLines, showLabels);
    sweepReleaseLines(bar, chartTime, releaseLines, takenLiquidity);
  }

  for (const m of Object.values(matrices)) {
    for (const lvl of [...m.active]) {
      retroactiveSweep(m, lvl, bars, chartBars, endIdx, maxSwept, takenLiquidity);
    }
  }
  for (const sl of sessionLines) {
    retroactiveSweepSessionLine(sl, sessions, bars, chartBars, endIdx, takenLiquidity);
  }
  for (const rl of releaseLines) {
    retroactiveSweepLine(rl, bars, chartBars, endIdx, takenLiquidity);
  }

  capSweptConfluenceAware(matrices, maxSwept, proximity);

  let out = [];
  for (const m of Object.values(matrices)) {
    out.push(...m.active, ...m.swept);
  }
  out.push(...sessionLines.filter((l) => !l._drop));
  out.push(...releaseLines.filter((l) => !l._drop));

  if (mergeConfluence) {
    out = applyClusterConfluence(out, proximity, confHi, confLo);
  }

  const visStart = bars[0].time;
  out = out.filter((l) => (l.endTime ?? l.startTime) >= visStart && l.startTime <= bars[endIdx].time);

  for (const lvl of out) {
    if (lvl.swept && lvl.sweepTime != null) {
      lvl.endTime = lvl.sweepTime;
      if (lvl.sweepChartTime != null) lvl.endChartTime = lvl.sweepChartTime;
    }
    if (!showLabels || lvl.showLabel === false) {
      lvl.label = "";
    } else if (lvl.label && !lvl.label.includes("(")) {
      lvl.label = `${lvl.label} (${Number(lvl.price).toFixed(2)})`;
    }
  }

  const sweptPriceKeys = new Set(out.filter((l) => l.swept).map((l) => takenLiquidityKey(l)));
  if (sweptPriceKeys.size) {
    out = out.filter(
      (l) => l.swept || l.sessionBorn != null || !sweptPriceKeys.has(takenLiquidityKey(l)),
    );
  }

  return { lines: out, htfState };
}
