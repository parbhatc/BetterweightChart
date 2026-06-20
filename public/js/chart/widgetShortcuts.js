/**
 * @param {KeyboardEvent} ev
 * @param {(string | number)[]} keys
 */
function shortcutMatches(ev, keys) {
  const wantCtrl = keys.includes("ctrl");
  const wantShift = keys.includes("shift");
  const wantAlt = keys.includes("alt");
  const keyPart = keys.find((k) => typeof k === "number" || (typeof k === "string" && !["ctrl", "shift", "alt", "meta"].includes(k)));
  const hasCtrl = ev.ctrlKey || ev.metaKey;
  if (wantCtrl !== hasCtrl) return false;
  if (wantShift !== ev.shiftKey) return false;
  if (wantAlt !== ev.altKey) return false;
  if (keyPart == null) return false;
  if (typeof keyPart === "number") return ev.keyCode === keyPart || ev.which === keyPart;
  return ev.key.toLowerCase() === String(keyPart).toLowerCase();
}

/**
 * @param {HTMLElement | Document | null | undefined} mountEl
 * @param {Array<{ keys: (string | number)[]; cb: () => void }>} shortcuts
 */
export function bindWidgetShortcuts(mountEl, shortcuts) {
  const target = mountEl instanceof HTMLElement || mountEl instanceof Document ? mountEl : document;
  if (!shortcuts.length) return () => {};

  const onKeyDown = (ev) => {
    const target = ev.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    ) {
      return;
    }
    for (const { keys, cb } of shortcuts) {
      if (!shortcutMatches(ev, keys)) continue;
      ev.preventDefault();
      ev.stopPropagation();
      cb();
    }
  };

  target.addEventListener("keydown", onKeyDown, true);
  return () => target.removeEventListener("keydown", onKeyDown, true);
}

/**
 * @param {() => object | null | undefined} getActivePane
 */
export function createWidgetShortcutRegistry(getActivePane) {
  /** @type {Array<{ keys: (string | number)[]; cb: () => void }>} */
  const shortcuts = [];
  /** @type {(() => void) | null} */
  let unbind = null;

  function ensureBound() {
    unbind?.();
    unbind = bindWidgetShortcuts(document, shortcuts);
  }

  return {
    /** @param {(string | number)[]} keys @param {() => void} cb */
    onShortcut(keys, cb) {
      if (!Array.isArray(keys) || typeof cb !== "function") return;
      shortcuts.push({ keys, cb });
      ensureBound();
    },
    dispose() {
      unbind?.();
      unbind = null;
      shortcuts.length = 0;
    },
  };
}
