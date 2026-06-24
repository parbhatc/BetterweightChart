const COARSE_POINTER_MQ = window.matchMedia("(pointer: coarse)");

/** @param {EventTarget | null} target */
function findScrollableAncestor(target) {
  if (!(target instanceof Element)) return null;
  let node = target;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const scrollableY =
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight + 1;
    const scrollableX =
      (overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay") &&
      node.scrollWidth > node.clientWidth + 1;
    if (scrollableY || scrollableX) return node;
    node = node.parentElement;
  }
  return null;
}

/** @type {(() => void) | null} */
let activeTouchScrollRelease = null;

/** Stop Safari/page rubber-band while still allowing in-app scroll areas. */
export function mountAppTouchScrollLock() {
  if (!COARSE_POINTER_MQ.matches) return () => {};

  releaseAppTouchScrollLock();

  document.documentElement.classList.add("tv-app--touch");

  /** @param {TouchEvent} ev */
  function onTouchMove(ev) {
    if (findScrollableAncestor(ev.target)) return;
    ev.preventDefault();
  }

  document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });

  const release = () => {
    document.documentElement.classList.remove("tv-app--touch");
    document.removeEventListener("touchmove", onTouchMove, { capture: true });
    if (activeTouchScrollRelease === release) activeTouchScrollRelease = null;
  };

  activeTouchScrollRelease = release;
  return release;
}

/** Release the active touch scroll lock (safe when host unmounts the chart). */
export function releaseAppTouchScrollLock() {
  activeTouchScrollRelease?.();
}
