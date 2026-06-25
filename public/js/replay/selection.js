import { nearestBarIndex, resolveUtcBarTime } from "../chart/pane/hoverBar.js";
import {
  applyCursorMode,
  applyReplaySelectCrosshair,
  resolveThemeCrosshair,
} from "../app/cursor/mode.js";
import { replayDebug } from "./debug.js";

const REPLAY_SELECT_BAR_CLASS = "chart--replay-select-bar";

/**
 * @param {import("../app/boot/chart/state.js").BootContext} ctx
 */
function restoreChartCrosshair(ctx) {
  const themeCrosshair = resolveThemeCrosshair(ctx.settingsStore, ctx.themeColors);
  const tool = ctx.drawing?.getActiveTool?.() ?? "cursor";
  const isCursor = ctx.drawing?.isCursorTool?.() ?? true;

  for (const pane of ctx.getAllChartPanes()) {
    if (!pane.chart || !(pane.el instanceof HTMLElement)) continue;
    applyCursorMode(pane.chart, pane.el, tool, isCursor, pane.series, themeCrosshair);
  }
}

/**
 * @param {import("../app/boot/chart/state.js").BootContext} ctx
 * @param {ReturnType<import("./mode.js").mountReplayMode>} replay
 */
export function attachReplaySelection(ctx, replay) {
  /** @type {Map<number, (param: import("lightweight-charts").MouseEventParams) => void>} */
  const clickHandlers = new Map();

  let prevSelecting = false;
  /** @type {import("./icons.js").ReplaySelectMode} */
  let prevMode = "bar";
  let crosshairSelecting = false;
  /** @type {Map<number, (param: import("lightweight-charts").MouseEventParams) => void>} */
  const crosshairClampHandlers = new Map();
  /** @type {Map<number, { onMove: (ev: PointerEvent) => void, onLeave: (ev: PointerEvent) => void }>} */
  const pointerClampHandlers = new Map();
  /** @type {Map<number, () => void>} */
  const cutLineSyncHandlers = new Map();
  let clampingCrosshair = false;

  /** @param {object} pane */
  function clearReplayHover(pane) {
    pane.replayHoverBarIndex = null;
    pane.replayHoverLocalY = null;
  }

  /** @param {object} pane */
  function lastBarChartTime(pane) {
    if (!pane?.bars?.length) return null;
    const lastUtc = pane.bars[pane.bars.length - 1].time;
    return pane.timeAdapter?.time.toChart(lastUtc) ?? lastUtc;
  }

  /** @param {object} pane */
  function lastBarCoordinateX(pane) {
    const lastChartTime = lastBarChartTime(pane);
    if (lastChartTime == null || !pane.timeAdapter || !pane.chart) return null;
    const x = pane.timeAdapter.coord.xFromChart(pane.chart, lastChartTime);
    return x != null && Number.isFinite(x) ? x : null;
  }

  /** @param {object} pane @param {number} localX @param {number} localY */
  function updateReplayHover(pane, localX, localY) {
    const state = replay.getState();
    if (!state.active || !state.selectingBar || state.selectMode !== "bar") {
      clearReplayHover(pane);
      return;
    }

    const maxX = lastBarCoordinateX(pane);
    const clampedX = maxX != null ? Math.min(localX, maxX) : localX;
    const point = pane.timeAdapter?.coord.fromPixel(pane.chart, pane.series, clampedX, localY);
    if (!point?.time) {
      clearReplayHover(pane);
      ctx.replayFutureDim?.refreshAll?.();
      return;
    }

    const idx = resolveBarIndex(pane, {
      time: point.time,
      point: { x: clampedX, y: localY },
    });
    if (idx == null) return;

    pane.replayHoverBarIndex = idx;
    pane.replayHoverLocalY = localY;
    ctx.replayFutureDim?.refreshAll?.();
  }

  /** @param {object} pane @param {number} chartTime */
  function isCrosshairPastLastBar(pane, chartTime) {
    const lastChartTime = lastBarChartTime(pane);
    if (lastChartTime == null || chartTime == null || !Number.isFinite(chartTime)) return false;

    const idx = pane.timeAdapter?.index.chart(chartTime);
    if (idx != null) return idx >= pane.bars.length;

    return chartTime > lastChartTime;
  }

  /** @param {object} pane @param {number} localX @param {number} localY */
  function setClampedCrosshairAtLocal(pane, localX, localY) {
    if (!pane?.chart || !pane?.series || clampingCrosshair) return;

    const maxX = lastBarCoordinateX(pane);
    const pastBoundary = maxX != null && localX > maxX + 0.5;
    const clampedX = maxX != null ? Math.min(localX, maxX) : localX;
    const lastChartTime = lastBarChartTime(pane);
    if (lastChartTime == null) return;

    const point = pane.timeAdapter?.coord.fromPixel(pane.chart, pane.series, clampedX, localY);
    const timePastLastBar = point?.time != null && isCrosshairPastLastBar(pane, point.time);

    if (!pastBoundary && !timePastLastBar) return;

    let chartTime = lastChartTime;
    let price = pane.series.coordinateToPrice(localY);

    if (!timePastLastBar && point?.time != null) {
      chartTime = point.time;
    }
    if (point?.price != null && Number.isFinite(point.price)) {
      price = point.price;
    }

    if (price == null || !Number.isFinite(price)) {
      price = pane.bars[pane.bars.length - 1]?.close;
    }
    if (price == null || !Number.isFinite(price)) return;

    clampingCrosshair = true;
    try {
      pane.chart.setCrosshairPosition(price, chartTime, pane.series);
    } finally {
      clampingCrosshair = false;
    }
  }

  /** @param {object} pane @param {PointerEvent} ev */
  function onPanePointerMove(pane, ev) {
    const state = replay.getState();
    if (!state.active || !state.selectingBar || state.selectMode !== "bar") return;
    if (!(pane.el instanceof HTMLElement)) return;

    const rect = pane.el.getBoundingClientRect();
    const localX = ev.clientX - rect.left;
    const localY = ev.clientY - rect.top;

    updateReplayHover(pane, localX, localY);
    setClampedCrosshairAtLocal(pane, localX, localY);
  }

  /** @param {object} pane @param {PointerEvent} ev */
  function onPanePointerLeave(pane, ev) {
    if (ev.relatedTarget instanceof Node && pane.el.contains(ev.relatedTarget)) return;
    clearReplayHover(pane);
    ctx.replayFutureDim?.refreshAll?.();
  }

  function attachPointerClamp(pane) {
    if (!(pane.el instanceof HTMLElement) || pointerClampHandlers.has(pane.index)) return;

    const onMove = (ev) => onPanePointerMove(pane, ev);
    const onLeave = (ev) => onPanePointerLeave(pane, ev);

    pane.el.addEventListener("pointermove", onMove);
    pane.el.addEventListener("pointerleave", onLeave);
    pane.el.classList.add(REPLAY_SELECT_BAR_CLASS);
    pointerClampHandlers.set(pane.index, { onMove, onLeave });
  }

  function detachPointerClamp(pane) {
    if (!(pane.el instanceof HTMLElement)) return;

    const handlers = pointerClampHandlers.get(pane.index);
    if (handlers) {
      pane.el.removeEventListener("pointermove", handlers.onMove);
      pane.el.removeEventListener("pointerleave", handlers.onLeave);
      pointerClampHandlers.delete(pane.index);
    }

    pane.el.classList.remove(REPLAY_SELECT_BAR_CLASS);
    clearReplayHover(pane);
  }

  function detachAllPointerClamp() {
    for (const pane of ctx.getAllChartPanes()) detachPointerClamp(pane);
    pointerClampHandlers.clear();
  }

  /** @param {object} pane @param {import("lightweight-charts").MouseEventParams} param */
  function onCrosshairMove(pane, param) {
    if (clampingCrosshair) return;

    const state = replay.getState();
    if (!state.active || !state.selectingBar || state.selectMode !== "bar") return;
    if (!param?.point || param.time == null) return;

    updateReplayHover(pane, param.point.x, param.point.y);
    setClampedCrosshairAtLocal(pane, param.point.x, param.point.y);
  }

  function attachCrosshairClamp(pane) {
    if (!pane?.chart || crosshairClampHandlers.has(pane.index)) return;
    const handler = (param) => onCrosshairMove(pane, param);
    pane.chart.subscribeCrosshairMove(handler);
    crosshairClampHandlers.set(pane.index, handler);
  }

  function detachAllCrosshairClamp() {
    for (const [idx, handler] of crosshairClampHandlers) {
      const pane = ctx.chartPanes.get(idx);
      pane?.chart?.unsubscribeCrosshairMove(handler);
    }
    crosshairClampHandlers.clear();
  }

  function attachCutLineSync(pane) {
    if (!pane?.chart || cutLineSyncHandlers.has(pane.index)) return;

    const ts = pane.chart.timeScale();
    const onRange = () => ctx.replayFutureDim?.refreshAll?.();
    ts.subscribeVisibleLogicalRangeChange(onRange);
    cutLineSyncHandlers.set(pane.index, () => {
      ts.unsubscribeVisibleLogicalRangeChange(onRange);
    });
  }

  function detachCutLineSync(pane) {
    const unsub = cutLineSyncHandlers.get(pane.index);
    unsub?.();
    cutLineSyncHandlers.delete(pane.index);
  }

  function detachAllCutLineSync() {
    for (const pane of ctx.getAllChartPanes()) detachCutLineSync(pane);
    cutLineSyncHandlers.clear();
  }

  function activePaneIndex() {
    return ctx.layoutManager?.getActivePaneIndex?.() ?? 0;
  }

  /** @param {object} pane @param {import("lightweight-charts").MouseEventParams} param */
  function resolveBarIndex(pane, param) {
    if (!param?.time || !pane?.bars?.length) return null;

    const bars = pane.bars;
    const ta = pane.timeAdapter;
    if (ta) {
      const idx = ta.index.chart(param.time);
      if (idx != null && idx >= 0 && idx < bars.length) return idx;
    }

    const utcTime = resolveUtcBarTime(ta, param.time);
    return nearestBarIndex(bars, utcTime);
  }

  /** @param {number} paneIndex @param {import("lightweight-charts").MouseEventParams} param */
  function onChartClick(paneIndex, param) {
    const state = replay.getState();
    if (!state.active || !state.selectingBar || state.selectMode !== "bar") return;
    if (paneIndex !== activePaneIndex()) return;
    if (!param.point || param.time == null) return;

    const pane = ctx.chartPanes.get(paneIndex);
    if (!pane) return;

    const index = resolveBarIndex(pane, param);
    if (index == null) return;

    const bar = pane.bars[index];
    if (param.point?.y != null) pane.replayCutLocalY = param.point.y;
    clearReplayHover(pane);
    replayDebug("selectBar.click", { index, time: bar?.time });
    replay.setSelectedBar(index, bar.time);
  }

  function attachPane(pane) {
    if (!pane?.chart || clickHandlers.has(pane.index)) return;
    const handler = (param) => onChartClick(pane.index, param);
    pane.chart.subscribeClick(handler);
    clickHandlers.set(pane.index, handler);

    if (crosshairSelecting && pane.el instanceof HTMLElement) {
      applyReplaySelectCrosshair(pane.chart, pane.el, pane.series);
    }
    if (crosshairSelecting) attachCrosshairClamp(pane);
    if (crosshairSelecting) attachPointerClamp(pane);
    attachCutLineSync(pane);
  }

  function attachAllPanes() {
    for (const pane of ctx.getAllChartPanes()) attachPane(pane);
  }

  function syncSelectBarCrosshair(selecting) {
    if (selecting === crosshairSelecting) return;

    if (selecting) {
      for (const pane of ctx.getAllChartPanes()) {
        if (!pane.chart || !(pane.el instanceof HTMLElement)) continue;
        applyReplaySelectCrosshair(pane.chart, pane.el, pane.series);
        attachCrosshairClamp(pane);
        attachPointerClamp(pane);
      }
    } else {
      detachAllCrosshairClamp();
      detachAllPointerClamp();
      restoreChartCrosshair(ctx);
      for (const pane of ctx.getAllChartPanes()) clearReplayHover(pane);
    }

    crosshairSelecting = selecting;
    ctx.replayFutureDim?.refreshAll?.();
  }

  /** @param {{ active: boolean, selectedBarIndex: number | null, selectingBar: boolean, selectMode: import("./icons.js").ReplaySelectMode }} state */
  function sync(state) {
    const selectingBarMode = state.active && state.selectingBar && state.selectMode === "bar";
    syncSelectBarCrosshair(selectingBarMode);

    if (!state.active) {
      prevSelecting = false;
      prevMode = "bar";
      if (crosshairSelecting) syncSelectBarCrosshair(false);
      detachAllCutLineSync();
      for (const pane of ctx.getAllChartPanes()) clearReplayHover(pane);
    ctx.replayFutureDim?.refreshAll?.();
    return;
  }
  attachAllPanes();

    prevSelecting = state.selectingBar;
    prevMode = state.selectMode;
  }

  replay.subscribe(sync);
}
