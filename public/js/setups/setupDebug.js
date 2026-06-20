import { Format } from "../utils/format.js";
import { DaySetupsStore } from "./history/daySetupsStore.js";
import { releaseFlagsForDay } from "../session/releaseCalendar.js";
import { SetupHistory, SetupRegistry } from "./registry/index.js";

const LOG = "[setupDebug]";

/** @param {number | null | undefined} unix @param {string} [dayYmd] */
function fmtTime(unix, dayYmd) {
  if (unix == null) return "—";
  try {
    return Format.etMdYy(unix, dayYmd);
  } catch {
    return String(unix);
  }
}

/** @param {object[]} list */
function fmtSetups(list) {
  return (list ?? []).map((s) => `${fmtTime(s.completedAt)} ${s.bias ?? "?"}`).join(", ") || "(none)";
}

export function setupDebugEnabled() {
  if (typeof window === "undefined") return false;
  try {
    if (window.__SETUP_DEBUG__ === true) return true;
    return localStorage.getItem("ifvg-setup-debug") === "1";
  } catch {
    return window.__SETUP_DEBUG__ === true;
  }
}

/**
 * @param {string} tag
 * @param {object} payload
 */
export function setupDebugLog(tag, payload) {
  if (!setupDebugEnabled()) return;
  console.log(LOG, tag, payload);
}

/**
 * @param {object} ctx
 * @param {() => import("../levels/levelsCalc.js").HtfSweepEvent[]} ctx.getSweepEvents
 * @param {() => number | null | undefined} ctx.getAnchorUnix
 * @param {() => string | undefined} ctx.getDayYmd
 * @param {() => boolean} [ctx.getHasPpiNews]
 * @param {() => "ppi" | "cpi" | null} [ctx.getReleaseDayKind]
 * @param {() => number | null | undefined} [ctx.getLiqAnchorUnix]
 * @param {() => string} [ctx.getTf]
 * @param {() => object[]} [ctx.getDisplayedBars]
 * @param {() => number | null | undefined} [ctx.getCurrentCandle1mOpen]
 */
export function dumpSetupPanelState(ctx) {
  const anchorUnix = ctx.getAnchorUnix?.() ?? null;
  const dayYmd = ctx.getDayYmd?.() ?? "";
  const sweeps = ctx.getSweepEvents?.() ?? [];
  const sweepsThrough = anchorUnix != null ? sweeps.filter((s) => s.time <= anchorUnix) : sweeps;
  const runtime = {
    dayYmd,
    tf: ctx.getTf?.() ?? "?",
    anchor: fmtTime(anchorUnix, dayYmd),
    anchorUnix,
    currentCandle1mOpen: ctx.getCurrentCandle1mOpen?.() ?? null,
    currentCandle1mOpenEt: fmtTime(ctx.getCurrentCandle1mOpen?.(), dayYmd),
    liqAnchorUnix: ctx.getLiqAnchorUnix?.() ?? null,
    liqAnchorEt: fmtTime(ctx.getLiqAnchorUnix?.(), dayYmd),
    displayedTipUnix: ctx.getDisplayedBars?.().at(-1)?.time ?? null,
    displayedTipEt: fmtTime(ctx.getDisplayedBars?.().at(-1)?.time, dayYmd),
      hasPpiNews: ctx.getHasPpiNews?.() ?? false,
      releaseDayKind: ctx.getReleaseDayKind?.() ?? null,
      exportReleaseDay: Boolean(
        dayYmd && releaseFlagsForDay(dayYmd, [], "export").hasRelease,
      ),
    sweepCountTotal: sweeps.length,
    sweepCountThroughAnchor: sweepsThrough.length,
    compBarsLen: ctx.getCompBars1m?.().length ?? 0,
    sweepLabelsThroughAnchor: sweepsThrough.map((s) => `${fmtTime(s.time, dayYmd)} ${s.label}`).join(" | "),
    daySetupsStore: DaySetupsStore.has(dayYmd),
    anyWarm: SetupHistory.anyWarm(dayYmd),
  };

  const resolved = SetupHistory.resolve(
    {
      getSweepEvents: ctx.getSweepEvents,
      getRaw1m: () => ctx.getRaw1m?.() ?? [],
      getAnchorUnix: ctx.getAnchorUnix,
      getDayYmd: ctx.getDayYmd,
      getCompBars1m: ctx.getCompBars1m,
      getSymbol: ctx.getSymbol,
      getLxSettings: ctx.getLxSettings,
      getHasPpiNews: ctx.getHasPpiNews,
      getReleaseDayKind: ctx.getReleaseDayKind,
      getSetupTradingWindow: ctx.getSetupTradingWindow,
      getTf: ctx.getTf,
    },
    anchorUnix,
    dayYmd,
  );

  const setups = {};
  for (const def of SetupRegistry.list()) {
    const list = resolved.get(def.id) ?? [];
    setups[`setup${def.id}`] = {
      count: list.length,
      entries: fmtSetups(list),
    };
  }

  const out = { ...runtime, resolved: setups };
  console.log(LOG, "dump", out);
  return out;
}

if (typeof window !== "undefined") {
  window.__SETUP_DEBUG__ = window.__SETUP_DEBUG__ ?? false;
  window.enableSetupDebug = () => {
    window.__SETUP_DEBUG__ = true;
    try {
      localStorage.setItem("ifvg-setup-debug", "1");
    } catch {
      //
    }
    return "Setup debug ON — refresh or step replay, then check console for [setupDebug] logs";
  };
  window.disableSetupDebug = () => {
    window.__SETUP_DEBUG__ = false;
    try {
      localStorage.removeItem("ifvg-setup-debug");
    } catch {
      //
    }
    return "Setup debug OFF";
  };
}
