import { closeAllContextMenus, registerContextMenu } from "./registry.js";
import { hitPriceScale } from "../../chart/scale/settings.js";

const ICONS = {
  settings: `<svg viewBox="0 0 28 28" width="18" height="18" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path><path fill-rule="evenodd" d="M8.5 5h11l5 9-5 9h-11l-5-9 5-9Zm-3.86 9L9.1 6h9.82l4.45 8-4.45 8H9.1l-4.45-8Z"></path></svg>`,
  check: `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M22 9.06 11 20 6 14.7l1.09-1.02 3.94 4.16L20.94 8 22 9.06Z"/></svg>`,
};

/**
 * @typedef {{
 *   autoScale: boolean,
 *   lockPriceToBarRatio: boolean,
 *   lockRatioText: string,
 *   scalePriceChartOnly: boolean,
 *   invertScale: boolean,
 *   priceScaleMode: string,
 *   moveScaleLabel: string,
 * }} PriceScaleMenuState
 */

/**
 * @typedef {{
 *   setAutoScale: () => void,
 *   toggleLockRatio: () => void,
 *   toggleScalePriceChartOnly: () => void,
 *   toggleInvertScale: () => void,
 *   setPriceScaleMode: (mode: string) => void,
 *   moveScale: () => void,
 *   openSettings: () => void,
 * }} PriceScaleMenuActions
 */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container
 * @param {HTMLElement} opts.chartEl
 * @param {import("lightweight-charts").IChartApi} opts.chart
 * @param {(side: "left" | "right") => PriceScaleMenuState} opts.getState
 * @param {PriceScaleMenuActions} opts.actions
 */
export function mountPriceScaleContextMenu(opts) {
  const { container, chartEl, chart, getState, actions } = opts;

  const root = document.createElement("div");
  root.className = "ctx-menu ctx-menu--chart ctx-menu--price-scale";
  root.hidden = true;
  root.setAttribute("role", "menu");
  document.body.appendChild(root);

  function close() {
    root.hidden = true;
  }

  function rowDivider() {
    return `<tr class="ctx-menu__divider-row"><td><div class="ctx-menu__divider"></div></td><td><div class="ctx-menu__divider"></div></td></tr>`;
  }

  function rowItem({ id, label, shortcut = "", icon = "", checked = false }) {
    const shortcutHtml = shortcut ? `<span class="ctx-menu__shortcut">${shortcut}</span>` : "";
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
          ${shortcutHtml}
        </div>
      </td>
    </tr>`;
  }

  let activeSide = "right";

  function resolveState() {
    return getState(activeSide);
  }

  function render() {
    const s = resolveState();
    root.innerHTML = `<div class="ctx-menu__scroll"><table class="ctx-menu__table"><tbody>
      ${rowItem({ id: "auto-scale", label: "Auto (fits data to screen)", checked: s.autoScale })}
      ${rowItem({
        id: "lock-ratio",
        label: "Lock price to bar ratio",
        shortcut: s.lockRatioText,
        checked: s.lockPriceToBarRatio,
      })}
      ${rowItem({
        id: "scale-price-only",
        label: "Scale price chart only",
        checked: s.scalePriceChartOnly,
      })}
      ${rowItem({ id: "invert-scale", label: "Invert scale", shortcut: "Alt + I", checked: s.invertScale })}
      ${rowDivider()}
      ${rowItem({ id: "mode-regular", label: "Regular", checked: s.priceScaleMode === "regular" })}
      ${rowItem({ id: "mode-percent", label: "Percent", shortcut: "Alt + P", checked: s.priceScaleMode === "percent" })}
      ${rowItem({ id: "mode-indexed", label: "Indexed to 100", checked: s.priceScaleMode === "indexed100" })}
      ${rowItem({
        id: "mode-log",
        label: "Logarithmic",
        shortcut: "Alt + L",
        checked: s.priceScaleMode === "logarithmic",
      })}
      ${rowDivider()}
      ${rowItem({ id: "move-scale", label: s.moveScaleLabel })}
      ${rowDivider()}
      ${rowItem({ id: "settings", label: "More settings…", icon: ICONS.settings })}
    </tbody></table></div>`;
  }

  function positionMenu(x, y, side) {
    activeSide = side;
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
      case "auto-scale":
        actions.setAutoScale();
        break;
      case "lock-ratio":
        actions.toggleLockRatio();
        break;
      case "scale-price-only":
        actions.toggleScalePriceChartOnly();
        break;
      case "invert-scale":
        actions.toggleInvertScale();
        break;
      case "mode-regular":
        actions.setPriceScaleMode("regular");
        break;
      case "mode-percent":
        actions.setPriceScaleMode("percent");
        break;
      case "mode-indexed":
        actions.setPriceScaleMode("indexed100");
        break;
      case "mode-log":
        actions.setPriceScaleMode("logarithmic");
        break;
      case "move-scale":
        actions.moveScale();
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
    if (!row) return;
    runAction(row.dataset.action);
  });

  container.addEventListener(
    "contextmenu",
    (ev) => {
      if (ev.target.closest(".ctx-menu, .drawing-toolbar, .draw-tools")) return;
      const side = hitPriceScale(chart, chartEl, ev.clientX, ev.clientY);
      if (!side) return;
      ev.preventDefault();
      ev.stopPropagation();
      positionMenu(ev.clientX, ev.clientY, side);
    },
    true,
  );

  document.addEventListener("keydown", (ev) => {
    if (root.hidden) return;
    if (ev.key === "Escape") close();
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
