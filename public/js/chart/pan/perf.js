/**
 * Run at most once per animation frame.
 * @template {(...args: unknown[]) => void} T
 * @param {T} fn
 * @returns {T}
 */
export function rafThrottle(fn) {
  let scheduled = false;
  /** @type {Parameters<T> | null} */
  let lastArgs = null;
  return /** @type {T} */ (
    (...args) => {
      lastArgs = args;
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const a = lastArgs;
        lastArgs = null;
        if (a) fn(...a);
      });
    }
  );
}

/**
 * Track left-button drag on chart containers (pan scroll).
 * @param {HTMLElement} container
 * @param {{ onStart?: () => void, onEnd?: () => void }} [hooks]
 */
export function trackChartPanning(container, hooks = {}) {
  let panning = false;

  const onDown = (ev) => {
    if (ev.button !== 0) return;
    panning = true;
    hooks.onStart?.();
  };

  const onEnd = () => {
    if (!panning) return;
    panning = false;
    hooks.onEnd?.();
  };

  container.addEventListener("pointerdown", onDown, { capture: true });
  window.addEventListener("pointerup", onEnd);
  window.addEventListener("pointercancel", onEnd);

  return {
    isPanning: () => panning,
    destroy() {
      container.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    },
  };
}

/**
 * Snapshot time-scale viewport state for debug logs.
 * @param {object} pane
 * @param {{ chartPanning?: boolean }} [ui]
 */
export function viewportSnapshot(pane, ui) {
  const chart = pane?.chart;
  const ts = chart?.timeScale?.();
  if (!ts) return { pane: pane?.index };
  const r = ts.getVisibleLogicalRange();
  const opts = ts.options();
  return {
    pane: pane.index,
    barSpacing: opts.barSpacing ?? null,
    minBarSpacing: opts.minBarSpacing ?? null,
    rightOffset: opts.rightOffset ?? null,
    logicalFrom: r?.from ?? null,
    logicalTo: r?.to ?? null,
    visibleBars: r != null ? Math.round(r.to - r.from) : null,
    totalBars: pane.bars?.length ?? 0,
    chartPanning: Boolean(ui?.chartPanning),
    loadingHistory: Boolean(pane._loadingHistory),
    historyRestorePending: Boolean(pane._historyRestorePending),
  };
}

/**
 * Track wheel zoom on the chart body (time scale). Price-scale wheel is ignored.
 * @param {HTMLElement} container
 * @param {object} [hooks]
 * @param {() => object} hooks.getPane
 * @param {{ start?: (mode?: string) => void, stop?: (mode?: string) => void, activeModes?: () => string[] }} [hooks.panFps]
 * @param {() => boolean} [hooks.isPanning]
 * @param {(detail: object) => void} [hooks.onZoomStart]
 * @param {(detail: object) => void} [hooks.onZoom]
 * @param {(detail: object) => void} [hooks.onZoomEnd]
 */
export function trackChartZoom(container, hooks = {}) {
  let zoomActive = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let idleTimer = null;
  /** @type {number | null} */
  let lastBarSpacing = null;

  const snap = () => {
    const pane = hooks.getPane?.();
    return pane ? viewportSnapshot(pane, { chartPanning: hooks.isPanning?.() }) : {};
  };

  const endZoom = () => {
    idleTimer = null;
    if (!zoomActive) return;
    zoomActive = false;
    hooks.onZoomEnd?.(snap());
    hooks.panFps?.stop?.("zoom");
  };

  const onWheel = (ev) => {
    const pane = hooks.getPane?.();
    const chart = pane?.chart;
    if (!chart) return;

    const rect = container.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const rw = chart.priceScale("right").width();
    const lw = chart.priceScale("left").width();
    if ((rw > 0 && x >= rect.width - rw) || (lw > 0 && x <= lw)) return;

    const ts = chart.timeScale();
    const barSpacing = ts.options().barSpacing ?? null;
    const dir = ev.deltaY < 0 ? "in" : "out";
    const detail = {
      dir,
      deltaY: ev.deltaY,
      deltaMode: ev.deltaMode,
      combinedPan: Boolean(hooks.isPanning?.()),
      barSpacing,
      barSpacingDelta:
        lastBarSpacing != null && barSpacing != null ? barSpacing - lastBarSpacing : null,
      ...snap(),
    };
    lastBarSpacing = barSpacing;

    if (!zoomActive) {
      zoomActive = true;
      hooks.panFps?.start?.("zoom");
      hooks.onZoomStart?.(detail);
    }

    if (idleTimer != null) clearTimeout(idleTimer);
    idleTimer = setTimeout(endZoom, 160);

    hooks.onZoom?.(detail);
  };

  container.addEventListener("wheel", onWheel, { capture: true, passive: true });

  return {
    isZooming: () => zoomActive,
    destroy() {
      if (idleTimer != null) clearTimeout(idleTimer);
      container.removeEventListener("wheel", onWheel, { capture: true });
    },
  };
}
