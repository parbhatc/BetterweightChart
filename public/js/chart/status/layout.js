import { resolvePriceScalePlacement } from "../scale/settings.js";

/** @param {object} pane */
function isPaneStatusLayoutReady(pane) {
  if (!pane?.statusEl || !pane?.chart || !pane?.series) return false;
  if (pane._suppressHistoryPrefetch) return false;
  try {
    pane.chart.timeScale();
    return true;
  } catch {
    return false;
  }
}

/** @param {import("lightweight-charts").IChartApi} chart @param {"left" | "right"} side */
function readPriceScaleWidth(chart, side) {
  try {
    const scale = chart.priceScale?.(side);
    if (!scale?.width) return 0;
    const width = scale.width();
    return Number.isFinite(width) && width > 0 ? width : 0;
  } catch {
    return 0;
  }
}

/** @param {object} pane @param {() => object} getSettings */
export function syncStatusLineLayout(pane, getSettings) {
  if (!isPaneStatusLayoutReady(pane)) return;

  const el = pane.statusEl;
  const sc = getSettings().scales ?? {};
  const { left: scaleLeft, right: scaleRight } = resolvePriceScalePlacement(sc.scalesPlacement);
  const chart = pane.chart;

  let rw = 0;
  let lw = 0;
  try {
    rw = readPriceScaleWidth(chart, "right");
    lw = readPriceScaleWidth(chart, "left");
  } catch {
    return;
  }

  const pad = 8;

  const startInset = scaleLeft && lw > 0 ? lw + pad : pad;
  const endInset = scaleRight && rw > 0 ? rw + pad : pad;

  el.style.setProperty("--status-line-inset-start", `${startInset}px`);
  el.style.setProperty("--status-line-inset-end", `${endInset}px`);
}

/**
 * @param {object} pane
 * @param {() => object} getSettings
 * @param {{ shouldDeferRangeUpdate?: () => boolean }} [opts]
 */
export function wireStatusLineLayout(pane, getSettings, opts = {}) {
  const shouldDefer = opts.shouldDeferRangeUpdate ?? (() => false);
  let layoutPending = false;

  const run = () => {
    if (shouldDefer() || !isPaneStatusLayoutReady(pane)) {
      layoutPending = true;
      return;
    }
    layoutPending = false;
    syncStatusLineLayout(pane, getSettings);
  };

  pane._flushStatusLineLayout = () => {
    if (!layoutPending || !isPaneStatusLayoutReady(pane)) return;
    layoutPending = false;
    syncStatusLineLayout(pane, getSettings);
  };

  run();

  const chart = pane.chart;
  if (!chart) return;

  chart.timeScale().subscribeVisibleLogicalRangeChange(run);

  if (pane.el instanceof HTMLElement) {
    const ro = new ResizeObserver(run);
    ro.observe(pane.el);
    const prev = pane._statusLineLayoutCleanup;
    pane._statusLineLayoutCleanup = () => {
      prev?.();
      ro.disconnect();
      delete pane._flushStatusLineLayout;
    };
  }
}
