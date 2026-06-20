import { Aggregate } from "../utils/aggregate.js";
import { TF_MAP } from "../core/constants.js";
import { Format } from "../utils/format.js";
import { resetSessionBarCache } from "../session/sessionBarCache.js";
import { DaySetupsStore } from "./history/daySetupsStore.js";
import { SetupHistory, SetupRegistry } from "./registry/index.js";

/** @typedef {{ title: string; items: string[] }} SetupTooltipSection */

const LOG = "[setupMarkers]";

/** @type {SetupMarkers} */
let defaultSetupMarkers;

/** @param {...unknown} args */
function dbg(...args) {
  if (typeof window === "undefined") return;
  if (window.__SETUP_MARKERS_DEBUG__ === false) return;
  console.log(LOG, ...args);
}

if (typeof window !== "undefined") {
  window.__SETUP_MARKERS_DEBUG__ = window.__SETUP_MARKERS_DEBUG__ ?? false;
  window.debugSetupMarkers = () => ({
    dayKey: defaultSetupMarkers._completionStore.dayKey,
    store: [...defaultSetupMarkers._completionStore.byId.entries()].map(([id, e]) => ({
      id,
      entry: fmtTime(e.completedAt1m),
      chartTime: e.label.time,
      side: e.label.side,
    })),
  });
}

/** @param {string} dayYmd */
function ensureCompletionStore(dayYmd) {
  const key = dayYmd || "";
  if (key === defaultSetupMarkers._completionStore.dayKey) return;
  defaultSetupMarkers._completionStore = { dayKey: key, hydratedThroughAnchor: -Infinity, byId: new Map() };
}

/** @param {number} time1m @param {string} chartTf */
function markerTimeOnChartFn(time1m, chartTf) {
  const tfSec = TF_MAP[chartTf] ?? 60;
  if (tfSec <= 60) return time1m;
  return Aggregate.bucketTime(time1m, tfSec);
}

/** @param {string} bias @param {number} setupNum */
function setupTooltipTitleFn(bias, setupNum) {
  const side = bias === "Bullish" ? "Long" : bias === "Bearish" ? "Short" : "Setup";
  return `${side} · Setup #${setupNum}`;
}

/** @param {number} time */
function fmtTime(time) {
  return Format.time12h(Format.toDate(time));
}

/** @param {number} time1m @param {{ time: number; high: number; low: number }[]} rawBars */
function barAt1m(time1m, rawBars) {
  return rawBars.find((b) => b.time === time1m) ?? null;
}

/**
 * @param {number} time1m
 * @param {object} setup
 * @param {import("./registry/setupRegistry.js").SetupDefinition} def
 * @param {string} chartTf
 * @param {{ time: number; high: number; low: number }[]} rawBars
 */
function makeSetupLabel(time1m, setup, def, chartTf, rawBars) {
  const bar = barAt1m(time1m, rawBars);
  if (!bar) {
    dbg("makeSetupLabel: no 1m bar", {
      entry: fmtTime(time1m),
      bias: setup.bias,
      rawBars: rawBars.length,
    });
    return null;
  }

  const bullish = setup.bias === "Bullish";

  return {
    id: def.markers.id(setup),
    time: markerTimeOnChartFn(time1m, chartTf),
    entryTime1m: time1m,
    price: bullish ? bar.low : bar.high,
    side: bullish ? "long" : "short",
    tooltipTitle: setupTooltipTitleFn(setup.bias ?? "—", def.id),
    tooltipSections: def.markers.tooltips(setup, time1m),
  };
}

/** @param {import("./registry/setupRegistry.js").SetupDefinition} def @param {object} setup @param {boolean} verbose */
function tryRecord(def, setup, chartTf, rawBars, verbose) {
  if (!setup?.complete || setup.completedAt == null) return;

  if (def.markers.regimeStart(setup) == null) {
    if (verbose) {
      dbg("tryRecord: skip no regimeStart", {
        setupNum: def.id,
        entry: fmtTime(setup.completedAt),
        bias: setup.bias,
      });
    }
    return;
  }

  const id = def.markers.id(setup);
  const label = makeSetupLabel(setup.completedAt, setup, def, chartTf, rawBars);
  if (label) {
    const isNew = !defaultSetupMarkers._completionStore.byId.has(id);
    defaultSetupMarkers._completionStore.byId.set(id, { completedAt1m: setup.completedAt, label });
    if (verbose && isNew) {
      dbg("tryRecord: stored", { id, entry: fmtTime(setup.completedAt), side: label.side });
    }
  }
}

