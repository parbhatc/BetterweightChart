import { Aggregate } from "../utils/aggregate.js";
import { aggregateBarsThroughAnchor } from "../session/sessionBarCache.js";
import { sliceBarsThroughAnchor } from "../levels/levelsCalc.js";
import { TF_MAP } from "../core/constants.js";
import { CHART_DOWN, CHART_UP } from "../utils/chartColors.js";

/** @typedef {{ kind: "high"|"low"; price: number; time: number; pivotTime: number; tfLabel: string; label: string; color: string; bias: string }} InternalSweepEvent */

const DEFAULT_PIVOT_LEFT = 1;
const DEFAULT_PIVOT_RIGHT = 1;

/** @param {{ high: number; low: number }[]} bars @param {number} i @param {number} left @param {number} right */
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

/** @param {string} tfKey */
function tfDisplayLabel(tfKey) {
  if (tfKey === "1m") return "1m";
  if (tfKey === "1h") return "1H";
  if (tfKey === "4h") return "4H";
  return tfKey;
}

/** @param {"high"|"low"} kind */
function biasFromPivotKind(kind) {
  return kind === "low" ? "Bullish" : "Bearish";
}

/** @param {{ high: number; low: number }} bar @param {"high"|"low"} kind @param {number} price */
function strictSweepsPivot(bar, kind, price) {
  return kind === "low" ? bar.low < price : bar.high > price;
}

/**
 * Swing pivots (1L/1R) born after bias regime start; strict 1m sweep, one pivot per bar (most recent).
 * @param {ReturnType<typeof aggregateCandles>} agg
 * @param {number} anchorTime
 * @param {number} tfSec
 * @param {number} afterBiasChange — first HTF sweep in current bias regime (or 15m tap for Setup #2)
 * @param {"high"|"low"} activeKind
 * @param {boolean} [requireConfirmAfterStart] — pivot must fully confirm after start (Setup #2)
 * @param {number} [pivotLookbackSec] — allow pivots confirmed up to N sec before start (Setup #1 tap approach)
 */
function collectPivotBirths(
  agg,
  anchorTime,
  tfSec,
  afterBiasChange,
  activeKind,
  requireConfirmAfterStart = false,
  pivotLookbackSec = 0,
  pivotLeft = DEFAULT_PIVOT_LEFT,
  pivotRight = DEFAULT_PIVOT_RIGHT,
) {
  const anchorBucketOpen = Aggregate.bucketTime(anchorTime, tfSec);
  /** @type {{ id: string; kind: "high"|"low"; price: number; pivotTime: number; confirmTime: number }[]} */
  const out = [];

  for (let i = pivotLeft; i < agg.length - pivotRight; i++) {
    const mid = i;
    const confirmIdx = mid + pivotRight;
    const pivotTime = agg[mid].time;
    const confirmTime = agg[confirmIdx].time;

    if (confirmTime >= anchorBucketOpen) continue;
    if (requireConfirmAfterStart) {
      if (pivotTime <= afterBiasChange) continue;
      if (confirmTime <= afterBiasChange) continue;
    } else if (pivotLookbackSec > 0) {
      if (confirmTime < afterBiasChange - pivotLookbackSec) continue;
    } else if (pivotTime <= afterBiasChange) {
      continue;
    }

    let price = null;
    if (activeKind === "high") price = pivotHighAt(agg, mid, pivotLeft, pivotRight);
    else if (activeKind === "low") price = pivotLowAt(agg, mid, pivotLeft, pivotRight);
    if (price == null) continue;

    out.push({
      id: `${activeKind}:${pivotTime}:${price}`,
      kind: activeKind,
      price,
      pivotTime,
      confirmTime,
    });
  }

  out.sort((a, b) => a.confirmTime - b.confirmTime || a.pivotTime - b.pivotTime);
  return out;
}

