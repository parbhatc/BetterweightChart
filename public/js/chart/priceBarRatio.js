/**
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {import("lightweight-charts").ISeriesApi} series
 */
export function measurePriceBarRatio(chart, series) {
  const paneH = chart.paneSize().height;
  if (paneH <= 0) return null;
  const barSpacing = chart.timeScale().options().barSpacing ?? 8;
  const p0 = series.coordinateToPrice(0);
  const p1 = series.coordinateToPrice(paneH);
  if (p0 == null || p1 == null || !Number.isFinite(p0) || !Number.isFinite(p1)) return null;
  const priceRange = Math.abs(p1 - p0);
  if (priceRange <= 0) return null;
  return (barSpacing * paneH) / priceRange;
}

/**
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {import("lightweight-charts").ISeriesApi} series
 * @param {"left" | "right"} priceScaleId
 * @param {number} targetRatio
 */
export function enforcePriceBarRatio(chart, series, priceScaleId, targetRatio) {
  if (!Number.isFinite(targetRatio) || targetRatio <= 0) return null;
  const measured = measurePriceBarRatio(chart, series);
  if (measured == null) return null;
  const k = measured / targetRatio;
  if (Math.abs(k - 1) < 0.001) return measured;

  const ps = chart.priceScale(priceScaleId);
  const { scaleMargins } = ps.options();
  const top = scaleMargins?.top ?? 0.08;
  const bottom = scaleMargins?.bottom ?? 0.12;
  let visible = Math.max(0.04, 1 - top - bottom);
  visible = Math.max(0.04, Math.min(0.96, visible * k));
  const pad = (1 - visible) / 2;
  ps.applyOptions({ autoScale: false, scaleMargins: { top: pad, bottom: pad } });
  return measurePriceBarRatio(chart, series);
}

/**
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {import("lightweight-charts").ISeriesApi} series
 * @param {number} targetRatio
 */
export function enforcePriceBarRatioOnPriceZoom(chart, series, targetRatio) {
  const measured = measurePriceBarRatio(chart, series);
  if (measured == null || !Number.isFinite(targetRatio) || targetRatio <= 0) return;
  const ts = chart.timeScale();
  const barSpacing = ts.options().barSpacing ?? 8;
  const minSpacing = ts.options().minBarSpacing ?? 3;
  const next = barSpacing * (measured / targetRatio);
  ts.applyOptions({ barSpacing: Math.max(minSpacing, next) });
}
