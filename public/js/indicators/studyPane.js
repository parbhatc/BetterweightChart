import { getIndicatorClass } from "./catalog.js";

/** @param {typeof import("./BaseIndicator.js").BaseIndicator} Indicator */
export function studyPaneOrderOf(Indicator) {
  if (!Indicator) return null;
  if (Indicator.studyPaneOrder != null) return Indicator.studyPaneOrder;
  if (Indicator.studyPaneIndex != null) return Indicator.studyPaneIndex - 1;
  return null;
}

/** @param {typeof import("./BaseIndicator.js").BaseIndicator} Indicator */
export function isStudyPaneIndicator(Indicator) {
  return studyPaneOrderOf(Indicator) != null;
}

/**
 * @param {() => import("./types.js").IndicatorInstance[]} indicatorsForPane
 * @param {number} paneIndex
 */
export function activeStudyOrdersOnPane(indicatorsForPane, paneIndex) {
  /** @type {Set<number>} */
  const orders = new Set();
  for (const inst of indicatorsForPane(paneIndex)) {
    if (inst.hidden) continue;
    const Indicator = getIndicatorClass(inst.defId);
    const order = studyPaneOrderOf(Indicator);
    if (order != null) orders.add(order);
  }
  return [...orders].sort((a, b) => a - b);
}

/**
 * @param {() => import("./types.js").IndicatorInstance[]} indicatorsForPane
 * @param {number} paneIndex
 */
export function allStudyOrdersOnPane(indicatorsForPane, paneIndex) {
  /** @type {Set<number>} */
  const orders = new Set();
  for (const inst of indicatorsForPane(paneIndex)) {
    const Indicator = getIndicatorClass(inst.defId);
    const order = studyPaneOrderOf(Indicator);
    if (order != null) orders.add(order);
  }
  return [...orders].sort((a, b) => a - b);
}

/**
 * @param {() => import("./types.js").IndicatorInstance[]} indicatorsForPane
 * @param {number} paneIndex
 */
export function assignStudyLwcPanes(indicatorsForPane, paneIndex) {
  const orders = allStudyOrdersOnPane(indicatorsForPane, paneIndex);
  for (const inst of indicatorsForPane(paneIndex)) {
    const Indicator = getIndicatorClass(inst.defId);
    const order = studyPaneOrderOf(Indicator);
    if (order == null) {
      inst._lwcStudyPane = null;
      continue;
    }
    const slot = orders.indexOf(order);
    inst._lwcStudyPane = slot >= 0 ? 1 + slot : null;
  }
}

/**
 * @param {() => import("./types.js").IndicatorInstance[]} indicatorsForPane
 * @param {number} paneIndex
 * @param {number} order
 */
export function studyPaneHeightForOrder(indicatorsForPane, paneIndex, order) {
  for (const inst of indicatorsForPane(paneIndex)) {
    if (inst.hidden) continue;
    const Indicator = getIndicatorClass(inst.defId);
    if (studyPaneOrderOf(Indicator) === order) return Indicator.studyPaneHeight ?? 110;
  }
  return 110;
}

/**
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {() => import("./types.js").IndicatorInstance[]} indicatorsForPane
 * @param {number} paneIndex
 */
export function syncAllStudyPanes(chart, indicatorsForPane, paneIndex) {
  const orders = activeStudyOrdersOnPane(indicatorsForPane, paneIndex);
  const panes = chart.panes?.();
  if (!panes?.length) return;

  for (let slot = 0; slot < orders.length; slot += 1) {
    const lwcIdx = 1 + slot;
    const height = studyPaneHeightForOrder(indicatorsForPane, paneIndex, orders[slot]);
    panes[lwcIdx]?.setHeight(height);
  }

  for (let i = 1 + orders.length; i < panes.length; i += 1) {
    panes[i]?.setHeight(1);
  }
}
