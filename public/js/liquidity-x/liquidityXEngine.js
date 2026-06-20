import { Aggregate } from "../utils/aggregate.js";
import { TF_MAP } from "../core/constants.js";
import { sliceBarsThroughAnchor } from "../levels/levelsCalc.js";
import { isFvgProvisional } from "../confluence/fvg.js";
import { PineColors } from "../utils/pineColors.js";

/** @typedef {{ id: string; kind: string; direction: "bull"|"bear"; startTime: number; endTime: number; top: number; bottom: number; fill: string; border: string; labelColor?: string; dashed?: boolean; label?: string; extendToRight?: boolean }} LxBox */
/** @typedef {{ startTime: number; endTime: number; y1: number; y2: number; color: string; width?: number; dashed?: boolean; label?: string; labelTime?: number; labelY?: number; labelStyle?: "high"|"low"; labelColor?: string; labelBg?: string }} LxLine */

// Pine Liquidity X defaults: color.new(base, transparency)
const COL = {
  bull: PineColors.fvgStyle(...PineColors.tv.green, 80),
  bear: PineColors.fvgStyle(...PineColors.tv.red, 80),
  pierce: {
    border: PineColors.rgb(...PineColors.tv.orange, 60),
    label: PineColors.rgb(...PineColors.tv.orange, 0),
  },
  htfBull: PineColors.htfStyle(...PineColors.tv.teal, 85, 50),
  htfBear: PineColors.htfStyle(...PineColors.tv.maroon, 85, 50),
  ifvg: PineColors.fvgStyle(255, 255, 0, 75),
  liveBull: PineColors.htfStyle(...PineColors.tv.green, 90, 50),
  liveBear: PineColors.htfStyle(...PineColors.tv.red, 90, 50),
  smtBullLine: "#ff1100",
  smtBearLine: "#2157f3",
  // Pine: textcolor = color.new(labelColor, 0); label bg = color.new(red/green, 80)
  smtBullLabelText: "#ff0000",
  smtBullLabelBg: "rgba(255, 0, 0, 0.20)",
  smtBearLabelText: "#008000",
  smtBearLabelBg: "rgba(0, 128, 0, 0.20)",
  eqHigh: "#ef4444",
  eqLow: "#22c55e",
};

/**
 * @param {{ high: number; low: number }[]} bars
 * @param {number} i
 * @param {number} left
 * @param {number} right
 */
function pivotHighAt(bars, i, left, right) {
  if (i < left || i + right >= bars.length) return null;
  const h = bars[i].high;
  for (let j = i - left; j <= i + right; j++) {
    if (j !== i && bars[j].high >= h) return null;
  }
  return h;
}

/** @param {{ high: number; low: number }[]} bars @param {number} i @param {number} left @param {number} right */
function pivotLowAt(bars, i, left, right) {
  if (i < left || i + right >= bars.length) return null;
  const l = bars[i].low;
  for (let j = i - left; j <= i + right; j++) {
    if (j !== i && bars[j].low <= l) return null;
  }
  return l;
}

/** @param {{ time: number; high: number; low: number }[]} agg @param {number} idx */
function fvgAt(agg, idx) {
  if (idx < 2) return null;
  const first = agg[idx - 2];
  const last = agg[idx];
  // Match Pine Liquidity X: bull top=low[0] bottom=high[2]; bear top=low[2] bottom=high[0]
  if (last.low > first.high) {
    return {
      direction: /** @type {const} */ ("bull"),
      top: last.low,
      bottom: first.high,
      startTime: first.time,
      confirmTime: last.time,
    };
  }
  if (last.high < first.low) {
    return {
      direction: /** @type {const} */ ("bear"),
      top: first.low,
      bottom: last.high,
      startTime: first.time,
      confirmTime: last.time,
    };
  }
  return null;
}

