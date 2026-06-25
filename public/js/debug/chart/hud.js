/** @type {ReturnType<typeof mountDebugHud> | null} */
let activeHud = null;

function defaultPingWsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/ping`;
}

function debugApi() {
  return typeof window !== "undefined" ? window.__BWC_DEBUG__ : null;
}

/**
 * Fixed top overlay: live FPS + WebSocket ping + debug toggles (debug mode only).
 * @param {{ pingWsUrl?: string }} [opts]
 */
export function mountDebugHud(opts = {}) {
  const pingWsUrl = opts.pingWsUrl ?? defaultPingWsUrl();

  const root = document.createElement("div");
  root.className = "bwc-debug-hud";
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-label", "Debug performance");

  const statsEl = document.createElement("span");
  statsEl.className = "bwc-debug-hud__stats";

  const sep = document.createElement("span");
  sep.className = "bwc-debug-hud__sep";
  sep.textContent = "·";

  const formingBtn = document.createElement("button");
  formingBtn.type = "button";
  formingBtn.className = "bwc-debug-hud__toggle";

  const debugBtn = document.createElement("button");
  debugBtn.type = "button";
  debugBtn.className = "bwc-debug-hud__toggle";

  root.append(statsEl, sep, formingBtn, debugBtn);
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

  function syncToggleLabels() {
    const api = debugApi();
    const forming = api?.stats?.().formingLogs ?? false;
    formingBtn.textContent = `forming ${forming ? "on" : "off"}`;
    formingBtn.setAttribute("aria-pressed", forming ? "true" : "false");
    formingBtn.title = "Toggle [BWC:data] update forming logs (saved in localStorage)";
    debugBtn.textContent = "debug off";
    debugBtn.title = "Disable all BWC debug logs until re-enabled (saved in localStorage)";
  }

  function renderStats() {
    const ping = pingMs == null ? "…" : `${pingMs}ms`;
    if (panning || zooming) {
      const label = viewportModes.length ? viewportModes.join("+") : panning ? "pan" : "zoom";
      const interactionFps = panFps == null ? "—" : String(panFps);
      statsEl.textContent = `${label} ${interactionFps} fps · Render ${liveFps} · Ping ${ping}`;
      return;
    }
    statsEl.textContent = `FPS ${liveFps} · Ping ${ping}`;
  }

  function render() {
    renderStats();
    syncToggleLabels();
  }

  formingBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const api = debugApi();
    if (!api) return;
    const next = !api.stats().formingLogs;
    api.setFormingLogs(next);
    render();
  });

  debugBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    debugApi()?.disable();
  });

  function tick() {
    frameCount += 1;
    const now = performance.now();
    if (now - windowStart >= 1000) {
      liveFps = frameCount;
      frameCount = 0;
      windowStart = now;
      renderStats();
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
      renderStats();
      return;
    }

    ws.addEventListener("open", () => {
      sendPing();
    });

    ws.addEventListener("message", (ev) => {
      if (ev.data !== "pong" || pingSentAt == null) return;
      pingMs = Math.round(performance.now() - pingSentAt);
      pingSentAt = null;
      renderStats();
    });

    ws.addEventListener("close", () => {
      ws = null;
      pingSentAt = null;
    });

    ws.addEventListener("error", () => {
      pingMs = null;
      pingSentAt = null;
      renderStats();
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
      renderStats();
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
