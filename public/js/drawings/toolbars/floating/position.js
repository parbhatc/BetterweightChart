/**
 * Chart stage that floating toolbars should stay inside (not the full window).
 * @returns {HTMLElement | null}
 */
export function resolveChartStageEl() {
  if (typeof document === "undefined") return null;
  const drawingToolbar = document.getElementById("drawing-toolbar");
  const fromToolbar =
    drawingToolbar?.closest(".tv-stage") ??
    drawingToolbar?.closest(".tv-chart-wrap__stage") ??
    drawingToolbar?.closest(".tv-workspace");
  if (fromToolbar instanceof HTMLElement) return fromToolbar;
  return (
    document.querySelector(".tv-stage") ??
    document.querySelector(".tv-chart-wrap__stage") ??
    document.querySelector(".tv-workspace")
  );
}

/**
 * @param {number} [pad]
 */
function getVisualViewportBox(pad = 8) {
  const vv = window.visualViewport;
  const left = vv?.offsetLeft ?? 0;
  const top = vv?.offsetTop ?? 0;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  return { left: left + pad, top: top + pad, right: left + width - pad, bottom: top + height - pad };
}

/**
 * Clamp box for a floating toolbar: intersection of chart stage and visual viewport.
 * @param {HTMLElement} root
 * @param {number} [pad]
 */
function getFloatingToolbarClampBox(root, pad = 8) {
  const rect = root.getBoundingClientRect();
  const w = root.offsetWidth || rect.width || 200;
  const h = root.offsetHeight || rect.height || 40;

  const view = getVisualViewportBox(pad);
  let minLeft = view.left;
  let minTop = view.top;
  let maxLeft = view.right - w;
  let maxTop = view.bottom - h;

  const stage = resolveChartStageEl();
  const sr = stage?.getBoundingClientRect();
  if (sr && sr.width > pad * 2 && sr.height > pad * 2) {
    minLeft = Math.max(minLeft, sr.left + pad);
    minTop = Math.max(minTop, sr.top + pad);
    maxLeft = Math.min(maxLeft, sr.right - w - pad);
    maxTop = Math.min(maxTop, sr.bottom - h - pad);
  }

  if (maxLeft < minLeft) maxLeft = minLeft;
  if (maxTop < minTop) maxTop = minTop;

  return { minLeft, minTop, maxLeft, maxTop };
}

/**
 * Bounds used to decide whether a saved toolbar position is still valid.
 * @param {number} [pad]
 */
function getFloatingToolbarBoundsRect(pad = 8) {
  const stage = resolveChartStageEl();
  const sr = stage?.getBoundingClientRect();
  if (sr && sr.width > pad * 2 && sr.height > pad * 2) {
    return { left: sr.left + pad, top: sr.top + pad, right: sr.right - pad, bottom: sr.bottom - pad };
  }
  const view = getVisualViewportBox(pad);
  return { left: view.left, top: view.top, right: view.right, bottom: view.bottom };
}

/**
 * Keep fixed floating toolbars inside the chart stage (and visible viewport).
 * @param {HTMLElement} root
 * @param {{ left: number, top: number }} pos
 * @param {number} [pad]
 */
export function clampFloatingToolbarPos(root, pos, pad = 8) {
  const { minLeft, minTop, maxLeft, maxTop } = getFloatingToolbarClampBox(root, pad);
  return {
    left: Math.min(Math.max(minLeft, pos.left), maxLeft),
    top: Math.min(Math.max(minTop, pos.top), maxTop),
  };
}

/**
 * @param {HTMLElement} root
 * @returns {{ left: number, top: number }}
 */
export function readFloatingToolbarPos(root) {
  const rect = root.getBoundingClientRect();
  return { left: rect.left, top: rect.top };
}

/**
 * @param {HTMLElement} root
 * @param {{ left: number, top: number }} pos
 * @param {number} [pad]
 */
export function applyFloatingToolbarPos(root, pos, pad = 8) {
  const clamped = clampFloatingToolbarPos(root, pos, pad);
  root.style.left = `${clamped.left}px`;
  root.style.top = `${clamped.top}px`;
  return clamped;
}

/**
 * @param {{ left: number, top: number }} pos
 * @param {{ width?: number, height?: number }} size
 * @param {number} [pad]
 */
export function isFloatingToolbarPosInViewport(pos, size, pad = 8) {
  const w = size.width || 120;
  const h = size.height || 40;
  const bounds = getFloatingToolbarBoundsRect(pad);
  return (
    pos.left + w > bounds.left &&
    pos.top + h > bounds.top &&
    pos.left < bounds.right &&
    pos.top < bounds.bottom
  );
}

/**
 * @param {HTMLElement} root
 * @param {number} [pad]
 */
export function isFloatingToolbarInViewport(root, pad = 8) {
  const rect = root.getBoundingClientRect();
  return isFloatingToolbarPosInViewport(
    { left: rect.left, top: rect.top },
    { width: rect.width, height: rect.height },
    pad,
  );
}

/**
 * @param {HTMLElement} root
 * @param {object} [opts]
 * @param {() => void} [opts.onGuard]
 */
export function bindFloatingToolbarViewportGuard(root, opts = {}) {
  const { onGuard } = opts;
  const guard = () => {
    if (root.hidden) return;
    onGuard?.();
  };
  window.addEventListener("resize", guard);
  window.addEventListener("orientationchange", guard);
  window.visualViewport?.addEventListener("resize", guard);
  window.visualViewport?.addEventListener("scroll", guard);

  const stage = resolveChartStageEl();
  /** @type {ResizeObserver | null} */
  let stageResizeObs = null;
  if (stage instanceof HTMLElement && typeof ResizeObserver !== "undefined") {
    stageResizeObs = new ResizeObserver(guard);
    stageResizeObs.observe(stage);
  }

  return () => {
    window.removeEventListener("resize", guard);
    window.removeEventListener("orientationchange", guard);
    window.visualViewport?.removeEventListener("resize", guard);
    window.visualViewport?.removeEventListener("scroll", guard);
    stageResizeObs?.disconnect();
    stageResizeObs = null;
  };
}
