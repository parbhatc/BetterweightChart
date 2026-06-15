import { loadSkipLockedConfirm, saveSkipLockedConfirm } from "../toolbars/utilitySettingsStore.js";

/**
 * @param {{ onYes: () => void, onNo: () => void }} handlers
 * @returns {() => void} close
 */
export function showRemoveLockedConfirmDialog(handlers) {
  const overlay = document.createElement("div");
  overlay.className = "tv-confirm-overlay";
  overlay.innerHTML = `
    <div class="tv-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="tv-confirm-title">
      <div class="tv-confirm-dialog__main">
        <div class="tv-confirm-dialog__title" id="tv-confirm-title">Confirm to remove locked drawings</div>
        <div class="tv-confirm-dialog__content">
          <p class="tv-confirm-dialog__description">You have locked drawings on this symbol. Do you want to remove the locked drawings too?</p>
          <label class="tv-confirm-dialog__checkbox">
            <input type="checkbox" data-dont-show />
            <span>Don't show again</span>
          </label>
        </div>
        <div class="tv-confirm-dialog__footer">
          <button type="button" class="tv-confirm-dialog__btn tv-confirm-dialog__btn--yes" data-yes>Yes, remove them</button>
          <button type="button" class="tv-confirm-dialog__btn tv-confirm-dialog__btn--no" data-no>No, keep them</button>
        </div>
      </div>
      <button type="button" class="tv-confirm-dialog__close" data-close aria-label="close">
        <svg viewBox="0 0 17 17" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="m.58 1.42.82-.82 15 15-.82.82z"/><path d="m.58 15.58 15-15 .82.82-15 15z"/></svg>
      </button>
    </div>`;

  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }

  function onKey(ev) {
    if (ev.key === "Escape") {
      handlers.onNo();
      close();
    }
  }

  document.addEventListener("keydown", onKey);

  overlay.querySelector("[data-yes]")?.addEventListener("click", () => {
    const dontShow = overlay.querySelector("[data-dont-show]");
    if (dontShow instanceof HTMLInputElement && dontShow.checked) saveSkipLockedConfirm(true);
    handlers.onYes();
    close();
  });

  overlay.querySelector("[data-no]")?.addEventListener("click", () => {
    handlers.onNo();
    close();
  });

  overlay.querySelector("[data-close]")?.addEventListener("click", () => {
    handlers.onNo();
    close();
  });

  overlay.addEventListener("mousedown", (ev) => {
    if (ev.target === overlay) {
      handlers.onNo();
      close();
    }
  });

  return close;
}

export function shouldShowLockedRemoveConfirm() {
  return !loadSkipLockedConfirm();
}
