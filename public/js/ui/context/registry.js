/** @typedef {{ close: () => void, isOpen: () => boolean, contains: (node: Node) => boolean }} ContextMenuEntry */

/** @type {Set<ContextMenuEntry>} */
const menus = new Set();

let outsideListenerAttached = false;

/** Ignore outside-dismiss briefly after open (same gesture / live tick races). */
const OUTSIDE_CLOSE_GRACE_MS = 400;
let lastContextMenuOpenedAt = 0;

/** Call when a context menu is shown (positioned). */
export function markContextMenuOpened() {
  lastContextMenuOpenedAt = performance.now();
}

/** @param {MouseEvent | PointerEvent} ev */
export function shouldDismissContextMenuOnOutsidePointer(ev) {
  if (performance.now() - lastContextMenuOpenedAt < OUTSIDE_CLOSE_GRACE_MS) return false;
  // Only left-click outside should dismiss — not right/middle click used to open another menu.
  if ("button" in ev && ev.button !== 0) return false;
  return true;
}

/** @param {Event} ev */
export function shouldDismissContextMenuOnScroll(ev) {
  if (performance.now() - lastContextMenuOpenedAt < OUTSIDE_CLOSE_GRACE_MS) return false;
  const target = ev.target;
  return target === document || target === document.documentElement;
}

function attachOutsideListener() {
  if (outsideListenerAttached) return;
  outsideListenerAttached = true;

  const onOutsidePointer = (ev) => {
    if (!shouldDismissContextMenuOnOutsidePointer(ev)) return;
    const t = ev.target;
    if (!(t instanceof Node)) return;
    for (const menu of menus) {
      if (!menu.isOpen()) continue;
      if (menu.contains(t)) continue;
      menu.close();
    }
  };

  document.addEventListener("mousedown", onOutsidePointer, true);
  document.addEventListener("pointerdown", onOutsidePointer, true);
}

/** @param {ContextMenuEntry} entry */
export function registerContextMenu(entry) {
  menus.add(entry);
  attachOutsideListener();
  return () => menus.delete(entry);
}

/** @param {() => void} [exceptClose] */
export function closeAllContextMenus(exceptClose) {
  for (const menu of menus) {
    if (menu.close === exceptClose) continue;
    if (menu.isOpen()) menu.close();
  }
}
