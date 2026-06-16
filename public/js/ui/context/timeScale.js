import { closeAllContextMenus, registerContextMenu } from "./registry.js";
import { runContextMenuAction, debugContextMenu } from "../../debug/chart/contextMenu.js";
import { hitTimeScale } from "../../chart/scale/settings.js";
import { TIMEZONE_OPTIONS } from "../../chart/timezone/list.js";

const ICONS = {
  reset: `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><g fill="none" fill-rule="evenodd" stroke="currentColor"><path d="M6.5 15A8.5 8.5 0 1 0 15 6.5H8.5"></path><path d="M12 10 8.5 6.5 12 3"></path></g></svg>`,
  settings: `<svg viewBox="0 0 28 28" width="18" height="18" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path><path fill-rule="evenodd" d="M8.5 5h11l5 9-5 9h-11l-5-9 5-9Zm-3.86 9L9.1 6h9.82l4.45 8-4.45 8H9.1l-4.45-8Z"></path></svg>`,
  chevron: `<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><path fill="currentColor" d="M.6 1.4l1.4-1.4 8 8-8 8-1.4-1.4 6.389-6.532-6.389-6.668z"></path></svg>`,
  check: `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M22 9.06 11 20 6 14.7l1.09-1.02 3.94 4.16L20.94 8 22 9.06Z"/></svg>`,
};

const SESSION_OPTIONS = [
  { value: "electronic", label: "Electronic trading hours" },
  { value: "regular", label: "Regular trading hours" },
];

/**
 * @typedef {{
 *   timezone: string,
 *   session: string,
 *   sessionBreaks: boolean,
 * }} TimeScaleMenuState
 */

/**
 * @typedef {{
 *   resetTimeScale: () => void,
 *   setTimezone: (tz: string) => void,
 *   toggleSessionBreaks: () => void,
 *   setSession: (session: string) => void,
 *   openSettings: () => void,
 * }} TimeScaleMenuActions
 */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container
 * @param {HTMLElement} opts.chartEl
 * @param {import("lightweight-charts").IChartApi} opts.chart
 * @param {() => TimeScaleMenuState} opts.getState
 * @param {TimeScaleMenuActions} opts.actions
 */
