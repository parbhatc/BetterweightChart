import { closeAllContextMenus, registerContextMenu } from "./registry.js";

const CHECK_ICON = `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M22 9.06 11 20 6 14.7l1.09-1.02 3.94 4.16L20.94 8 22 9.06Z"/></svg>`;
const SETTINGS_ICON = `<svg viewBox="0 0 28 28" width="18" height="18" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path fill-rule="evenodd" d="M8.5 5h11l5 9-5 9h-11l-5-9 5-9Zm-3.86 9L9.1 6h9.82l4.45 8-4.45 8H9.1l-4.45-8Z"/></svg>`;

/** @typedef {{ id: string, label: string, key?: string, keys?: string[], divider?: boolean, action?: string, icon?: string }} MenuDef */

/** @type {MenuDef[]} */
const MENU_ITEMS = [
  { id: "title", label: "Title", key: "showTitle" },
  { id: "marketStatus", label: "Open market status", key: "showMarketStatus" },
  { id: "chartValues", label: "Chart values", key: "showOHLC" },
  { id: "barChange", label: "Bar change values", key: "showBarChange" },
  { id: "volume", label: "Volume", key: "showVolume" },
  { divider: true, id: "_d1", label: "" },
  { id: "settings", label: "Settings…", action: "settings", icon: SETTINGS_ICON },
];

/**
 * @param {object} sl
 * @param {MenuDef} item
 */
function isChecked(sl, item) {
  if (item.keys) return item.keys.every((k) => sl[k]);
  if (item.key) return Boolean(sl[item.key]);
  return false;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.statusEl
 * @param {() => object} opts.getStatusLineSettings
 * @param {(key: string, value: boolean) => void} opts.setToggle
 * @param {() => void} opts.openSettings
 */
export function mountStatusLineContextMenu(opts) {
  const { statusEl, getStatusLineSettings, setToggle, openSettings } = opts;

  const root = document.createElement("div");
  root.className = "ctx-menu ctx-menu--status";
  root.hidden = true;
  root.setAttribute("role", "menu");
  document.body.appendChild(root);

  function close() {
    root.hidden = true;
  }

  function rowDivider() {
    return `<tr class="ctx-menu__divider-row"><td><div class="ctx-menu__divider"></div></td><td><div class="ctx-menu__divider"></div></td></tr>`;
  }

  function checkRow(item, checked) {
    const iconHtml = checked
      ? `<span class="ctx-menu__icon ctx-menu__icon--check">${CHECK_ICON}</span>`
      : `<span class="ctx-menu__icon"></span>`;
    const labelCls = checked ? "ctx-menu__label ctx-menu__label--checked" : "ctx-menu__label";
    return `<tr class="ctx-menu__row" data-item-id="${item.id}" role="menuitem" tabindex="-1">
      <td class="ctx-menu__icon-cell">${item.icon ? `<span class="ctx-menu__icon">${item.icon}</span>` : iconHtml}</td>
      <td class="ctx-menu__content-cell"><span class="${labelCls}">${item.label}</span></td>
    </tr>`;
  }

  function actionRow(item) {
    return `<tr class="ctx-menu__row" data-item-id="${item.id}" data-action="${item.action}" role="menuitem" tabindex="-1">
      <td class="ctx-menu__icon-cell"><span class="ctx-menu__icon">${item.icon ?? ""}</span></td>
      <td class="ctx-menu__content-cell"><span class="ctx-menu__label">${item.label}</span></td>
    </tr>`;
  }

  function render() {
    const sl = getStatusLineSettings();
    const rows = MENU_ITEMS.map((item) => {
      if (item.divider) return rowDivider();
      if (item.action) return actionRow(item);
      return checkRow(item, isChecked(sl, item));
    }).join("");

    root.innerHTML = `<div class="ctx-menu__scroll"><table class="ctx-menu__table"><tbody>${rows}</tbody></table></div>`;
  }

  function positionMenu(x, y) {
    closeAllContextMenus(close);
    render();
    root.hidden = false;
    const pad = 8;
    const rect = root.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
    if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
    root.style.left = `${Math.max(pad, left)}px`;
    root.style.top = `${Math.max(pad, top)}px`;
  }

  statusEl.addEventListener("contextmenu", (ev) => {
    if (ev.target.closest(".mkt-icon, [data-mkt-popup]")) {
      ev.preventDefault();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    positionMenu(ev.clientX, ev.clientY);
  });

  root.addEventListener("click", (ev) => {
    const row = ev.target.closest("[data-item-id]");
    if (!row) return;

    if (row.dataset.action === "settings") {
      openSettings();
      close();
      return;
    }

    const item = MENU_ITEMS.find((m) => m.id === row.dataset.itemId);
    if (!item || item.divider || item.action) return;

    const sl = getStatusLineSettings();
    const next = !isChecked(sl, item);
    if (item.key) setToggle(item.key, next);
    render();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") close();
  });
  window.addEventListener("resize", close);
  window.addEventListener("scroll", () => {
    if (root.hidden) return;
    close();
  }, true);

  registerContextMenu({
    close,
    isOpen: () => !root.hidden,
    contains: (node) => root.contains(node),
  });

  return { close };
}
