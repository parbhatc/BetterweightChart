import { companionLabelFor } from "../../confluence/smtContext.js";
import { applyCycleReset, buildLive } from "../engines/checklistCycleLive.js";
import { getSetupTradingWindowBounds } from "../setupTradingWindow.js";
import { checklist as checklistItems } from "../engines/engineConfig.js";
import { resolveSmtPivot } from "../setupSmt.js";

/** @typedef {import("./setupRegistry.js").SetupRuntimeContext} SetupRuntimeContext */

const FVG_TAP_SLUG = "fvgTap";

/** @param {SetupRuntimeContext} ctx */
export function scanOpts(ctx) {
  return {
    getSweepEvents: ctx.getSweepEvents,
    getRaw1m: ctx.getRaw1m,
    getAnchorUnix: ctx.getAnchorUnix,
    getDayYmd: ctx.getDayYmd,
    getHasPpiNews: ctx.getHasPpiNews,
    getReleaseDayKind: ctx.getReleaseDayKind,
    getCalendarEvents: ctx.getCalendarEvents,
    getSetupTradingWindow: ctx.getSetupTradingWindow,
    getCompBars1m: ctx.getCompBars1m,
    getTf: ctx.getTf,
  };
}

/** @param {SetupRuntimeContext} ctx */
export function smtScanOpts(ctx) {
  const lx = ctx.getLxSettings?.() ?? {};
  const items = checklistItems(FVG_TAP_SLUG);
  const pivot = resolveSmtPivot(items, {
    pivotLeft: lx.smtPivotLeft,
    pivotRight: lx.smtPivotRight,
  });
  return {
    bars1m: ctx.getRaw1m(),
    compBars1m: ctx.getCompBars1m?.() ?? [],
    pivotLeft: pivot.pivotLeft,
    pivotRight: pivot.pivotRight,
    compLabel: companionLabelFor(ctx.getSymbol?.() ?? ""),
    getSweepEvents: ctx.getSweepEvents,
    getHasPpiNews: ctx.getHasPpiNews,
    getReleaseDayKind: ctx.getReleaseDayKind,
    getCalendarEvents: ctx.getCalendarEvents,
    getSetupTradingWindow: ctx.getSetupTradingWindow,
    getTf: ctx.getTf,
  };
}

/** @param {SetupRuntimeContext} ctx @param {object[]} completed */
export function fvgTapLive(ctx, completed) {
  const lx = ctx.getLxSettings?.() ?? {};
  const items = checklistItems(FVG_TAP_SLUG);
  const pivot = resolveSmtPivot(items, {
    pivotLeft: lx.smtPivotLeft,
    pivotRight: lx.smtPivotRight,
  });
  const liveOpts = {
    ...smtScanOpts(ctx),
    anchorUnix: ctx.getAnchorUnix(),
    pivotLeft: pivot.pivotLeft,
    pivotRight: pivot.pivotRight,
    tradingBounds: getSetupTradingWindowBounds(
      ctx.getDayYmd?.(),
      ctx.getHasPpiNews?.() === true,
      ctx.getSetupTradingWindow?.(),
      ctx.getCalendarEvents?.() ?? [],
    ),
  };
  return applyCycleReset(buildLive(liveOpts), liveOpts, completed);
}