export function mountTimeScaleContextMenu(opts) {
  const { container, chartEl, chart, getState, actions } = opts;

  const root = document.createElement("div");
  root.className = "ctx-menu ctx-menu--chart ctx-menu--time-scale";
  root.hidden = true;
  root.setAttribute("role", "menu");
  document.body.appendChild(root);

  /** @type {HTMLElement | null} */
  let submenuEl = null;

  function closeSubmenu() {
    submenuEl?.remove();
    submenuEl = null;
  }

  function close() {
    root.hidden = true;
    closeSubmenu();
  }

  function rowDivider() {
    return `<tr class="ctx-menu__divider-row"><td><div class="ctx-menu__divider"></div></td><td><div class="ctx-menu__divider"></div></td></tr>`;
  }

  function rowItem({ id, label, shortcut = "", icon = "", hasSubmenu = false, checked = false }) {
    const shortcutHtml = shortcut ? `<span class="ctx-menu__shortcut">${shortcut}</span>` : "";
    const arrowHtml = hasSubmenu ? `<span class="ctx-menu__arrow">${ICONS.chevron}</span>` : "";
    const iconCell = icon
      ? `<span class="ctx-menu__icon">${icon}</span>`
      : checked
        ? `<span class="ctx-menu__icon ctx-menu__icon--check">${ICONS.check}</span>`
        : `<span class="ctx-menu__icon"></span>`;
    const labelCls = checked ? "ctx-menu__label ctx-menu__label--checked" : "ctx-menu__label";
    return `<tr class="ctx-menu__row" data-action="${id}" role="menuitem" tabindex="-1">
      <td class="ctx-menu__icon-cell">${iconCell}</td>
      <td class="ctx-menu__content-cell">
        <div class="ctx-menu__content-inner">
          <span class="${labelCls}">${label}</span>
          ${shortcutHtml}${arrowHtml}
        </div>
      </td>
    </tr>`;
  }

  function render() {
    const s = getState();
    root.innerHTML = `<div class="ctx-menu__scroll"><table class="ctx-menu__table"><tbody>
      ${rowItem({ id: "reset-time", label: "Reset time scale", shortcut: "Ctrl + Alt + Q", icon: ICONS.reset })}
      ${rowDivider()}
      ${rowItem({ id: "timezone", label: "Time zone", hasSubmenu: true })}
      ${rowItem({ id: "session-breaks", label: "Session breaks", checked: s.sessionBreaks })}
      ${rowItem({ id: "session", label: "Session", hasSubmenu: true })}
      ${rowDivider()}
      ${rowItem({ id: "settings", label: "More settings…", icon: ICONS.settings })}
    </tbody></table></div>`;
  }

  function openTimezoneSubmenu(anchorRow) {
    closeSubmenu();
    const s = getState();
    const rows = TIMEZONE_OPTIONS.map(
      (tz) =>
        rowItem({
          id: `tz:${tz.value}`,
          label: tz.label,
          checked: s.timezone === tz.value,
        }),
    ).join("");

    submenuEl = document.createElement("div");
    submenuEl.className = "ctx-menu ctx-menu--sub ctx-menu--tz-sub";
    submenuEl.innerHTML = `<div class="ctx-menu__scroll"><table class="ctx-menu__table"><tbody>${rows}</tbody></table></div>`;
    document.body.appendChild(submenuEl);

    const rect = anchorRow.getBoundingClientRect();
    const menuRect = root.getBoundingClientRect();
    const pad = 8;
    let left = menuRect.right - 2;
    let top = rect.top;
    submenuEl.style.left = `${left}px`;
    submenuEl.style.top = `${top}px`;
    const subRect = submenuEl.getBoundingClientRect();
    if (subRect.right > window.innerWidth - pad) {
      left = menuRect.left - subRect.width + 2;
      submenuEl.style.left = `${Math.max(pad, left)}px`;
    }
    if (subRect.bottom > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - subRect.height - pad);
      submenuEl.style.top = `${top}px`;
    }

    submenuEl.addEventListener("click", (ev) => {
      const row = ev.target.closest("[data-action]");
      if (!row) return;
      const id = row.dataset.action;
      if (!id?.startsWith("tz:")) return;
      actions.setTimezone(id.slice(3));
      close();
    });
  }

  function openSessionSubmenu(anchorRow) {
    closeSubmenu();
    const s = getState();
    const rows = SESSION_OPTIONS.map((opt) =>
      rowItem({
        id: `session:${opt.value}`,
        label: opt.label,
        checked: s.session === opt.value,
      }),
    ).join("");

    submenuEl = document.createElement("div");
    submenuEl.className = "ctx-menu ctx-menu--sub";
    submenuEl.innerHTML = `<div class="ctx-menu__scroll"><table class="ctx-menu__table"><tbody>${rows}</tbody></table></div>`;
    document.body.appendChild(submenuEl);

    const rect = anchorRow.getBoundingClientRect();
    const menuRect = root.getBoundingClientRect();
    submenuEl.style.left = `${menuRect.right - 2}px`;
    submenuEl.style.top = `${rect.top}px`;

    submenuEl.addEventListener("click", (ev) => {
      const row = ev.target.closest("[data-action]");
      if (!row) return;
      const id = row.dataset.action;
      if (!id?.startsWith("session:")) return;
      actions.setSession(id.slice(8));
      close();
    });
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

  function runAction(id, row) {
    if (id === "timezone") {
      debugContextMenu("time-scale", id);
      openTimezoneSubmenu(row);
      return;
    }
    if (id === "session") {
      debugContextMenu("time-scale", id);
      openSessionSubmenu(row);
      return;
    }
    runContextMenuAction("time-scale", id, close, () => {
      switch (id) {
        case "reset-time":
          actions.resetTimeScale();
          break;
        case "session-breaks":
          actions.toggleSessionBreaks();
          break;
        case "settings":
          actions.openSettings();
          break;
        default:
          break;
      }
    });
  }

  root.addEventListener("click", (ev) => {
    const row = ev.target.closest("[data-action]");
    if (!row) return;
    runAction(row.dataset.action, row);
  });

  container.addEventListener(
    "contextmenu",
    (ev) => {
      if (ev.target.closest(".ctx-menu, .drawing-toolbar, .draw-tools")) return;
      if (!hitTimeScale(chart, chartEl, ev.clientX, ev.clientY)) return;
      ev.preventDefault();
      ev.stopPropagation();
      positionMenu(ev.clientX, ev.clientY);
    },
    true,
  );

  document.addEventListener("keydown", (ev) => {
    if (root.hidden) return;
    if (ev.key === "Escape") close();
    if (ev.ctrlKey && ev.altKey && ev.key.toLowerCase() === "q") {
      ev.preventDefault();
      actions.resetTimeScale();
      close();
    }
  });

  window.addEventListener("resize", close);
  window.addEventListener("scroll", () => {
    if (root.hidden && !submenuEl) return;
    close();
  }, true);

  registerContextMenu({
    close,
    isOpen: () => !root.hidden || Boolean(submenuEl),
    contains: (node) => root.contains(node) || Boolean(submenuEl?.contains(node)),
  });

  return { close, openAt: positionMenu };
}