export class InternalSweepContext {
  /**
   * Chart-TF pivot sweeps (1 left / 1 right) on 1m wicks, after bias regime start.
   * @param {{ time: number; high: number; low: number; close: number }[]} bars1m
   * @param {number | null | undefined} anchorUnix
   * @param {string} tfKey
   * @param {number} regimeStart — first HTF sweep when bias flipped (or 15m tap for Setup #2)
   * @param {string} bias
   * @param {{ pivotsConfirmedAfterStart?: boolean; allowPivotLookbackSec?: number; pivotLeft?: number; pivotRight?: number }} [options]
   * @returns {InternalSweepEvent[]}
   */
  static buildInternalSweepEvents(bars1m, anchorUnix, tfKey, regimeStart, bias, options) {
    if (!bars1m?.length || anchorUnix == null || !Number.isFinite(regimeStart)) return [];

    const activeKind = bias === "Bullish" ? "low" : bias === "Bearish" ? "high" : null;
    if (!activeKind) return [];

    const pivotsConfirmedAfterStart = Boolean(options?.pivotsConfirmedAfterStart);
    const pivotLookbackSec = pivotsConfirmedAfterStart ? 0 : (options?.allowPivotLookbackSec ?? 0);
    const pivotLeft = options?.pivotLeft ?? DEFAULT_PIVOT_LEFT;
    const pivotRight = options?.pivotRight ?? DEFAULT_PIVOT_RIGHT;
    const tfSec = TF_MAP[tfKey] ?? 60;
    const tfLabel = tfDisplayLabel(tfKey);
    const slice = sliceBarsThroughAnchor(bars1m, anchorUnix);
    if (slice.length < pivotLeft + pivotRight + 3) return [];

    const agg = aggregateBarsThroughAnchor(bars1m, anchorUnix, tfKey);
    const births = collectPivotBirths(
      agg,
      anchorUnix,
      tfSec,
      regimeStart,
      activeKind,
      pivotsConfirmedAfterStart,
      pivotLookbackSec,
      pivotLeft,
      pivotRight,
    );
    if (!births.length) return [];

    /** @type {Array<{ id: string; kind: "high"|"low"; price: number; pivotTime: number; confirmTime: number; swept: boolean }>} */
    const active = [];
    let birthPtr = 0;

    /** @type {InternalSweepEvent[]} */
    const events = [];

    for (const bar of slice) {
      while (birthPtr < births.length && births[birthPtr].confirmTime <= bar.time) {
        const b = births[birthPtr++];
        active.push({ ...b, swept: false });
      }

      if (bar.time < regimeStart) continue;

      /** @type {typeof active} */
      const candidates = [];
      for (const p of active) {
        if (p.swept) continue;
        if (bar.time <= p.confirmTime) continue;
        if (!strictSweepsPivot(bar, p.kind, p.price)) continue;
        candidates.push(p);
      }
      if (!candidates.length) continue;

      const pivot = candidates.reduce((best, p) => (p.pivotTime > best.pivotTime ? p : best));
      pivot.swept = true;

      const side = pivot.kind === "low" ? "Low" : "High";
      events.push({
        kind: pivot.kind,
        price: pivot.price,
        time: bar.time,
        pivotTime: pivot.pivotTime,
        tfLabel,
        label: `${tfLabel} ${side}`,
        color: pivot.kind === "low" ? CHART_UP : CHART_DOWN,
        bias: biasFromPivotKind(pivot.kind),
      });
    }

    return events;
  }

  /**
   * @param {object} ctx
   * @param {InternalSweepEvent[]} internalSweeps
   */
  static enrichWithInternalSweeps(ctx, internalSweeps) {
    const sweeps = internalSweeps || [];
    return { ...ctx, internalSweeps: sweeps };
  }
}

export const buildInternalSweepEvents = (...a) => InternalSweepContext.buildInternalSweepEvents(...a);
export const enrichWithInternalSweeps = (...a) => InternalSweepContext.enrichWithInternalSweeps(...a);
