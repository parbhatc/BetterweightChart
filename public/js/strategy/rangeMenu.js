import {
  BACKTEST_RANGE_PRESETS,
  DEFAULT_BACKTEST_RANGE_ID,
  normalizeBacktestRangeId,
} from "./backtestRange.js";
import { createBacktestCustomDateDialog } from "./customDateDialog.js";

const ICON_CALENDAR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="none" aria-hidden="true"><path fill="currentColor" d="M10 6h8V4h1v2h1.5A2.5 2.5 0 0 1 23 8.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 5 19.5v-11A2.5 2.5 0 0 1 7.5 6H9V4h1zM6 19.5A1.5 1.5 0 0 0 7.5 21h13a1.5 1.5 0 0 0 1.5-1.5V11H6zM7.5 7A1.5 1.5 0 0 0 6 8.5V10h16V8.5A1.5 1.5 0 0 0 20.5 7H19v1h-1V7h-8v1H9V7z"/></svg>`;

export function createBacktestRangeMenu() {
  const root = document.createElement("div");
  root.className = "tv-strategy-range-menu";
  root.hidden = true;
  root.setAttribute("role", "menu");
  document.body.appendChild(root);

  /** @type {string} */
  let activeId = DEFAULT_BACKTEST_RANGE_ID;
  /** @type {((range: import("./backtestRange.js").BacktestRange | string) => void) | null} */
  let onSelect = null;
  /** @type {(() => void) | null} */
  let onCustom = null;
  /** @type {((ev: PointerEvent) => void) | null} */
  let outsideListener = null;

  function disarmOutside() {
    if (!outsideListener) return;
    document.removeEventListener("pointerdown", outsideListener, true);
    outsideListener = null;
  }

  function close() {
    disarmOutside();
    root.hidden = true;
    onSelect = null;
    onClose?.();
    onClose = null;
  }

  /** @type {(() => void) | null} */
  let onClose = null;

  const customDialog = createBacktestCustomDateDialog({
    onApply: (range) => {
      activeId = "custom";
      onSelect?.(range);
    },
  });

  function render() {
    const chunks = [];
    chunks.push(`<div class="tv-strategy-range-menu__head">
      <span class="tv-strategy-range-menu__title">Testing period</span>
      <button type="button" class="tv-strategy-range-menu__reset" data-range-reset>Reset</button>
    </div>`);

    for (const item of BACKTEST_RANGE_PRESETS) {
      if (item.dividerBefore) {
        chunks.push('<div class="tv-strategy-range-menu__divider" role="separator"></div>');
      }
      const active = item.id === activeId;
      const hint = item.hint
        ? `<span class="tv-strategy-range-menu__hint">${item.hint}</span>`
        : "";
      const icon = item.icon
        ? `<span class="tv-strategy-range-menu__icon">${ICON_CALENDAR}</span>`
        : "";
      chunks.push(`<button type="button" class="tv-strategy-range-menu__item${active ? " is-active" : ""}" data-range-id="${item.id}" role="menuitem">
        ${icon}
        <span class="tv-strategy-range-menu__label">${item.label}</span>
        ${hint}
      </button>`);
    }

    root.innerHTML = chunks.join("");
  }

  /**
   * @param {HTMLElement} anchor
   * @param {object} opts
   * @param {string} opts.activeId
   * @param {(range: import("./backtestRange.js").BacktestRange | string) => void} opts.onSelect
   * @param {() => void} [opts.onClose]
   * @param {{ fromDate?: string, toDate?: string }} [opts.customDates]
   */
  function open(anchor, opts) {
    activeId = normalizeBacktestRangeId(opts.activeId);
    onSelect = opts.onSelect;
    onClose = opts.onClose ?? null;
    onCustom = () => {
      customDialog.open({
        fromDate: opts.customDates?.fromDate,
        toDate: opts.customDates?.toDate,
      });
    };
    render();
    root.hidden = false;

    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    let left = rect.left;
    let top = rect.bottom + 6;
    const menuRect = root.getBoundingClientRect();
    if (left + menuRect.width > window.innerWidth - pad) {
      left = window.innerWidth - menuRect.width - pad;
    }
    if (top + menuRect.height > window.innerHeight - pad) {
      top = rect.top - menuRect.height - 6;
    }
    root.style.left = `${Math.max(pad, left)}px`;
    root.style.top = `${Math.max(pad, top)}px`;

    disarmOutside();
    outsideListener = (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      if (root.contains(target) || anchor.contains(target)) return;
      close();
    };
    setTimeout(() => {
      if (outsideListener) document.addEventListener("pointerdown", outsideListener, true);
    }, 0);
  }

  root.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;

    if (target.closest("[data-range-reset]")) {
      activeId = DEFAULT_BACKTEST_RANGE_ID;
      onSelect?.(activeId);
      close();
      return;
    }

    const item = target.closest("[data-range-id]");
    if (!(item instanceof HTMLElement) || !item.dataset.rangeId) return;
    const id = item.dataset.rangeId;
    if (id === "custom") {
      close();
      onCustom?.();
      return;
    }
    activeId = id;
    onSelect?.(id);
    close();
  });

  return { open, close, isOpen: () => !root.hidden };
}
