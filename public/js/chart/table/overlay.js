import { renderChartTable } from "./render.js";

/**
 * Mounts TradingView-style tables on a chart pane stage.
 * @param {{ mountEl: HTMLElement }} opts
 */
export function createChartTableOverlay(opts) {
  const { mountEl } = opts;
  const root = document.createElement("div");
  root.className = "chart-table-overlay";
  root.setAttribute("aria-live", "polite");
  mountEl.appendChild(root);

  /** @param {import("./types.js").ChartTable[]} tables */
  function sync(tables) {
    const list = [...(tables ?? [])].sort(
      (a, b) => (a.stackIndex ?? 0) - (b.stackIndex ?? 0) || a.id.localeCompare(b.id),
    );
    if (!list.length) {
      root.innerHTML = "";
      root.hidden = true;
      return;
    }
    root.hidden = false;
    root.innerHTML = list.map(renderChartTable).join("");
  }

  function clear() {
    root.innerHTML = "";
    root.hidden = true;
  }

  function destroy() {
    root.remove();
  }

  return { el: root, sync, clear, destroy };
}

/** @param {object} pane */
export function chartTableMountEl(pane) {
  if (pane?.wrapEl instanceof HTMLElement) {
    const stage = pane.wrapEl.querySelector(".tv-chart-wrap__stage");
    if (stage instanceof HTMLElement) return stage;
    return pane.wrapEl;
  }
  if (pane?.el?.parentElement instanceof HTMLElement) {
    return pane.el.parentElement;
  }
  return null;
}
