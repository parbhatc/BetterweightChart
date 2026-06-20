/**
 * One-shot console messages when an indicator enters/leaves loading (spinner) state.
 * @param {string} name
 * @param {"loading" | "loaded"} phase
 * @param {{ ms?: number }} [detail]
 */
export function logIndicatorLoad(name, phase, detail = {}) {
  const label = `[BWC:indicator] ${name}`;
  if (phase === "loading") {
    console.log(`${label} loading`);
    return;
  }
  const ms = detail.ms != null ? ` (${detail.ms}ms)` : "";
  console.log(`${label} loaded${ms}`);
}
