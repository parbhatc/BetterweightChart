import { createTvChart } from "../../../chart/view/index.js";
import {
  scrollPaneToLatest as scrollPaneToLatestViewport,
  resetPanePriceScale,
} from "../../../chart/viewportReset.js";
import {
  enforcePriceBarRatio,
  enforcePriceBarRatioOnPriceZoom,
} from "../../../chart/price/barRatio.js";
import { ensureDebugHud } from "../../../debug/chart/hud.js";
import { createPanFpsMonitor, chartDebugThrottle } from "../../../debug/chart/index.js";
import { lwcPaneIndexAtY } from "../../../chart/pane/studyScale.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function initPrimaryChart(ctx) {
  const { chart, series, applyTheme } = createTvChart(ctx.el, ctx.themeColors);
  ctx.chart = chart;
  ctx.series = series;
  ctx.applyTheme = applyTheme;

  let ratioLockBusy = false;

  function lockedRatioTarget() {
    const sc = ctx.settingsStore.get().scales ?? {};
    if (!sc.lockPriceToBarRatio) return null;
    const target = Number(sc.lockPriceToBarRatioValue);
    return Number.isFinite(target) && target > 0 ? target : null;
  }

  function maintainLockedRatio() {
    const target = lockedRatioTarget();
    if (target == null || ratioLockBusy) return;
    if ([...ctx.chartPanes.values()].some((p) => p._historyRestorePending)) return;
    ratioLockBusy = true;
    try {
      const scaleId = ctx.activePriceScaleId();
      for (const pane of ctx.chartPanes.values()) {
        if (!pane.chart || !pane.series) continue;
        enforcePriceBarRatio(pane.chart, pane.series, scaleId, target);
      }
    } finally {
      ratioLockBusy = false;
    }
  }
  ctx.maintainLockedRatio = maintainLockedRatio;

  if (ctx.debugOn) ctx.debugHud = ensureDebugHud();
  ctx.panFps = createPanFpsMonitor({
    onSample: (stats) => {
      ctx.debugHud?.setPanStats({
        fps: stats.fps,
        panning: Boolean(stats.panning),
        zooming: Boolean(stats.zooming),
        modes: stats.modes ?? [],
      });
    },
  });

  ctx.el.addEventListener(
    "wheel",
    (ev) => {
      const rect = ctx.el.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const rw = chart.priceScale("right").width();
      const lw = chart.priceScale("left").width();
      const onRight = rw > 0 && x >= rect.width - rw;
      const onLeft = lw > 0 && x <= lw;
      if (!onRight && !onLeft) return;
      const target = lockedRatioTarget();
      if (target == null) return;
      chartDebugThrottle(
        "zoom",
        "price-wheel",
        ev.deltaY < 0 ? "price zoom in" : "price zoom out",
        { deltaY: ev.deltaY, target },
        200,
      );
      requestAnimationFrame(() => enforcePriceBarRatioOnPriceZoom(chart, series, target));
    },
    true,
  );

  const resetScaleAtPoint = (clientX, clientY) => {
    const rect = ctx.el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const rw = chart.priceScale("right").width();
    const lw = chart.priceScale("left").width();
    const onRight = rw > 0 && x >= rect.width - rw;
    const onLeft = lw > 0 && x <= lw;
    if (!onRight && !onLeft) return;
    if (lwcPaneIndexAtY(chart, y) !== 0) return;

    const pane = ctx.chartPanes.get(0);
    if (!pane) return;

    requestAnimationFrame(() => {
      resetPanePriceScale(pane, ctx.settingsStore, ctx.activePriceScaleId);
    });
  };

  ctx.el.addEventListener("dblclick", (ev) => resetScaleAtPoint(ev.clientX, ev.clientY), false);

  // Touch never fires dblclick here; detect a double-tap on the price axis manually.
  let lastAxisTap = null;
  ctx.el.addEventListener(
    "pointerup",
    (ev) => {
      if (ev.pointerType !== "touch") return;
      const now = ev.timeStamp;
      const prev = lastAxisTap;
      lastAxisTap = { x: ev.clientX, y: ev.clientY, t: now };
      if (!prev) return;
      if (now - prev.t > 350) return;
      if (Math.abs(ev.clientX - prev.x) > 24 || Math.abs(ev.clientY - prev.y) > 24) return;
      lastAxisTap = null;
      resetScaleAtPoint(ev.clientX, ev.clientY);
    },
    false,
  );

  chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
    if (ctx._layoutRestorePending) return;
    ctx.scheduleAutosaveLayout?.();
  });

  ctx.chartPanes.set(0, {
    index: 0,
    chart,
    series,
    el: ctx.el,
    symbol: ctx.symbol,
    resolution: ctx.resolution,
    symbolInfo: ctx.symbolInfo,
    bars: ctx.bars,
    statusEl: ctx.statusEl ?? null,
    timeAdapter: null,
  });

  ctx.resetChartView = () => {
    for (const pane of ctx.chartPanes.values()) {
      ctx.resetPaneChartView?.(pane);
    }
  };

  ctx.resetTimeScale = () => {
    for (const pane of ctx.chartPanes.values()) {
      ctx.resetPaneTimeScale?.(pane);
    }
  };

  ctx.scrollToLatest = (barCount) => {
    const pane = ctx.chartPanes.get(0);
    if (!pane) return;
    const count = barCount ?? pane.bars?.length ?? 0;
    if (!count) return;
    const ts = pane.chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    scrollPaneToLatestViewport(pane, ctx.settingsStore, {
      width: range ? range.to - range.from : undefined,
    });
  };
}
