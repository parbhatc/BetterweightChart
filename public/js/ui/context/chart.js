import { closeAllContextMenus, registerContextMenu } from "./registry.js";
import { hitPriceScale, hitTimeScale } from "../../chart/scale/settings.js";
import { DRAWING_UI_SELECTOR } from "../../drawings/constants.js";

const ICONS = {
  reset: `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><g fill="none" fill-rule="evenodd" stroke="currentColor"><path d="M6.5 15A8.5 8.5 0 1 0 15 6.5H8.5"></path><path d="M12 10 8.5 6.5 12 3"></path></g></svg>`,
  settings: `<svg viewBox="0 0 28 28" width="18" height="18" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path><path fill-rule="evenodd" d="M8.5 5h11l5 9-5 9h-11l-5-9 5-9Zm-3.86 9L9.1 6h9.82l4.45 8-4.45 8H9.1l-4.45-8Z"></path></svg>`,
  chevron: `<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><path fill="currentColor" d="M.6 1.4l1.4-1.4 8 8-8 8-1.4-1.4 6.389-6.532-6.389-6.668z"></path></svg>`,
  check: `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M22 9.06 11 20 6 14.7l1.09-1.02 3.94 4.16L20.94 8 22 9.06Z"/></svg>`,
};

/**
 * @typedef {{
 *   symbol: string,
 *   price: number | null,
 *   priceText: string,
 *   drawingCount: number,
 *   lockCursorByTime: boolean,
 *   canPaste: boolean,
 *   hasSelectedDrawing: boolean,
 * }} MenuState
 */

/**
 * @typedef {{
 *   resetChart: () => void,
 *   copyPrice: () => void,
 *   copyDrawing: () => void,
 *   paste: () => void,
 *   toggleLockCursor: () => void,
 *   removeDrawings: () => void,
 *   openSettings: () => void,
 * }} MenuActions
 */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container
 * @param {import("lightweight-charts").IChartApi} [opts.chart]
 * @param {HTMLElement} [opts.chartEl]
 * @param {() => MenuState} opts.getState
 * @param {MenuActions} opts.actions
 * @param {() => void | Promise<void>} [opts.onBeforeOpen]
 */
export function mountChartContextMenu(opts) {
  const { container, getState, actions, onBeforeOpen, chart, chartEl } = opts;

  const root = document.createElement("div");
  root.className = "ctx-menu ctx-menu--chart";
  root.hidden = true;
  root.setAttribute("role", "menu");
  document.body.appendChild(root);

  let openX = 0;
  let openY = 0;

  function close() {
    root.hidden = true;
  }

  function rowDivider() {
    return `<tr class="ctx-menu__divider-row"><td><div class="ctx-menu__divider"></div></td><td><div class="ctx-menu__divider"></div></td></tr>`;
  }

  function rowItem({ id, label, shortcut, icon = "", disabled = false, checked = false }) {
    const dis = disabled ? " ctx-menu__row--disabled" : "";
    const shortcutHtml = shortcut ? `<span class="ctx-menu__shortcut">${shortcut}</span>` : "";
    const iconCell = icon
      ? `<span class="ctx-menu__icon">${icon}</span>`
      : checked
        ? `<span class="ctx-menu__icon ctx-menu__icon--check">${ICONS.check}</span>`
        : `<span class="ctx-menu__icon"></span>`;
    const labelCls = checked ? "ctx-menu__label ctx-menu__label--checked" : "ctx-menu__label";
    return `<tr class="ctx-menu__row${dis}" data-action="${id}" role="menuitem" tabindex="-1">
      <td class="ctx-menu__icon-cell">${iconCell}</td>
      <td class="ctx-menu__content-cell">
        <div class="ctx-menu__content-inner">
          <span class="${labelCls}">${label}</span>
          ${shortcutHtml}
        </div>
      </td>
    </tr>`;
  }

  function render() {
    const s = getState();
    const copyLabel = s.price != null ? `Copy price ${s.priceText}` : "Copy price";
    const drawingsLabel =
      s.drawingCount > 0 ? `Remove ${s.drawingCount} drawing${s.drawingCount === 1 ? "" : "s"}` : "Remove drawings";

    root.innerHTML = `<div class="ctx-menu__scroll"><table class="ctx-menu__table"><tbody>
      ${rowItem({ id: "reset", label: "Reset chart view", shortcut: "Alt + R", icon: ICONS.reset })}
      ${rowDivider()}
      ${rowItem({ id: "copy-price", label: copyLabel })}
      ${s.hasSelectedDrawing ? rowItem({ id: "copy-drawing", label: "Copy drawing", shortcut: "Ctrl + C" }) : ""}
      ${rowItem({ id: "paste", label: "Paste", shortcut: "Ctrl + V", disabled: !s.canPaste })}
      ${rowDivider()}
      ${rowItem({
        id: "lock-cursor",
        label: "Lock vertical cursor line by time",
        checked: s.lockCursorByTime,
      })}
      ${rowDivider()}
      ${rowItem({ id: "remove-drawings", label: drawingsLabel, disabled: s.drawingCount === 0 })}
      ${rowDivider()}
      ${rowItem({ id: "settings", label: "Settings…", icon: ICONS.settings })}
    </tbody></table></div>`;
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

  function runAction(id) {
    switch (id) {
      case "reset":
        actions.resetChart();
        break;
      case "copy-price":
        actions.copyPrice();
        break;
      case "copy-drawing":
        actions.copyDrawing?.();
        break;
      case "paste":
        actions.paste();
        break;
      case "lock-cursor":
        actions.toggleLockCursor();
        break;
      case "remove-drawings":
        actions.removeDrawings();
        break;
      case "settings":
        actions.openSettings();
        break;
      default:
        break;
    }
    close();
  }

  root.addEventListener("click", (ev) => {
    const row = ev.target.closest("[data-action]");
    if (!row || row.classList.contains("ctx-menu__row--disabled")) return;
    runAction(row.dataset.action);
  });

  container.addEventListener("contextmenu", async (ev) => {
    if (ev.target.closest(`${DRAWING_UI_SELECTOR}, .ctx-menu, .tv-status-ctx, #ohlc`)) return;
    if (chart && chartEl && hitPriceScale(chart, chartEl, ev.clientX, ev.clientY)) return;
    if (chart && chartEl && hitTimeScale(chart, chartEl, ev.clientX, ev.clientY)) return;
    ev.preventDefault();
    openX = ev.clientX;
    openY = ev.clientY;
    await onBeforeOpen?.();
    positionMenu(openX, openY);
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") close();
    if (ev.altKey && ev.key.toLowerCase() === "r") {
      ev.preventDefault();
      actions.resetChart();
      close();
    }
    if (ev.ctrlKey && ev.key.toLowerCase() === "c" && !root.hidden) {
      const s = getState();
      if (s.hasSelectedDrawing) {
        ev.preventDefault();
        actions.copyDrawing?.();
        close();
      }
    }
    if (ev.ctrlKey && ev.key.toLowerCase() === "v" && !root.hidden) {
      ev.preventDefault();
      actions.paste();
      close();
    }
  });

  window.addEventListener("resize", close);
  window.addEventListener("scroll", close, true);

  registerContextMenu({
    close,
    isOpen: () => !root.hidden,
    contains: (node) => root.contains(node),
  });

  return { close, openAt: positionMenu };
}
