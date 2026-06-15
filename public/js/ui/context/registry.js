/** @typedef {{ close: () => void, isOpen: () => boolean, contains: (node: Node) => boolean }} ContextMenuEntry */

/** @type {Set<ContextMenuEntry>} */
const menus = new Set();

let outsideListenerAttached = false;

function attachOutsideListener() {
  if (outsideListenerAttached) return;
  outsideListenerAttached = true;

  document.addEventListener(
    "mousedown",
    (ev) => {
      const t = ev.target;
      if (!(t instanceof Node)) return;
      for (const menu of menus) {
        if (!menu.isOpen()) continue;
        if (menu.contains(t)) continue;
        menu.close();
      }
    },
    true,
  );
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
