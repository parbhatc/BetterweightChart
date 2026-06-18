import { createTvChart } from "../../../chart/view/index.js";
import {
  enforcePriceBarRatio,
  enforcePriceBarRatioOnPriceZoom,
} from "../../../chart/price/barRatio.js";
import { ensureDebugHud } from "../../../debug/chart/hud.js";
import { createPanFpsMonitor } from "../../../debug/chart/index.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function initPrimaryChart(ctx) {
  const { chart, series, applyTheme, scrollToLatest } = createTvChart(ctx.el, ctx.themeColors);
  ctx.chart = chart;
  ctx.series = series;
  ctx.applyTheme = applyTheme;
  ctx.scrollToLatest = scrollToLatest;

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
      enforcePriceBarRatio(chart, series, ctx.activePriceScaleId(), target);
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
        panning: stats.panning !== false,
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
      requestAnimationFrame(() => enforcePriceBarRatioOnPriceZoom(chart, series, target));
    },
    true,
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
    futureWhitespaceBars: null,
    statusEl: ctx.statusEl ?? null,
    timeAdapter: null,
  });

  ctx.resetChartView = () => {
    const primary = ctx.chartPanes.get(0);
    if (primary) primary._manualScaleLocked = false;
    const margins = { top: 0.08, bottom: 0.12 };
    series.priceScale().applyOptions({ autoScale: true, scaleMargins: margins });
    chart.priceScale(ctx.activePriceScaleId()).applyOptions({ autoScale: true, scaleMargins: margins });
    if (ctx.bars.length) scrollToLatest(ctx.bars.length);
  };

  ctx.resetTimeScale = () => {
    chart.timeScale().resetTimeScale();
    if (ctx.bars.length) scrollToLatest(ctx.bars.length);
  };
}
