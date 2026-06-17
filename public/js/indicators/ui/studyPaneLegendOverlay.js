import { mountIndicatorLegend } from "./legend.js";
import { lwcPaneTops } from "../../chart/pane/studyScale.js";

/**
 * HTML study-pane legends (interactive hover/actions), positioned over LWC panes.
 * @param {object} opts
 * @param {HTMLElement} opts.stageEl chart stage wrapper (position:relative)
 * @param {import("lightweight-charts").IChartApi} opts.chart
 * @param {(lwcPaneIndex: number) => object[]} opts.getStudiesForLwcPane
 * @param {object} opts.actions
 * @param {() => void} [opts.onLayout]
 */
export function attachStudyPaneLegendOverlay(opts) {
  const { stageEl, chart, getStudiesForLwcPane, actions, onLayout } = opts;

  const root = document.createElement("div");
  root.className = "study-pane-legends";
  stageEl.appendChild(root);

  /** @type {Map<number, { wrap: HTMLElement, legend: ReturnType<typeof mountIndicatorLegend> }>} */
  const byPane = new Map();

  function ensurePane(lwcPaneIndex) {
    let entry = byPane.get(lwcPaneIndex);
    if (!entry) {
      const wrap = document.createElement("div");
      wrap.className = "study-pane-legends__pane";
      wrap.dataset.lwcPane = String(lwcPaneIndex);
      root.appendChild(wrap);

      const statusEl = document.createElement("div");
      statusEl.className = "status-line study-pane-legends__status";
      wrap.appendChild(statusEl);

      const legend = mountIndicatorLegend(statusEl, {
        getStudies: () => getStudiesForLwcPane(lwcPaneIndex),
        onSelect: actions.onSelect,
        onToggleHidden: actions.onToggleHidden,
        onOpenSettings: actions.onOpenSettings,
        onRemove: actions.onRemove,
      });
      entry = { wrap, legend };
      byPane.set(lwcPaneIndex, entry);
    }
    return entry;
  }

  function reposition() {
    onLayout?.();
    const tops = lwcPaneTops(chart);
    for (const [idx, { wrap }] of byPane) {
      const top = tops[idx];
      if (top == null || !Number.isFinite(top) || idx < 1 || idx >= tops.length) {
        wrap.hidden = true;
        continue;
      }
      wrap.hidden = false;
      wrap.style.top = `${top}px`;
    }
  }

  function render() {
    const paneCount = chart.panes?.().length ?? 1;
    const tops = lwcPaneTops(chart);
    /** @type {Set<number>} */
    const active = new Set();
    for (let i = 1; i < paneCount; i += 1) {
      if (i >= tops.length) continue;
      const studies = getStudiesForLwcPane(i);
      if (!studies.length) continue;
      active.add(i);
      ensurePane(i).legend.render();
    }
    for (const [idx, entry] of [...byPane]) {
      if (!active.has(idx)) {
        entry.wrap.remove();
        byPane.delete(idx);
      }
    }
    reposition();
  }

  const onResize = () => reposition();
  window.addEventListener("resize", onResize);
  chart.timeScale().subscribeVisibleLogicalRangeChange(onResize);

  return {
    render,
    reposition,
    destroy: () => {
      window.removeEventListener("resize", onResize);
      root.remove();
      byPane.clear();
    },
  };
}