/** HTF / live FVG use extendToRight in the primitive (viewport edge), not a fixed end time. */
function htfPlaceholderEndTime(anchorTime) {
  return anchorTime;
}
function fvgExtendEndTime(agg, confirmIdx, extendBars, tfSec) {
  const confirmTime = agg[confirmIdx].time;
  const endIdx = confirmIdx + extendBars;
  if (endIdx < agg.length) return agg[endIdx].time;
  return confirmTime + extendBars * tfSec;
}

/**
 * @param {ReturnType<typeof aggregateCandles>} agg
 * @param {number} tfSec
 * @param {number} extendBars
 * @param {number} anchorTime
 * @param {boolean} autoDelete
 * @param {number} maxIfvg
 * @param {string} labelPrefix
 * @param {{ fill: string; border: string }} ifvgCol
 */
function runLocalFvgOnAgg(agg, tfSec, extendBars, anchorTime, autoDelete, maxIfvg, labelPrefix, ifvgCol) {
  /** @type {LxBox[]} */
  const boxes = [];
  /** @type {LxBox[]} */
  const ifvgs = [];
  /** @type {{ direction: "bull"|"bear"; top: number; bottom: number; startTime: number; confirmTime: number; confirmIdx: number; pierced: boolean }[]} */
  const active = [];

  for (let bi = 0; bi < agg.length; bi++) {
    const bar = agg[bi];
    if (bar.time > anchorTime) break;

    const born = fvgAt(agg, bi);
    if (born) {
      active.push({
        ...born,
        confirmIdx: bi,
        pierced: false,
      });
    }

    for (let i = active.length - 1; i >= 0; i--) {
      const z = active[i];
      if (bar.time < z.confirmTime) continue;

      const closePierced = z.direction === "bull" ? bar.close < z.bottom : bar.close > z.top;
      const wickPierced = z.direction === "bull" ? bar.low < z.bottom : bar.high > z.top;
      z.pierced = wickPierced;

      if (closePierced && autoDelete) {
        if (maxIfvg > 0) {
          const c = ifvgCol;
          ifvgs.push({
            id: `ifvg:${z.startTime}:${z.confirmTime}`,
            kind: "ifvg",
            direction: z.direction,
            startTime: z.startTime,
            endTime: bar.time,
            top: z.top,
            bottom: z.bottom,
            fill: c.fill,
            border: c.border,
            labelColor: c.label,
            label: "IFVG",
          });
          while (ifvgs.length > maxIfvg) ifvgs.shift();
        }
        active.splice(i, 1);
        continue;
      }

      if (!wickPierced && !closePierced) z.pierced = false;
    }
  }

  for (const z of active) {
    const base = z.direction === "bull" ? COL.bull : COL.bear;
    const endTime = fvgExtendEndTime(agg, z.confirmIdx, extendBars, tfSec);
    boxes.push({
      id: `local:${z.startTime}:${z.confirmTime}`,
      kind: "local-fvg",
      direction: z.direction,
      startTime: z.startTime,
      endTime,
      top: z.top,
      bottom: z.bottom,
      fill: base.fill,
      border: z.pierced ? COL.pierce.border : base.border,
      labelColor: z.pierced ? COL.pierce.label : base.label,
      dashed: z.pierced,
      label: labelPrefix,
    });
  }

  return { boxes, ifvgs };
}

/**
 * HTF FVGs through anchor — mitigate on HTF (15m) close only (matches findActive15mFvgs).
 * @param {ReturnType<typeof aggregateCandles>} htfAgg
 * @param {number} anchorTime
 * @param {string} htfLabel
 */
