/** Full-screen loading overlay while session bars + trade history load. */
export class SessionLoadingOverlay {
  constructor() {
    /** @type {HTMLElement | null} */
    this._root = null;
    /** @type {HTMLElement | null} */
    this._labelEl = null;
  }

  ensureNodes() {
    if (!this._root) this._root = document.getElementById("session-loading");
    if (!this._labelEl) this._labelEl = document.getElementById("session-loading-label");
  }

  /**
   * @param {string} [message]
   */
  show(message = "Loading session…") {
    this.ensureNodes();
    if (!this._root) return;
    if (this._labelEl) this._labelEl.textContent = message;
    this._root.classList.add("session-loading--active");
    this._root.setAttribute("aria-busy", "true");
    document.body.classList.add("is-session-loading");
  }

  finish() {
    this.ensureNodes();
    if (!this._root?.classList.contains("session-loading--active")) return;
    this._root.classList.remove("session-loading--active");
    this._root.setAttribute("aria-busy", "false");
    document.body.classList.remove("is-session-loading");
  }
}

const defaultOverlay = new SessionLoadingOverlay();

export const showSessionLoading = (...a) => defaultOverlay.show(...a);
export const finishSessionLoading = () => defaultOverlay.finish();
