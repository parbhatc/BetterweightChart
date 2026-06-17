/**
 * Helpers for independent study-pane price scales (e.g. RSI 0–100).
 */

/** @param {import("lightweight-charts").IChartApi} chart @param {number} y */
export function lwcPaneIndexAtY(chart, y) {
  const panes = chart.panes?.();
  if (!panes?.length) return 0;
  let offset = 0;
  for (let i = 0; i < panes.length; i += 1) {
    const h = panes[i].getHeight();
    if (y < offset + h) return i;
    offset += h;
  }
  return panes.length - 1;
}

/** @param {import("lightweight-charts").IChartApi} chart */
export function lwcPaneTops(chart) {
  const panes = chart.panes?.();
  if (!panes?.length) return [0];
  /** @type {number[]} */
  const tops = [];
  let offset = 0;
  for (let i = 0; i < panes.length; i += 1) {
    tops.push(offset);
    offset += panes[i].getHeight();
  }
  return tops;
}

/**
 * @param {HTMLElement} chartEl
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {(lwcPaneIndex: number) => { min: number, max: number } | null | undefined} getStudyScaleLock
 */
export function attachStudyPaneScaleGuards(chartEl, chart, getStudyScaleLock, onResyncScales) {
  function studyPaneAtPoint(clientX, clientY) {
    const rect = chartEl.getBoundingClientRect();
    const y = clientY - rect.top;
    const x = clientX - rect.left;
    const lwcPane = lwcPaneIndexAtY(chart, y);
    const lock = getStudyScaleLock?.(lwcPane);
    if (!lock) return null;

    const rw = chart.priceScale("right").width();
    const lw = chart.priceScale("left").width();
    const onPriceAxis = (rw > 0 && x >= rect.width - rw) || (lw > 0 && x <= lw);
    return onPriceAxis ? lwcPane : null;
  }

  chartEl.addEventListener(
    "wheel",
    (ev) => {
      if (studyPaneAtPoint(ev.clientX, ev.clientY) == null) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    },
    { capture: true, passive: false },
  );

  chartEl.addEventListener(
    "pointerdown",
    (ev) => {
      if (studyPaneAtPoint(ev.clientX, ev.clientY) == null) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    },
    { capture: true },
  );

  if (onResyncScales) {
    chartEl.addEventListener("pointerup", () => onResyncScales(), { capture: true });
  }
}
