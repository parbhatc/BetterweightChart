import {
  mergeBacktestRangeId,
  normalizeBacktestRangeId,
} from "./backtestRange.js";
import { ensureBacktestBarCache, getBacktestBars, olderBarsFromBacktestCache } from "./backtestBarCache.js";

/**
 * Load strategy backtest cache, then merge into the chart pane once.
 *
 * @param {object} ctx Boot context
 * @param {object} pane
 * @param {import("./backtestRange.js").BacktestRange | string} backtestRange
 * @param {(pane: object) => void} [onChunk]
 */
export async function ensureBacktestHistory(ctx, pane, backtestRange, onChunk) {
  if (!pane?.bars?.length || !ctx.datafeed) return false;

  const range =
    typeof backtestRange === "string"
      ? { id: normalizeBacktestRangeId(backtestRange) }
      : (backtestRange ?? { id: "90d" });
  const id = normalizeBacktestRangeId(range.id);
  if (id === "custom" && (range.from == null || range.to == null)) return false;

  const mergeOlder = ctx.mergeOlderBarsIntoPane;
  if (typeof mergeOlder !== "function") return false;

  const existing = getBacktestBars(pane.symbol, pane.resolution);
  if (existing?.complete) {
    const older = olderBarsFromBacktestCache(pane);
    if (older?.length) {
      const added = mergeOlder(pane, older, { reason: "backtest cache merged" });
      if (added > 0) onChunk?.(pane);
      return added > 0;
    }
    return false;
  }

  await ensureBacktestBarCache({
    datafeed: ctx.datafeed,
    pane,
    backtestRange: range,
    settingsStore: ctx.settingsStore,
    resolutions: ctx.resolutions ?? [],
    getAllChartPanes: ctx.getAllChartPanes,
    onChunk: () => onChunk?.(pane),
  });

  const older = olderBarsFromBacktestCache(pane);
  if (!older?.length) return false;
  const added = mergeOlder(pane, older, { reason: "backtest cache merged" });
  if (added > 0) onChunk?.(pane);
  return added > 0;
}

/**
 * Pick the backtest range that needs the deepest history among pane strategies.
 *
 * @param {import("../indicators/types.js").IndicatorInstance[]} instances
 * @param {(defId: string) => { kind?: string } | null | undefined} getIndicatorClass
 */
export function deepestBacktestRangeForPane(instances, getIndicatorClass) {
  /** @type {import("./backtestRange.js").BacktestRange | null} */
  let picked = null;
  for (const inst of instances) {
    const Indicator = getIndicatorClass(inst.defId);
    if (Indicator?.kind !== "strategy" || inst.hidden) continue;
    const range = inst.backtestRange ?? { id: "90d" };
    picked = picked ? mergeBacktestRangeId(picked, range) : { ...range };
  }
  return picked;
}

/**
 * True only while the dedicated backtest-history fetch is still in flight.
 * @param {object} pane
 * @param {import("./backtestRange.js").BacktestRange | string} backtestRange
 * @param {number} [barSec]
 * @param {boolean} [inFlight]
 */
export function isBacktestHistoryLoading(pane, backtestRange, barSec = 60, inFlight = false) {
  void barSec;
  if (!pane?.bars?.length) return inFlight;
  const range =
    typeof backtestRange === "string"
      ? { id: normalizeBacktestRangeId(backtestRange) }
      : (backtestRange ?? { id: "90d" });
  const id = normalizeBacktestRangeId(range.id);
  if (id === "custom" && (range.from == null || range.to == null)) return false;
  if (inFlight) return true;

  const cached = getBacktestBars(pane.symbol, pane.resolution);
  if (!cached) return false;
  return !cached.complete && !cached.historyExhausted;
}
