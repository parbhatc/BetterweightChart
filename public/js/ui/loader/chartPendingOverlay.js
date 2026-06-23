/** @param {object | object[]} panes */
export function chartStagesForPanes(panes) {
  const list = Array.isArray(panes) ? panes : [panes];
  /** @type {Set<HTMLElement>} */
  const stages = new Set();
  for (const pane of list) {
    const el = pane?.el;
    if (!(el instanceof HTMLElement)) continue;
    const stage =
      el.closest(".tv-chart-wrap__stage") ??
      el.closest(".tv-chart-wrap")?.querySelector(".tv-chart-wrap__stage");
    if (stage instanceof HTMLElement) stages.add(stage);
  }
  return [...stages];
}

function nextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

/**
 * @param {{ chartOverlayLoader: { show: (roots?: HTMLElement | HTMLElement[]) => void } }} ctx
 * @param {object | object[]} panes
 */
export async function showChartPendingOverlay(ctx, panes) {
  const stages = chartStagesForPanes(panes);
  if (!stages.length) return;
  ctx.chartOverlayLoader.show(stages);
  await nextPaint();
}

/** @param {{ chartOverlayLoader: { hide: () => void | Promise<void> } }} ctx */
export async function hideChartPendingOverlay(ctx) {
  await ctx.chartOverlayLoader.hide();
}
