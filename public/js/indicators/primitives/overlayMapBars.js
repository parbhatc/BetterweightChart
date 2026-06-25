/** @param {object[]} seriesData @param {object[]} ctxMapBars */
export function resolveOverlayMapBars(seriesData, ctxMapBars) {
  if (!ctxMapBars?.length) return { mapBars: seriesData, useAdapter: false };
  if (!seriesData?.length) return { mapBars: ctxMapBars, useAdapter: true };
  if (seriesData.length !== ctxMapBars.length) {
    const useSeries = seriesData.length > ctxMapBars.length;
    return { mapBars: useSeries ? seriesData : ctxMapBars, useAdapter: !useSeries };
  }
  if (
    seriesData[0]?.time !== ctxMapBars[0]?.time ||
    seriesData.at(-1)?.time !== ctxMapBars.at(-1)?.time
  ) {
    return { mapBars: seriesData, useAdapter: false };
  }
  return { mapBars: ctxMapBars, useAdapter: true };
}
