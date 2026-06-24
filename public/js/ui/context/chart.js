import { closeAllContextMenus, registerContextMenu } from "./registry.js";
import { hitPriceScale, hitTimeScale } from "../../chart/scale/settings.js";
import { DRAWING_UI_SELECTOR } from "../../drawings/constants.js";
import { runContextMenuAction } from "../../debug/chart/contextMenu.js";
import { getTradeContextActions, hasTradeContextActions } from "../../chart/hostHooks.js";

const TRADE_QTY_PRESETS = [1, 2, 3, 5, 10, 15];

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
 *   indicatorCount: number,
 *   lockCursorByTime: boolean,
 *   canPaste: boolean,
 *   hasSelectedDrawing: boolean,
 *   crosshairTime: number | null,
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
 *   removeIndicators: () => void,
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

  function rowItem({ id, label, shortcut, icon = "", disabled = false, checked = false, hasSubmenu = false }) {
    const dis = disabled ? " ctx-menu__row--disabled" : "";
    const shortcutHtml = shortcut ? `<span class="ctx-menu__shortcut">${shortcut}</span>` : "";
    const arrowHtml = hasSubmenu ? `<span class="ctx-menu__arrow">${ICONS.chevron}</span>` : "";
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
          ${shortcutHtml}${arrowHtml}
        </div>
      </td>
    </tr>`;
  }

  function render() {
    const s = getState();
    const copyLabel = s.price != null ? `Copy price ${s.priceText}` : "Copy price";
    const drawingsLabel =
      s.drawingCount > 0 ? `Remove ${s.drawingCount} drawing${s.drawingCount === 1 ? "" : "s"}` : "Remove drawings";
    const indicatorsLabel =
      s.indicatorCount > 0
        ? `Remove ${s.indicatorCount} indicator${s.indicatorCount === 1 ? "" : "s"}`
        : "Remove indicators";

    const trade = getTradeContextActions();
    const tradeRows = [];
    if (hasTradeContextActions() && trade) {
      if (trade.onMarketBuy) {
        tradeRows.push(rowItem({ id: "trade-market-buy", label: "Market Buy", hasSubmenu: true }));
      }
      if (trade.onMarketSell) {
        tradeRows.push(rowItem({ id: "trade-market-sell", label: "Market Sell", hasSubmenu: true }));
      }
    }

    root.innerHTML = `<div class="ctx-menu__scroll"><table class="ctx-menu__table"><tbody>
      ${rowItem({ id: "reset", label: "Reset chart view", shortcut: "Alt + R", icon: ICONS.reset })}
      ${tradeRows.length ? `${rowDivider()}${tradeRows.join("")}${rowDivider()}` : `${rowDivider()}`}
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
      ${rowItem({ id: "remove-indicators", label: indicatorsLabel, disabled: s.indicatorCount === 0 })}
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

  function runTradeAction(id) {
    const s = getState();
    const trade = getTradeContextActions();
    const price = s.price ?? 0;
    const time = s.crosshairTime ?? undefined;

    const match = id.match(/^trade-market-(buy|sell)-(\d+)$/);
    if (match) {
      const side = match[1];
      const qty = Number(match[2]);
      if (!Number.isFinite(qty) || qty <= 0) return;

      runContextMenuAction("chart", id, close, () => {
        if (side === "buy") {
          trade?.onMarketBuy?.(qty, price, time);
        } else {
          trade?.onMarketSell?.(qty, price, time);
        }
      });
    }
  }

  /** @param {"buy" | "sell"} side @param {HTMLElement} anchorRow */
  function openMarketSubmenu(side, anchorRow) {
    closeSubmenu();
    const trade = getTradeContextActions();
    const handler = side === "buy" ? trade?.onMarketBuy : trade?.onMarketSell;
    if (!handler) return;

    const sideLabel = side === "buy" ? "Buy" : "Sell";
    const items = TRADE_QTY_PRESETS.map((qty) => ({
      id: `trade-market-${side}-${qty}`,
      label: `Market ${sideLabel} ${qty}`,
      shortcut: qty === 1 ? (side === "buy" ? "Ctrl + B" : "Ctrl + S") : undefined,
    }));

    const rows = items.map((item) => rowItem(item)).join("");
    submenuEl = document.createElement("div");
    submenuEl.className = "ctx-menu ctx-menu--sub ctx-menu--trade-sub";
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
      runTradeAction(row.dataset.action);
    });
  }

  function runAction(id, row) {
    if (id === "trade-market-buy") {
      openMarketSubmenu("buy", row);
      return;
    }
    if (id === "trade-market-sell") {
      openMarketSubmenu("sell", row);
      return;
    }
    const detail =
      id === "remove-drawings"
        ? { drawingCount: getState().drawingCount }
        : id === "remove-indicators"
          ? { indicatorCount: getState().indicatorCount }
          : undefined;
    runContextMenuAction(
      "chart",
      id,
      close,
      () => {
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
          case "remove-indicators":
            actions.removeIndicators();
            break;
          case "settings":
            actions.openSettings();
            break;
          default:
            break;
        }
      },
      detail,
    );
  }

  root.addEventListener("click", (ev) => {
    const row = ev.target.closest("[data-action]");
    if (!row || row.classList.contains("ctx-menu__row--disabled")) return;
    runAction(row.dataset.action, row);
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
  window.addEventListener("scroll", () => {
    if (root.hidden) return;
    close();
  }, true);

  registerContextMenu({
    close,
    isOpen: () => !root.hidden || Boolean(submenuEl),
    contains: (node) => root.contains(node) || Boolean(submenuEl?.contains(node)),
  });

  return { close, openAt: positionMenu };
}
