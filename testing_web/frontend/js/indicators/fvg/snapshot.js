/** @param {Map<string, object[]> | undefined} map */
export function cloneZoneMap(map) {
  if (!map) return new Map();
  return new Map([...map.entries()].map(([key, zones]) => [key, zones.map((zone) => ({ ...zone }))]));
}

/** @param {object} script */
export function captureFvgSnapshot(script) {
  const state = script.state;
  return {
    skip: Boolean(state.skip),
    barLen: script.bars.length,
    cfg: state.cfg ? { ...state.cfg } : null,
    chartLayers: (state.chartLayers ?? []).map((entry) => ({
      layer: entry.layer,
      startIdx: entry.startIdx,
      series: entry.series.map((bar) => (bar ? { ...bar } : bar)),
    })),
    htfLayers: (state.htfLayers ?? []).map((entry) => ({
      layer: entry.layer,
      series: entry.series.map((bar) => (bar ? { ...bar } : bar)),
    })),
    layerActive: cloneZoneMap(state.layerActive),
    layerIfvg: cloneZoneMap(state.layerIfvg),
    compareSeriesByLayer: state.compareSeriesByLayer
      ? new Map(
          [...state.compareSeriesByLayer.entries()].map(([key, series]) => [
            key,
            series.map((bar) => (bar ? { ...bar } : bar)),
          ]),
        )
      : null,
  };
}

/** @param {object} script @param {object} snapshot */
export function restoreFvgSnapshot(script, snapshot) {
  script.state.skip = snapshot.skip;
  script.state.cfg = snapshot.cfg ? { ...snapshot.cfg } : null;
  script.state.htfLayers = snapshot.htfLayers;
  script.state.compareSeriesByLayer = snapshot.compareSeriesByLayer;
  script.state.layerActive = cloneZoneMap(snapshot.layerActive);
  script.state.layerIfvg = cloneZoneMap(snapshot.layerIfvg);
}
