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
