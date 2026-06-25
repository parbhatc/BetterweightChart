import { resolvePriceScalePlacement } from "../scale/settings.js";

/** @param {object} pane @param {() => object} getSettings */
export function syncStatusLineLayout(pane, getSettings) {
  const el = pane.statusEl;
  if (!el || !pane.chart) return;

  const sc = getSettings().scales ?? {};
  const { left: scaleLeft, right: scaleRight } = resolvePriceScalePlacement(sc.scalesPlacement);
  const chart = pane.chart;
  const rw = chart.priceScale("right").width?.() ?? 0;
  const lw = chart.priceScale("left").width?.() ?? 0;
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
    if (shouldDefer()) {
      layoutPending = true;
      return;
    }
    layoutPending = false;
    syncStatusLineLayout(pane, getSettings);
  };

  pane._flushStatusLineLayout = () => {
    if (!layoutPending) return;
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
