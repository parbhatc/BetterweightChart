import {
  through as lastCandleThrough,
  peek as lastCandlePeek,
  warm as lastCandleWarm,
  reset as lastCandleReset,
  live as lastCandleSweepLive,
  lastCandleScanOpts,
} from "../engines/lastCandleSweepEngine.js";
import {
  through as htfThrough,
  peek as htfPeek,
  warm as htfWarm,
  reset as htfReset,
  live as htfSweepLive,
} from "../engines/checklistEngine.js";
import {
  through as fvgThrough,
  peek as fvgPeek,
  warm as fvgWarm,
  resetHistoryCache as fvgReset,
} from "../engines/fvgTapHistory.js";
import { fvgTapLive, scanOpts, smtScanOpts } from "./setupRuntime.js";
import { resolveBackboneFromChecklist } from "../setupSteps.js";

/** @typedef {import("./setupRegistry.js").SetupHistoryApi} SetupHistoryApi */
/** @typedef {import("./setupRegistry.js").SetupRuntimeContext} SetupRuntimeContext */

/**
 * @typedef {object} SetupEngineBundle
 * @property {string} key
 * @property {"htfSweep"|"fvgTap"|"lastCandleSweep"} ui
 * @property {SetupHistoryApi} history
 * @property {(ctx: SetupRuntimeContext) => unknown} opts
 * @property {(ctx: SetupRuntimeContext, completed: object[]) => object} live
 * @property {(setup: object) => string} detail
 * @property {{ id: (setup: object, setupId: number) => string; regimeStart: (setup: object) => number | null | undefined }} markers
 */

/** @type {Record<"htfSweep"|"fvgTap"|"lastCandleSweep", SetupEngineBundle>} */
const BACKBONES = {
  lastCandleSweep: {
    key: "lastCandleSweep",
    ui: "lastCandleSweep",
    history: { through: lastCandleThrough, peek: lastCandlePeek, warm: lastCandleWarm, reset: lastCandleReset },
    opts: lastCandleScanOpts,
    live: (ctx, completed) => lastCandleSweepLive(lastCandleScanOpts(ctx), ctx.getDayYmd?.(), completed),
    detail: (setup) => setup.lastCandleSweep?.label ?? (setup.sweepBar ? "last candle sweep" : ""),
    markers: {
      id: (setup, setupId) => `${setupId}:${setup.bias}:${setup.completedAt}`,
      regimeStart: (setup) => setup.lastCandleSweep?.time ?? setup.sweepBar?.time,
    },
  },
  htfSweep: {
    key: "htfSweep",
    ui: "htfSweep",
    history: { through: htfThrough, peek: htfPeek, warm: htfWarm, reset: htfReset },
    opts: scanOpts,
    live: (ctx, completed) => htfSweepLive(scanOpts(ctx), ctx.getDayYmd?.(), completed),
    detail: (setup) => setup.htfSweeps?.[0]?.label ?? setup.anchorTap?.label ?? "",
    markers: {
      id: (setup, setupId) =>
        `${setupId}:${setup.bias}:${setup.completedAt}:${setup.anchorTap?.time ?? ""}`,
      regimeStart: (setup) => setup.anchorTap?.time ?? setup.htfSweeps?.[0]?.time,
    },
  },
  fvgTap: {
    key: "fvgTap",
    ui: "fvgTap",
    history: { through: fvgThrough, peek: fvgPeek, warm: fvgWarm, reset: fvgReset },
    opts: smtScanOpts,
    live: fvgTapLive,
    detail: (setup) => setup.anchorTap?.label ?? "",
    markers: {
      id: (setup, setupId) => `${setupId}:${setup.bias}:${setup.completedAt}`,
      regimeStart: (setup) => setup.anchorTap?.time,
    },
  },
};

/** @param {import("../setupChecklist.js").ChecklistItemDef[]} checklist */
export function resolveEngineFromChecklist(checklist) {
  const backbone = resolveBackboneFromChecklist(checklist);
  return BACKBONES[backbone];
}

/** @param {string} key */
export function getEngineByKey(key) {
  const hit = BACKBONES[/** @type {keyof typeof BACKBONES} */ (key)];
  if (!hit) throw new Error(`Unknown setup engine "${key}"`);
  return hit;
}

export const ENGINE_KEYS = Object.freeze(Object.keys(BACKBONES));
