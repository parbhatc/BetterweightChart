/** @param {object} pane @param {"left" | "right"} [priceScaleId] */
export function capturePaneViewport(pane, priceScaleId = "right") {
  if (!pane?.chart || !pane?.series) return null;
  const margins = pane.series.priceScale().options().scaleMargins;
  const ts = pane.chart.timeScale();
  const range = ts.getVisibleLogicalRange();
  const barSpacing = ts.options().barSpacing;
  /** @type {{ scaleMargins?: { top: number, bottom: number }, logicalRange?: { from: number, to: number }, barSpacing?: number }} */
  const viewport = {};
  if (margins && Number.isFinite(margins.top) && Number.isFinite(margins.bottom)) {
    viewport.scaleMargins = { top: margins.top, bottom: margins.bottom };
  }
  if (range && Number.isFinite(range.from) && Number.isFinite(range.to)) {
    viewport.logicalRange = { from: range.from, to: range.to };
  }
  if (barSpacing != null && Number.isFinite(barSpacing)) {
    viewport.barSpacing = barSpacing;
  }
  void priceScaleId;
  return Object.keys(viewport).length ? viewport : null;
}

/** @param {object[]} panes @param {(pane: object) => "left" | "right"} priceScaleIdForPane */
export function captureAllPaneViewports(panes, priceScaleIdForPane) {
  /** @type {Record<string, object>} */
  const out = {};
  for (const pane of panes) {
    const viewport = capturePaneViewport(pane, priceScaleIdForPane(pane));
    if (viewport) out[String(pane.index)] = viewport;
  }
  return out;
}
