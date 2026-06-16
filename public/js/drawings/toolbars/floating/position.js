/**
 * Keep fixed floating toolbars inside the visible viewport (mobile-safe).
 * @param {HTMLElement} root
 * @param {{ left: number, top: number }} pos
 * @param {number} [pad]
 */
export function clampFloatingToolbarPos(root, pos, pad = 8) {
  const rect = root.getBoundingClientRect();
  const w = root.offsetWidth || rect.width || 200;
  const h = root.offsetHeight || rect.height || 40;
  const vv = window.visualViewport;
  const minLeft = (vv?.offsetLeft ?? 0) + pad;
  const minTop = (vv?.offsetTop ?? 0) + pad;
  const maxLeft = minLeft + (vv?.width ?? window.innerWidth) - w - pad * 2;
  const maxTop = minTop + (vv?.height ?? window.innerHeight) - h - pad * 2;
  return {
    left: Math.min(Math.max(minLeft, pos.left), Math.max(minLeft, maxLeft)),
    top: Math.min(Math.max(minTop, pos.top), Math.max(minTop, maxTop)),
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
  const vv = window.visualViewport;
  const ox = vv?.offsetLeft ?? 0;
  const oy = vv?.offsetTop ?? 0;
  const vw = vv?.width ?? window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;
  return (
    pos.left + w > ox + pad &&
    pos.top + h > oy + pad &&
    pos.left < ox + vw - pad &&
    pos.top < oy + vh - pad
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
  return () => {
    window.removeEventListener("resize", guard);
    window.removeEventListener("orientationchange", guard);
    window.visualViewport?.removeEventListener("resize", guard);
    window.visualViewport?.removeEventListener("scroll", guard);
  };
}
