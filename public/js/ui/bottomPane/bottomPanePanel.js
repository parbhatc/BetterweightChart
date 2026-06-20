const REPORT_HEIGHT_KEY = "bwc-bottom-pane-height";
const REPORT_MIN_HEIGHT = 160;

const ICON_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path stroke="currentColor" stroke-width="1.2" fill="none" d="m1.5 1.5 15 15m0-15-15 15"/></svg>`;
const ICON_CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3.92 7.83 9 12.29l5.08-4.46-1-1.13L9 10.29l-4.09-3.6-.99 1.14Z"/></svg>`;

/** @returns {HTMLElement | null} */
function reportSlotEl(root) {
  const slot = root.parentElement;
  return slot?.classList.contains("tv-strategy-report-slot") ? slot : null;
}

/** @returns {number} */
function reportMaxHeight() {
  const stage = document.querySelector(".tv-stage");
  const cap = stage?.clientHeight ?? window.innerHeight;
  return Math.max(REPORT_MIN_HEIGHT, Math.floor(cap * 0.75));
}

/** @param {HTMLElement} root @param {number} px */
function applyReportHeight(root, px) {
  const slot = reportSlotEl(root);
  const h = Math.min(reportMaxHeight(), Math.max(REPORT_MIN_HEIGHT, Math.round(px)));
  if (slot) slot.style.height = `${h}px`;
  return h;
}

/** @param {HTMLElement} root */
function readReportHeight(root) {
  const stored = Number(localStorage.getItem(REPORT_HEIGHT_KEY));
  if (Number.isFinite(stored)) return applyReportHeight(root, stored);
  return applyReportHeight(root, Math.min(Math.floor(window.innerHeight * 0.38), 360));
}

/** @param {HTMLElement} root */
function wireReportResize(root) {
  const handle = root.querySelector("[data-report-resize]");
  if (!(handle instanceof HTMLElement)) return;

  readReportHeight(root);

  /** @type {number | null} */
  let startY = null;
  /** @type {number | null} */
  let startHeight = null;

  const onMove = (ev) => {
    if (startY == null || startHeight == null) return;
    applyReportHeight(root, startHeight + (startY - ev.clientY));
  };

  const onEnd = () => {
    if (startY == null) return;
    startY = null;
    startHeight = null;
    root.classList.remove("is-resizing");
    document.body.style.cursor = "";
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onEnd);
    document.removeEventListener("pointercancel", onEnd);
    const slot = reportSlotEl(root);
    if (slot) localStorage.setItem(REPORT_HEIGHT_KEY, String(slot.offsetHeight));
  };

  handle.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const slot = reportSlotEl(root);
    if (!slot) return;
    startY = ev.clientY;
    startHeight = slot.offsetHeight;
    root.classList.add("is-resizing");
    document.body.style.cursor = "ns-resize";
    handle.setPointerCapture(ev.pointerId);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);
  });

  window.addEventListener("resize", () => {
    const slot = reportSlotEl(root);
    if (!slot || slot.hidden) return;
    applyReportHeight(root, slot.offsetHeight);
  });
}

/**
 * @param {object} [opts]
 * @param {HTMLElement} [opts.mountEl]
 * @param {(instanceId: string) => void} [opts.onSelect]
 * @param {() => void} [opts.onClose]
 */
export function createBottomPanePanel(opts = {}) {
  const { onSelect, onClose } = opts;
  const root = document.createElement("div");
  root.className = "tv-strategy-report tv-bottom-pane";
  root.hidden = true;
  root.innerHTML = `<div class="tv-strategy-report__resize-handle" data-report-resize role="separator" aria-orientation="horizontal" aria-label="Resize bottom pane"></div>
    <header class="tv-strategy-report__toolbar">
      <div class="tv-strategy-report__toolbar-start">
        <label class="tv-bottom-pane__select-wrap">
          <span class="tv-bottom-pane__select-label">Indicator</span>
          <select class="tv-bottom-pane__select" data-bottom-pane-select aria-label="Bottom pane indicator"></select>
          <span class="tv-bottom-pane__select-chev" aria-hidden="true">${ICON_CHEVRON}</span>
        </label>
      </div>
      <button type="button" class="tv-strategy-report__close" data-report-close aria-label="Close bottom pane">${ICON_CLOSE}</button>
    </header>
    <div class="tv-strategy-report__body tv-bottom-pane__body">
      <div class="tv-strategy-report__loading" data-bottom-pane-loading hidden>
        <div class="tv-strategy-report__loading-inner">
          <div class="tv-strategy-report__spinner" aria-hidden="true"></div>
          <p class="tv-strategy-report__loading-text">Loading…</p>
        </div>
      </div>
      <div class="tv-bottom-pane__content tv-strategy-report__panel" data-bottom-pane-content></div>
    </div>`;

  const mountEl =
    opts.mountEl ??
    document.getElementById("bottom-pane-slot") ??
    document.querySelector(".tv-bottom-pane-slot");
  if (mountEl instanceof HTMLElement) mountEl.appendChild(root);

  wireReportResize(root);

  const selectEl = root.querySelector("[data-bottom-pane-select]");
  const contentEl = root.querySelector("[data-bottom-pane-content]");
  const loadingEl = root.querySelector("[data-bottom-pane-loading]");
  if (!(selectEl instanceof HTMLSelectElement) || !(contentEl instanceof HTMLElement)) {
    throw new Error("Bottom pane panel mount missing");
  }

  /** @type {number} */
  let loadingCount = 0;

  /** @param {boolean} loading */
  function setLoading(loading) {
    loadingCount = Math.max(0, loadingCount + (loading ? 1 : -1));
    const active = loadingCount > 0;
    root.classList.toggle("is-loading", active);
    if (loadingEl instanceof HTMLElement) loadingEl.hidden = !active;
  }

  /** @param {boolean} visible */
  function syncSlotVisibility(visible) {
    const slot = reportSlotEl(root);
    if (slot?.classList.contains("tv-strategy-report-slot")) {
      slot.hidden = !visible;
      if (visible && !slot.style.height) readReportHeight(root);
    }
  }

  /** @type {string | null} */
  let selectedInstanceId = null;
  let userDismissed = false;

  /**
   * @param {{ instanceId: string, label: string }[]} options
   * @param {string | null} activeId
   */
  function setOptions(options, activeId) {
    selectEl.innerHTML = options
      .map(
        (o) =>
          `<option value="${o.instanceId}"${o.instanceId === activeId ? " selected" : ""}>${o.label}</option>`,
      )
      .join("");
    selectEl.disabled = options.length <= 1;
    selectedInstanceId = activeId;
  }

  function show() {
    userDismissed = false;
    root.hidden = false;
    syncSlotVisibility(true);
  }

  function hide(opts = {}) {
    userDismissed = Boolean(opts.userDismissed);
    root.hidden = true;
    syncSlotVisibility(false);
    if (opts.userDismissed) onClose?.();
  }

  selectEl.addEventListener("change", () => {
    const id = selectEl.value;
    if (!id || id === selectedInstanceId) return;
    selectedInstanceId = id;
    onSelect?.(id);
  });

  root.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-report-close]")) {
      hide({ userDismissed: true });
    }
  });

  return {
    el: root,
    contentEl,
    setOptions,
    setLoading,
    show,
    hide,
    reopen: () => {
      userDismissed = false;
    },
    isUserDismissed: () => userDismissed,
    isVisible: () => !root.hidden,
    getSelectedInstanceId: () => selectedInstanceId,
  };
}