function runHtfFvgEngine(htfAgg, anchorTime, htfLabel) {
  /** @type {LxBox[]} */
  const boxes = [];

  for (let i = 2; i < htfAgg.length; i++) {
    if (htfAgg[i].time > anchorTime) break;
    const born = fvgAt(htfAgg, i);
    if (!born) continue;

    const tf15Sec = TF_MAP["15m"] ?? 900;
    if (isFvgProvisional({ confirmTime: born.confirmTime }, tf15Sec, anchorTime)) continue;

    let pierced = false;
    let filled = false;
    for (let j = i + 1; j < htfAgg.length; j++) {
      const bar = htfAgg[j];
      if (bar.time > anchorTime) break;
      const bucketComplete = bar.time + tf15Sec <= anchorTime;
      const closeFilled =
        bucketComplete &&
        (born.direction === "bull" ? bar.close < born.bottom : bar.close > born.top);
      const closePierced =
        born.direction === "bull" ? bar.close < born.bottom : bar.close > born.top;
      const closeInside =
        born.direction === "bull"
          ? bar.close >= born.bottom && bar.close <= born.top
          : bar.close >= born.bottom && bar.close <= born.top;
      const wickPierced =
        born.direction === "bull" ? bar.low < born.bottom : bar.high > born.top;
      if (closeFilled) {
        filled = true;
        break;
      }
      if (!bucketComplete) {
        // Forming 15m at replay tip — pierce only while close is displaced through; reclaim inside → normal.
        pierced = closePierced;
      } else if (closePierced) {
        pierced = true;
      } else if (closeInside) {
        pierced = false;
      } else if (wickPierced) {
        pierced = true;
      } else {
        pierced = false;
      }
    }
    if (filled) continue;

    const base = born.direction === "bull" ? COL.htfBull : COL.htfBear;
    boxes.push({
      id: `htf:${born.startTime}:${born.confirmTime}`,
      kind: "htf-fvg",
      direction: born.direction,
      startTime: born.startTime,
      endTime: htfPlaceholderEndTime(anchorTime),
      extendToRight: true,
      top: born.top,
      bottom: born.bottom,
      fill: base.fill,
      border: pierced ? COL.pierce.border : base.border,
      labelColor: pierced ? COL.pierce.label : base.label,
      dashed: pierced,
      label: htfLabel,
    });
  }

  return boxes;
}

/**
 * @param {ReturnType<typeof aggregateCandles>} htfAgg
 * @param {number} anchorTime
 */
function runLiveFormingFvg(htfAgg, anchorTime, chartTfSec) {
  if (htfAgg.length < 3) return /** @type {LxBox[]} */ ([]);

  let h0 = htfAgg[htfAgg.length - 1].high;
  let l0 = htfAgg[htfAgg.length - 1].low;
  let t0 = htfAgg[htfAgg.length - 1].time;
  let h1 = htfAgg.length >= 2 ? htfAgg[htfAgg.length - 2].high : h0;
  let l1 = htfAgg.length >= 2 ? htfAgg[htfAgg.length - 2].low : l0;
  let t1 = htfAgg.length >= 2 ? htfAgg[htfAgg.length - 2].time : t0;
  let h2 = htfAgg.length >= 3 ? htfAgg[htfAgg.length - 3].high : h1;
  let l2 = htfAgg.length >= 3 ? htfAgg[htfAgg.length - 3].low : l1;
  let t2 = htfAgg.length >= 3 ? htfAgg[htfAgg.length - 3].time : t1;

  /** @type {LxBox[]} */
  const out = [];
  if (l0 > h2) {
    const c = COL.liveBull;
    out.push({
      id: "live:bull",
      kind: "live-fvg",
      direction: "bull",
      startTime: t2,
      endTime: htfPlaceholderEndTime(anchorTime),
      extendToRight: true,
      top: l0,
      bottom: h2,
      fill: c.fill,
      border: c.border,
      labelColor: c.label,
      dashed: true,
      label: "Forming FVG",
    });
  }
  if (h0 < l2) {
    const c = COL.liveBear;
    out.push({
      id: "live:bear",
      kind: "live-fvg",
      direction: "bear",
      startTime: t2,
      endTime: htfPlaceholderEndTime(anchorTime),
      extendToRight: true,
      top: l2,
      bottom: h0,
      fill: c.fill,
      border: c.border,
      labelColor: c.label,
      dashed: true,
      label: "Forming FVG",
    });
  }
  return out;
}

/**
 * @param {{ time: number; high: number; low: number }[]} primary
 * @param {{ time: number; high: number; low: number }[]} comp
 * @param {number} anchorTime
 * @param {string} compLabel
 * @param {number} pivotLeft
 * @param {number} pivotRight
 */