/** @param {Map<number, object[]>} bySetup @param {boolean} verbose @param {number} recordAfterUnix */
function hydrateFrom(bySetup, chartTf, rawBars, recordAfterUnix, verbose) {
  if (verbose) {
    dbg("hydrate", {
      setups: SetupRegistry.list().map((def) => ({
        id: def.id,
        fresh: (bySetup.get(def.id) ?? []).filter((s) => s.completedAt > recordAfterUnix).length,
      })),
    });
  }

  for (const def of SetupRegistry.list()) {
    for (const setup of bySetup.get(def.id) ?? []) {
      if (setup.completedAt <= recordAfterUnix) continue;
      tryRecord(def, setup, chartTf, rawBars, verbose);
    }
  }
}

/** @param {import("./registry/setupRegistry.js").SetupRuntimeContext} ctx @param {string} chartTf @param {number} anchorUnix @param {string} [dayYmd] @param {number} recordAfterUnix @param {boolean} verbose @param {{ time: number; high: number; low: number }[]} rawBars */
function hydrateThrough(ctx, chartTf, rawBars, anchorUnix, dayYmd, recordAfterUnix, verbose) {
  const bySetup = DaySetupsStore.has(dayYmd)
    ? DaySetupsStore.through(anchorUnix, dayYmd).byId
    : SetupHistory.resolve(ctx, anchorUnix, dayYmd);
  hydrateFrom(bySetup, chartTf, rawBars, recordAfterUnix, verbose);
}

/** @param {"long"|"short"} side @param {number} entryTime1m */
function groupedMarkerTitle(side, entryTime1m) {
  return `${side === "long" ? "Long" : "Short"} · ${fmtTime(entryTime1m)}`;
}

