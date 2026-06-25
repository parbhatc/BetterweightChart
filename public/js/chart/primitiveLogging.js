/** @param {import("lightweight-charts").ISeriesApi} series @param {string} [context] */
export function patchSeriesPrimitiveLogging(series, context = "") {
  if (series.__bwcPrimitiveLogging) return series;

  const attach = series.attachPrimitive.bind(series);
  const detach = series.detachPrimitive.bind(series);

  series.attachPrimitive = (primitive) => {
    console.log("[BWC] attachPrimitive", {
      context,
      primitive: primitive?.constructor?.name ?? primitive,
      primitive,
    });
    return attach(primitive);
  };

  series.detachPrimitive = (primitive) => {
    console.log("[BWC] detachPrimitive", {
      context,
      primitive: primitive?.constructor?.name ?? primitive,
      primitive,
    });
    return detach(primitive);
  };

  series.__bwcPrimitiveLogging = true;
  return series;
}

/** @param {import("lightweight-charts").IChartApi} chart @param {string} [context] */
export function patchChartPrimitiveLogging(chart, context = "") {
  if (chart.__bwcPrimitiveLogging) return chart;

  const addSeries = chart.addSeries.bind(chart);
  chart.addSeries = (...args) => {
    const series = addSeries(...args);
    patchSeriesPrimitiveLogging(series, context);
    return series;
  };

  chart.__bwcPrimitiveLogging = true;
  return chart;
}
