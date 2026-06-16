/** @type {ReturnType<typeof mountDebugHud> | null} */
let activeHud = null;

/**
 * Fixed top overlay: live FPS + API ping (debug mode only).
 * @param {{ pingUrl?: string }} [opts]
 */
export function mountDebugHud(opts = {}) {
  const pingUrl = opts.pingUrl ?? "/api/health";

  const root = document.createElement("div");
  root.className = "bwc-debug-hud";
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-label", "Debug performance");
  document.body.appendChild(root);

  let frameCount = 0;
  let windowStart = performance.now();
  let liveFps = 0;
  /** @type {number | null} */
  let pingMs = null;
  let panFps = null;
  let panning = false;
  let rafId = 0;
  /** @type {ReturnType<typeof setInterval> | null} */
  let pingTimer = null;

  function render() {
    const ping = pingMs == null ? "…" : `${pingMs}ms`;
    if (panning) {
      const pan = panFps == null ? "—" : String(panFps);
      root.textContent = `Pan ${pan} fps · Render ${liveFps} · Ping ${ping}`;
      return;
    }
    root.textContent = `FPS ${liveFps} · Ping ${ping}`;
  }

  function tick() {
    frameCount += 1;
    const now = performance.now();
    if (now - windowStart >= 1000) {
      liveFps = frameCount;
      frameCount = 0;
      windowStart = now;
      render();
    }
    rafId = requestAnimationFrame(tick);
  }

  async function measurePing() {
    const t0 = performance.now();
    try {
      const res = await fetch(pingUrl, { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      pingMs = Math.round(performance.now() - t0);
    } catch {
      pingMs = null;
    }
    render();
  }

  render();
  void measurePing();
  rafId = requestAnimationFrame(tick);
  pingTimer = setInterval(() => {
    void measurePing();
  }, 4000);

  const api = {
    /** @param {{ fps?: number, panning?: boolean }} stats */
    setPanStats(stats) {
      if (stats.panning != null) panning = Boolean(stats.panning);
      if (stats.fps != null) panFps = stats.fps;
      render();
    },
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      if (pingTimer) clearInterval(pingTimer);
      root.remove();
      if (activeHud === api) activeHud = null;
    },
  };

  activeHud = api;
  return api;
}

/** @param {{ pingUrl?: string }} [opts] */
export function ensureDebugHud(opts = {}) {
  if (!activeHud) activeHud = mountDebugHud(opts);
  return activeHud;
}

export function destroyDebugHud() {
  activeHud?.destroy();
  activeHud = null;
}