function runSmtEngine(primary, comp, anchorTime, compLabel, pivotLeft, pivotRight) {
  /** @type {LxLine[]} */
  const lines = [];
  if (primary.length < pivotLeft + pivotRight + 5) return lines;

  const compMap = new Map(comp.map((b) => [b.time, b]));
  /** @type {({ high: number; low: number } | null)[]} */
  const compAligned = primary.map((b) => compMap.get(b.time) ?? null);

  /** @type {{ price: number; symPrice: number; time: number } | null} */
  let lastPh = null;
  /** @type {{ price: number; symPrice: number; time: number } | null} */
  let lastPl = null;

  for (let i = pivotLeft; i < primary.length - pivotRight; i++) {
    const bar = primary[i];
    if (bar.time > anchorTime) break;
    const cb = compAligned[i];
    if (!cb) continue;

    const ph = pivotHighAt(primary, i, pivotLeft, pivotRight);
    const pl = pivotLowAt(primary, i, pivotLeft, pivotRight);

    const compSlice = compAligned
      .slice(Math.max(0, i - pivotLeft), i + pivotRight + 1)
      .map((b, j) => (b ? { high: b.high, low: b.low } : { high: NaN, low: NaN }));
    const compPivotIdx = pivotLeft;

    if (ph != null) {
      const symPh = pivotHighAt(compSlice, compPivotIdx, pivotLeft, pivotRight);
      if (lastPh && symPh != null && lastPh.symPrice != null) {
        if ((ph - lastPh.price) * (symPh - lastPh.symPrice) < 0) {
          lines.push({
            startTime: lastPh.time,
            endTime: bar.time,
            y1: lastPh.price,
            y2: ph,
            color: COL.smtBullLine,
            width: 2,
            label: `SMT + ${compLabel}`,
            labelTime: Math.floor((lastPh.time + bar.time) / 2),
            labelY: (ph + lastPh.price) / 2 + ph * 0.0001,
            labelStyle: "high",
            labelColor: COL.smtBullLabelText,
            labelBg: COL.smtBullLabelBg,
          });
        }
      }
      lastPh = { price: ph, symPrice: symPh ?? cb.high, time: bar.time };
    }

    if (pl != null) {
      const symPl = pivotLowAt(compSlice, compPivotIdx, pivotLeft, pivotRight);
      if (lastPl && symPl != null && lastPl.symPrice != null) {
        if ((pl - lastPl.price) * (symPl - lastPl.symPrice) < 0) {
          lines.push({
            startTime: lastPl.time,
            endTime: bar.time,
            y1: lastPl.price,
            y2: pl,
            color: COL.smtBearLine,
            width: 2,
            label: `SMT − ${compLabel}`,
            labelTime: Math.floor((lastPl.time + bar.time) / 2),
            labelY: (pl + lastPl.price) / 2 - pl * 0.0001,
            labelStyle: "low",
            labelColor: COL.smtBearLabelText,
            labelBg: COL.smtBearLabelBg,
          });
        }
      }
      lastPl = { price: pl, symPrice: symPl ?? cb.low, time: bar.time };
    }
  }

  return lines.slice(-20);
}

/**
 * @param {{ time: number; high: number; low: number }[]} bars
 * @param {number} anchorTime
 * @param {number} lookback
 * @param {number} tick
 */
