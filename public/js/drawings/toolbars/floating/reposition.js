import {
  applyFloatingToolbarPos,
  isFloatingToolbarInViewport,
  readFloatingToolbarPos,
  resolveChartStageEl,
} from "./position.js";

/**
 * Default anchor for the favorites floating toolbar (beside the drawing toolbar).
 */
export function defaultFavoriteToolbarPosition() {
  const toolbar = document.getElementById("drawing-toolbar");
  const rect = toolbar?.getBoundingClientRect();
  const stage = resolveChartStageEl();
  const sr = stage?.getBoundingClientRect();
  const pad = 8;
  const minLeft = sr ? sr.left + pad : pad;
  const minTop = sr ? sr.top + pad : pad;
  const left = rect ? rect.right + 8 : minLeft + 58;
  const top = rect
    ? Math.max(minTop, rect.bottom - 160)
    : sr
      ? Math.max(minTop, sr.bottom - 200)
      : Math.max(pad, window.innerHeight - 200);
  return { left, top };
}

/**
 * Clamp visible floating toolbars into the viewport; reset off-screen favorites toolbar.
 */
export function repositionVisibleFloatingToolbars() {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".tv-floating-toolbar").forEach((el) => {
    if (!(el instanceof HTMLElement) || el.hidden) return;
    const isFavorites = !el.classList.contains("tv-drawing-edit-toolbar");
    if (!isFloatingToolbarInViewport(el)) {
      if (isFavorites) {
        applyFloatingToolbarPos(el, defaultFavoriteToolbarPosition());
      } else {
        applyFloatingToolbarPos(el, readFloatingToolbarPos(el));
      }
      return;
    }
    applyFloatingToolbarPos(el, readFloatingToolbarPos(el));
  });
}
