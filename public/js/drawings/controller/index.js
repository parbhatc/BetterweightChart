import { CURSOR_TOOLS } from "../registry/tools.js";
import { createControllerState } from "./state.js";
import { attachPointerHandling } from "./pointerHandling.js";
import { attachSelection } from "./selection.js";
import { attachCoords } from "./coords.js";
import { attachHitTesting } from "./hitTesting.js";
import { attachPlacement } from "./placement.js";
import { attachCrosshair } from "./crosshair.js";
import { attachUtility } from "./utility.js";
import { attachCommit } from "./commit.js";
import { attachMutations } from "./mutations.js";
import { attachFreehand, attachCursorMark } from "./freehand.js";
import { attachKeyboard } from "./keyboard.js";
import { wireController, buildControllerApi } from "./lifecycle.js";

/**
 * @param {object} opts
 * @param {import("lightweight-charts").IChartApi} opts.chart
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {HTMLElement} opts.container
 * @param {() => { bars: { time: number, open?: number, high?: number, low?: number, close?: number }[], barSec: number }} opts.getContext
 * @param {(bar: object, prev: object | null) => void} [opts.onValuesTooltipBarChange]
 */
export function createDrawingController(opts) {
  const ctx = createControllerState(opts);

  attachPointerHandling(ctx);
  attachSelection(ctx);
  attachCoords(ctx);
  attachHitTesting(ctx);
  attachPlacement(ctx);
  attachCrosshair(ctx);
  attachUtility(ctx);
  attachCommit(ctx);
  attachMutations(ctx);
  attachFreehand(ctx);
  attachCursorMark(ctx);
  attachKeyboard(ctx);

  wireController(ctx);
  ctx.unbindKeyboard = ctx.bindKeyboard();

  if (ctx.hideAll) ctx.setHideAll(true);
  else if (ctx.drawingsHidden) ctx.setDrawingsHidden(true);
  if (ctx.stayInDrawingMode) ctx.setStayInDrawingMode(true);

  return buildControllerApi(ctx);
}

export { CURSOR_TOOLS };
