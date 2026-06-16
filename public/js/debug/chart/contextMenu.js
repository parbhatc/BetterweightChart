import { chartDebug } from "./index.js";

/**
 * @param {string} menu chart | price-scale | time-scale | status
 * @param {string} action
 * @param {unknown} [detail]
 */
export function debugContextMenu(menu, action, detail) {
  chartDebug("context", `${menu}:${action}`, detail);
}

/**
 * @param {string} menu
 * @param {string} action
 * @param {() => void} close
 * @param {() => void} run
 * @param {unknown} [detail]
 */
export function runContextMenuAction(menu, action, close, run, detail) {
  debugContextMenu(menu, action, detail);
  if (action === "settings") {
    close();
    requestAnimationFrame(run);
    return;
  }
  run();
  close();
}