function runEqhlEngine(bars, anchorTime, lookback, tick) {
  /** @type {LxLine[]} */
  const lines = [];
  if (bars.length < 3) return lines;
  const endIdx =
    bars[bars.length - 1].time <= anchorTime
      ? bars.length - 1
      : bars.findLastIndex((b) => b.time <= anchorTime);
  if (endIdx < 2) return lines;
  const slice = bars;
  const tol = tick * 0.5;

  for (const isHigh of [true, false]) {
    const v0 = isHigh ? slice[endIdx].high : slice[endIdx].low;
    for (let i = 1; i <= Math.min(lookback, endIdx); i++) {
      const vi = isHigh ? slice[endIdx - i].high : slice[endIdx - i].low;
      if (Math.abs(vi - v0) > tol) {
        if (isHigh && vi > v0) break;
        if (!isHigh && vi < v0) break;
        continue;
      }
      lines.push({
        startTime: slice[endIdx - i].time,
        endTime: slice[endIdx].time,
        y1: v0,
        y2: v0,
        color: isHigh ? COL.eqHigh : COL.eqLow,
        width: 1,
        label: isHigh ? "EQH" : "EQL",
        labelTime: Math.floor((slice[endIdx - i].time + slice[endIdx].time) / 2),
        labelY: v0,
      });
      break;
    }
  }

  return lines;
}

/** @param {string} sym */

export class LiquidityXEngine {
  static smtCompanionSymbol(sym) {
    const s = sym.toUpperCase();
    if (s === "NQ" || s.startsWith("NQ")) return "ES";
    if (s === "ES" || s.startsWith("ES")) return "NQ";
    return "ES";
  }
  
  /**
   * @param {{ time: number; open: number; high: number; low: number; close: number }[]} bars1m
   * @param {number} anchorUnix
   * @param {string} chartTf
   * @param {{ time: number; high: number; low: number; close: number }[]} [compBars1m]
   * @param {object} [opts]
   */
  static runLiquidityXEngine(bars1m, anchorUnix, chartTf, compBars1m = [], opts = {}) {
    const slice = sliceBarsThroughAnchor(bars1m, anchorUnix);
    if (slice.length < 5) return { boxes: /** @type {LxBox[]} */ ([]), lines: /** @type {LxLine[]} */ ([]) };
  
    const anchorTime = slice[slice.length - 1].time;
    const chartTfSec = TF_MAP[chartTf] ?? 60;
    const htfKey = opts.htfTf ?? "15m";
    const htfSec = TF_MAP[htfKey] ?? 900;
    const extendBars = opts.extendBars ?? 50;
    const maxIfvg = opts.maxIfvg ?? 0;
    const ifvgCol = opts.ifvgCol ?? COL.ifvg;
    const eqLookback = opts.eqLookback ?? 200;
    const pivotLeft = opts.pivotLeft ?? 1;
    const pivotRight = opts.pivotRight ?? 1;
    const compLabel = opts.compLabel ?? "ES";
  
    const chartAgg = Aggregate.candles(slice, chartTf);
    const htfAgg = Aggregate.candles(slice, htfKey);
  
    /** @type {LxBox[]} */
    let boxes = [];
    /** @type {LxLine[]} */
    let lines = [];
  
    if (opts.localFvg !== false) {
      const local = runLocalFvgOnAgg(
        chartAgg,
        chartTfSec,
        extendBars,
        anchorTime,
        opts.autoDelete !== false,
        maxIfvg,
        "FVG",
        ifvgCol,
      );
      boxes.push(...local.boxes, ...local.ifvgs);
    }
  
    if (opts.htfFvg !== false) {
      boxes.push(
        ...runHtfFvgEngine(htfAgg, anchorTime, opts.htfBoxLabel ?? `${htfKey} FVG`),
      );
    }
  
    if (opts.liveFvg === true) {
      boxes.push(...runLiveFormingFvg(htfAgg, anchorTime, chartTfSec));
    }
  
    if (opts.smt !== false && compBars1m.length) {
      const compSlice = sliceBarsThroughAnchor(compBars1m, anchorUnix);
      lines.push(...runSmtEngine(slice, compSlice, anchorTime, compLabel, pivotLeft, pivotRight));
    }
  
    if (opts.eqhl !== false) {
      lines.push(...runEqhlEngine(slice, anchorTime, eqLookback, opts.tickSize ?? 0.25));
    }
  
    return { boxes, lines };
  }

}

export const smtCompanionSymbol = (...a) => LiquidityXEngine.smtCompanionSymbol(...a);
export const runLiquidityXEngine = (...a) => LiquidityXEngine.runLiquidityXEngine(...a);