/** @param {import("./setupLabelsPrimitive.js").SetupLabel[]} labels */
function mergeLabelsAtSameTime(labels) {
  /** @type {Map<string, import("./setupLabelsPrimitive.js").SetupLabel[]>} */
  const groups = new Map();
  for (const label of labels) {
    const key = `${label.time}:${label.side}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(label);
    groups.set(key, bucket);
  }

  /** @type {import("./setupLabelsPrimitive.js").SetupLabel[]} */
  const merged = [];
  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      merged.push(bucket[0]);
      continue;
    }

    bucket.sort((a, b) => (Number(a.id.split(":")[0]) || 0) - (Number(b.id.split(":")[0]) || 0));
    const first = bucket[0];
    const entryTime1m = first.entryTime1m ?? first.time;
    merged.push({
      id: `trade:${first.side}:${first.time}`,
      time: first.time,
      entryTime1m,
      price: first.price,
      side: first.side,
      tooltipTitle: groupedMarkerTitle(first.side, entryTime1m),
      tooltipSections: bucket[0]?.tooltipSections ?? [],
      tooltipVariants: bucket.map((label) => ({
        setupNum: Number(label.id.split(":")[0]) || 1,
        tooltipTitle: label.tooltipTitle,
        tooltipSections: label.tooltipSections,
      })),
      setupCount: bucket.length,
    });
  }

  return merged.sort((a, b) => (a.entryTime1m ?? a.time) - (b.entryTime1m ?? b.time));
}

/** @param {number} anchorUnix */
function labelsThroughAnchor(anchorUnix) {
  const out = [];
  for (const entry of defaultSetupMarkers._completionStore.byId.values()) {
    if (entry.completedAt1m <= anchorUnix) out.push(entry);
  }
  return mergeLabelsAtSameTime(
    out.sort((a, b) => a.completedAt1m - b.completedAt1m).map((e) => e.label),
  );
}

/** @param {import("./registry/setupRegistry.js").SetupRuntimeContext} ctx @param {string} chartTf @param {() => object[]} [getLoadedBars] @param {() => string} [getDayYmd] */
function buildLabelHistoryFn(ctx, chartTf, getLoadedBars, getDayYmd) {
  const rawBars = ctx.getRaw1m();
  const anchorUnix = ctx.getAnchorUnix();
  if (!rawBars.length || anchorUnix == null) return [];

  const dayYmd = getDayYmd?.() ?? "";
  ensureCompletionStore(dayYmd);

  const anchorChanged = anchorUnix !== defaultSetupMarkers._lastDebugAnchor;
  if (anchorChanged) defaultSetupMarkers._lastDebugAnchor = anchorUnix;

  if (anchorUnix < defaultSetupMarkers._completionStore.hydratedThroughAnchor) {
    defaultSetupMarkers._completionStore.byId.clear();
    defaultSetupMarkers._completionStore.hydratedThroughAnchor = -Infinity;
  }

  if (anchorUnix !== defaultSetupMarkers._completionStore.hydratedThroughAnchor) {
    const recordAfter =
      anchorUnix > defaultSetupMarkers._completionStore.hydratedThroughAnchor
        ? defaultSetupMarkers._completionStore.hydratedThroughAnchor
        : -Infinity;

    const bySetup = DaySetupsStore.has(dayYmd)
      ? DaySetupsStore.through(anchorUnix, dayYmd).byId
      : SetupHistory.resolve(ctx, anchorUnix, dayYmd);

    const needsHydrate =
      recordAfter === -Infinity ||
      (DaySetupsStore.has(dayYmd)
        ? DaySetupsStore.countNewAfter(anchorUnix, recordAfter, dayYmd) > 0
        : SetupHistory.countNewAfter(bySetup, recordAfter) > 0 ||
          SetupRegistry.list().some((def) => {
            const sweepCount =
              def.slug === "htfSweep"
                ? (ctx.getSweepEvents?.().filter((s) => s.time <= anchorUnix).length ?? 0)
                : null;
            const peeked =
              sweepCount != null
                ? def.history.peek(anchorUnix, dayYmd, sweepCount)
                : def.history.peek(anchorUnix, dayYmd);
            return peeked == null;
          }));

    if (needsHydrate) {
      hydrateThrough(ctx, chartTf, rawBars, anchorUnix, dayYmd, recordAfter, anchorChanged);
    }

    defaultSetupMarkers._completionStore.hydratedThroughAnchor = anchorUnix;
  }

  return labelsThroughAnchor(anchorUnix);
}

export class SetupMarkers {
  constructor() {
    this._completionStore = { dayKey: "", hydratedThroughAnchor: -Infinity, byId: new Map() };
    this._lastDebugAnchor = -Infinity;
  }

  static markerTimeOnChart = markerTimeOnChartFn;
  static setupTooltipTitle = setupTooltipTitleFn;

  resetLabelCache() {
    this._completionStore = { dayKey: "", hydratedThroughAnchor: -Infinity, byId: new Map() };
    SetupHistory.resetAll();
    resetSessionBarCache();
  }

  buildLabelHistory(...a) {
    return buildLabelHistoryFn(...a);
  }
}

defaultSetupMarkers = new SetupMarkers();

export const resetSetupLabelCache = () => defaultSetupMarkers.resetLabelCache();
export const markerTimeOnChart = (...a) => SetupMarkers.markerTimeOnChart(...a);
export const setupTooltipTitle = (...a) => SetupMarkers.setupTooltipTitle(...a);
export const buildSetupLabelHistory = (...a) => defaultSetupMarkers.buildLabelHistory(...a);

/** @deprecated Use SetupRegistry + def.markers.tooltips */
export function buildSetupTooltipSections(setup, entryTime1m, setupNum = 1) {
  const def = SetupRegistry.get(setupNum);
  return def?.markers.tooltips(setup, entryTime1m) ?? [];
}
