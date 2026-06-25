/** @type {ReturnType<typeof mountDebugHud> | null} */
let activeHud = null;

function defaultPingWsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/ping`;
}

/**
 * Fixed top overlay: live FPS + WebSocket ping (debug mode only).
 * @param {{ pingWsUrl?: string }} [opts]
 */
export function mountDebugHud(opts = {}) {
  const pingWsUrl = opts.pingWsUrl ?? defaultPingWsUrl();

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
  let zooming = false;
  /** @type {string[]} */
  let viewportModes = [];
  let rafId = 0;
  /** @type {ReturnType<typeof setInterval> | null} */
  let pingTimer = null;
  /** @type {WebSocket | null} */
  let ws = null;
  /** @type {number | null} */
  let pingSentAt = null;

  function render() {
    const ping = pingMs == null ? "…" : `${pingMs}ms`;
    if (panning || zooming) {
      const label = viewportModes.length ? viewportModes.join("+") : panning ? "pan" : "zoom";
      const interactionFps = panFps == null ? "—" : String(panFps);
      root.textContent = `${label} ${interactionFps} fps · Render ${liveFps} · Ping ${ping}`;
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

  function sendPing() {
    if (ws?.readyState !== WebSocket.OPEN) return;
    pingSentAt = performance.now();
    ws.send("ping");
  }

  function connectWs() {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

    try {
      ws = new WebSocket(pingWsUrl);
    } catch {
      pingMs = null;
      render();
      return;
    }

    ws.addEventListener("open", () => {
      sendPing();
    });

    ws.addEventListener("message", (ev) => {
      if (ev.data !== "pong" || pingSentAt == null) return;
      pingMs = Math.round(performance.now() - pingSentAt);
      pingSentAt = null;
      render();
    });

    ws.addEventListener("close", () => {
      ws = null;
      pingSentAt = null;
    });

    ws.addEventListener("error", () => {
      pingMs = null;
      pingSentAt = null;
      render();
    });
  }

  function measurePing() {
    connectWs();
    sendPing();
  }

  render();
  measurePing();
  rafId = requestAnimationFrame(tick);
  pingTimer = setInterval(measurePing, 4000);

  const api = {
    /** @param {{ fps?: number, panning?: boolean, zooming?: boolean, modes?: string[] }} stats */
    setPanStats(stats) {
      if (stats.modes) viewportModes = [...stats.modes];
      if (stats.panning != null) panning = Boolean(stats.panning);
      if (stats.zooming != null) zooming = Boolean(stats.zooming);
      if (stats.fps != null) panFps = stats.fps;
      render();
    },
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      if (pingTimer) clearInterval(pingTimer);
      pingSentAt = null;
      ws?.close();
      ws = null;
      root.remove();
      if (activeHud === api) activeHud = null;
    },
  };

  activeHud = api;
  return api;
}

/** @param {{ pingWsUrl?: string }} [opts] */
export function ensureDebugHud(opts = {}) {
  if (!activeHud) activeHud = mountDebugHud(opts);
  return activeHud;
}

export function destroyDebugHud() {
  activeHud?.destroy();
  activeHud = null;
}
