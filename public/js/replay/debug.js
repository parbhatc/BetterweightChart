import { chartDebug, isChartDebugEnabled } from "../debug/chart/index.js";

/**
 * @param {string} action
 * @param {unknown} [detail]
 */
export function replayDebug(action, detail) {
  chartDebug("replay", action, detail);
}

/**
 * @param {Record<string, unknown>} state
 */
export function replayDebugState(state) {
  if (!isChartDebugEnabled()) return;
  chartDebug("replay", "state", state);
}
