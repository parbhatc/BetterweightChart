/**
 * @typedef {{ symbol: string, resolution: string, countBack: number }} HtfNeed
 * @typedef {{ resolution: string, countBack: number }} CompareHtfNeed
 * @typedef {{ symbol: string, chartCountBack: number, htf?: CompareHtfNeed[] }} CompareNeed
 * @typedef {{ htf?: HtfNeed[], compare?: CompareNeed[] }} IndicatorDataNeeds
 * @typedef {{ htf: Map<string, number>, compareChart: Map<string, number>, compareHtf: Map<string, number> }} PaneDataNeeds
 */

/** @param {string} symbol @param {string} resolution */
function htfKey(symbol, resolution) {
  return `${symbol}|${resolution}`;
}

/** @returns {PaneDataNeeds} */
export function emptyPaneDataNeeds() {
  return {
    htf: new Map(),
    compareChart: new Map(),
    compareHtf: new Map(),
  };
}

/**
 * @param {PaneDataNeeds} target
 * @param {IndicatorDataNeeds | null | undefined} partial
 */
export function mergeDataNeeds(target, partial) {
  if (!partial) return target;
  for (const item of partial.htf ?? []) {
    if (!item?.symbol || !item.resolution) continue;
    const key = htfKey(item.symbol, item.resolution);
    target.htf.set(key, Math.max(target.htf.get(key) ?? 0, item.countBack));
  }
  for (const item of partial.compare ?? []) {
    if (!item?.symbol) continue;
    target.compareChart.set(
      item.symbol,
      Math.max(target.compareChart.get(item.symbol) ?? 0, item.chartCountBack),
    );
    for (const htf of item.htf ?? []) {
      if (!htf?.resolution) continue;
      const key = htfKey(item.symbol, htf.resolution);
      target.compareHtf.set(key, Math.max(target.compareHtf.get(key) ?? 0, htf.countBack));
    }
  }
  return target;
}

/**
 * @param {import("../types.js").IndicatorInstance[]} instances
 * @param {{ symbol?: string, resolution?: string, bars?: object[] }} pane
 * @param {(id: string) => typeof import("../BaseIndicator.js").BaseIndicator | null} getIndicatorClass
 */
export function collectPaneDataNeeds(instances, pane, getIndicatorClass) {
  const needs = emptyPaneDataNeeds();
  for (const inst of instances) {
    const Indicator = getIndicatorClass(inst.defId);
    if (!Indicator) continue;
    mergeDataNeeds(needs, Indicator.collectDataNeeds(inst, pane));
  }
  return needs;
}

/** @param {PaneDataNeeds} needs */
export function paneDataNeedsEmpty(needs) {
  return !needs.htf.size && !needs.compareChart.size && !needs.compareHtf.size;
}
