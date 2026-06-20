/** @param {object} ctx @param {string} [symbol] @param {string} resolution */
export function getSecuritySeries(ctx, symbol, resolution) {
  return (
    ctx.getSecurityBars?.(symbol, resolution) ??
    ctx.getBars?.(resolution) ??
    ctx.getHtfBars?.(resolution) ??
    null
  );
}

/** @param {object} ctx @param {string} [symbol] @param {string} resolution @param {number} countBack */
export function requestSecuritySeries(ctx, symbol, resolution, countBack) {
  ctx.requestSecurityBars?.(symbol, resolution, countBack);
  ctx.requestBars?.(resolution, countBack);
  ctx.requestHtfBars?.(resolution, countBack);
}

/** @param {{ utcBars: object[], chartBars?: object[] }} htf */
export function mapHtfBarsToSeries(htf) {
  return htf.utcBars.map((b, i) => ({
    ...b,
    sourceIndex: i,
    startSourceIndex: i,
    chartTime: htf.chartBars[i]?.time ?? b.time,
    confirmChartTime: htf.chartBars[i]?.time ?? b.time,
  }));
}
