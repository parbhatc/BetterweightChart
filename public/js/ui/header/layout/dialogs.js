/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.description]
 * @param {string} [opts.label]
 * @param {string} [opts.value]
 * @param {string} [opts.placeholder]
 * @param {string} [opts.confirmLabel]
 * @param {string} [opts.cancelLabel]
 * @returns {Promise<string | null>}
 */
export function showLayoutNameDialog(opts) {
  const {
    title,
    description = "",
    label = "Name",
    value = "",
    placeholder = "",
    confirmLabel = "Save",
    cancelLabel = "Cancel",
  } = opts;

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "tv-confirm-overlay tv-confirm-overlay--elevated";
    overlay.innerHTML = `
      <div class="tv-confirm-dialog tv-layout-dialog" role="dialog" aria-modal="true" aria-labelledby="tv-layout-dialog-title">
        <div class="tv-confirm-dialog__main">
          <div class="tv-confirm-dialog__title" id="tv-layout-dialog-title">${escapeHtml(title)}</div>
          ${description ? `<p class="tv-confirm-dialog__description">${escapeHtml(description)}</p>` : ""}
          <label class="tv-layout-dialog__field">
            <span class="tv-layout-dialog__label">${escapeHtml(label)}</span>
            <input type="text" class="tv-layout-dialog__input" data-layout-name-input value="${escapeAttr(value)}" placeholder="${escapeAttr(placeholder)}" autocomplete="off" />
          </label>
        </div>
        <div class="tv-confirm-dialog__footer">
          <button type="button" class="tv-confirm-dialog__btn tv-confirm-dialog__btn--no" data-cancel>${escapeHtml(cancelLabel)}</button>
          <button type="button" class="tv-confirm-dialog__btn tv-confirm-dialog__btn--primary" data-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    const input = overlay.querySelector("[data-layout-name-input]");
    if (!(input instanceof HTMLInputElement)) {
      overlay.remove();
      resolve(null);
      return;
    }
    input.focus();
    input.select();

    function close(result) {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve(result);
    }

    function onKey(ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        close(null);
      }
      if (ev.key === "Enter") {
        ev.preventDefault();
        submit();
      }
    }

    function submit() {
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      close(name);
    }

    document.addEventListener("keydown", onKey);
    overlay.querySelector("[data-cancel]")?.addEventListener("click", () => close(null));
    overlay.querySelector("[data-confirm]")?.addEventListener("click", submit);
    overlay.addEventListener("mousedown", (ev) => {
      if (ev.target === overlay) close(null);
    });
  });
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} [opts.confirmLabel]
 * @param {string} [opts.cancelLabel]
 * @param {boolean} [opts.destructive]
 * @returns {Promise<boolean>}
 */
export function showLayoutConfirmDialog(opts) {
  const {
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    destructive = false,
  } = opts;

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "tv-confirm-overlay tv-confirm-overlay--elevated";
    overlay.innerHTML = `
      <div class="tv-confirm-dialog tv-layout-dialog" role="dialog" aria-modal="true" aria-labelledby="tv-layout-confirm-title">
        <div class="tv-confirm-dialog__main">
          <div class="tv-confirm-dialog__title" id="tv-layout-confirm-title">${escapeHtml(title)}</div>
          <p class="tv-confirm-dialog__description">${escapeHtml(message)}</p>
        </div>
        <div class="tv-confirm-dialog__footer">
          ${cancelLabel ? `<button type="button" class="tv-confirm-dialog__btn tv-confirm-dialog__btn--no" data-cancel>${escapeHtml(cancelLabel)}</button>` : ""}
          <button type="button" class="tv-confirm-dialog__btn ${destructive ? "tv-confirm-dialog__btn--yes" : "tv-confirm-dialog__btn--primary"}" data-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    function close(confirmed) {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve(confirmed);
    }

    function onKey(ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        close(false);
      }
    }

    document.addEventListener("keydown", onKey);
    overlay.querySelector("[data-cancel]")?.addEventListener("click", () => close(false));
    overlay.querySelector("[data-confirm]")?.addEventListener("click", () => close(true));
    overlay.addEventListener("mousedown", (ev) => {
      if (ev.target === overlay) close(false);
    });
  });
}

/** @param {string} value */
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** @param {string} value */
function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
