import { chartDebug, isChartDebugEnabled } from "../../debug/chart/index.js";
import { indicatorDebug } from "../../debug/chart/indicators.js";

/**
 * One-shot console messages when an indicator enters/leaves loading (spinner) state.
 * @param {string} name
 * @param {"loading" | "loaded"} phase
 * @param {{ ms?: number }} [detail]
 */
export function logIndicatorLoad(name, phase, detail = {}) {
  if (isChartDebugEnabled()) {
    indicatorDebug(`load.${phase}`, { name, ...detail });
    return;
  }
  const label = `[BWC:indicator] ${name}`;
  if (phase === "loading") {
    console.log(`${label} loading`);
    return;
  }
  const ms = detail.ms != null ? ` (${detail.ms}ms)` : "";
  console.log(`${label} loaded${ms}`);
}
