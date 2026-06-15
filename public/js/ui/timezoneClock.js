import { closeAllContextMenus, registerContextMenu } from "./contextMenuRegistry.js";
import {
  TIMEZONE_OPTIONS,
  formatClockButton,
  resolveTimezone,
} from "../chart/timezones.js";

const CHECK_ICON = `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M22 9.06 11 20 6 14.7l1.09-1.02 3.94 4.16L20.94 8 22 9.06Z"/></svg>`;

/**
 * @param {object} opts
 * @param {HTMLElement} opts.mountEl
 * @param {() => string} opts.getTimezone
 * @param {() => object | null} opts.getSymbolInfo
 * @param {(tz: string) => void} opts.onTimezoneChange
 */
export function mountTimezoneClock(opts) {
  const { mountEl, getTimezone, getSymbolInfo, onTimezoneChange } = opts;

  const wrap = document.createElement("div");
  wrap.className = "tv-tz-clock";
  wrap.innerHTML = `<button type="button" class="tv-tz-clock__btn" aria-label="Timezone" title="Timezone"></button>`;
  mountEl.appendChild(wrap);

  const btn = wrap.querySelector(".tv-tz-clock__btn");
  if (!btn) throw new Error("Timezone clock button missing");

  const menu = document.createElement("div");
  menu.className = "ctx-menu ctx-menu--tz";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  document.body.appendChild(menu);

  let tickTimer = null;
  let menuOpen = false;

  function resolvedTz() {
    return resolveTimezone(getTimezone(), getSymbolInfo());
  }

  function updateLabel() {
    btn.textContent = formatClockButton(new Date(), resolvedTz());
  }

  function closeMenu() {
    menuOpen = false;
    menu.hidden = true;
  }

  function renderMenu() {
    const current = getTimezone();
    const rows = TIMEZONE_OPTIONS.map((tz) => {
      const checked = tz.value === current;
      const icon = checked
        ? `<span class="ctx-menu__icon ctx-menu__icon--check">${CHECK_ICON}</span>`
        : `<span class="ctx-menu__icon"></span>`;
      const labelCls = checked ? "ctx-menu__label ctx-menu__label--checked" : "ctx-menu__label";
      return `<tr class="ctx-menu__row" data-tz="${tz.value}" role="menuitem" tabindex="-1">
        <td class="ctx-menu__icon-cell">${icon}</td>
        <td class="ctx-menu__content-cell"><span class="${labelCls}">${tz.label}</span></td>
      </tr>`;
    }).join("");
    menu.innerHTML = `<div class="ctx-menu__scroll"><table class="ctx-menu__table"><tbody>${rows}</tbody></table></div>`;
  }

  function positionMenu() {
    if (!menuOpen) return;

    const rect = btn.getBoundingClientRect();
    const pad = 8;
    const gapAbove = 6;
    const nudgeLeft = 16;

    menu.hidden = false;
    menu.style.visibility = "hidden";
    menu.style.left = "auto";
    menu.style.top = "0";

    void menu.offsetHeight;

    const menuRect = menu.getBoundingClientRect();
    const menuW = menuRect.width || menu.offsetWidth;
    const menuH = menuRect.height || menu.offsetHeight;

    let right = window.innerWidth - rect.right + nudgeLeft;
    const leftEdge = window.innerWidth - right - menuW;
    if (leftEdge < pad) {
      right = window.innerWidth - menuW - pad;
    }

    menu.style.right = `${Math.round(right)}px`;

    let top = rect.top - menuH - gapAbove;
    if (top < pad) top = pad;
    if (top + menuH > rect.top - gapAbove) {
      top = Math.max(pad, rect.top - gapAbove - menuH);
    }

    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = "";
  }

  function openMenu() {
    closeAllContextMenus(closeMenu);
    renderMenu();
    menuOpen = true;
    menu.hidden = false;
    positionMenu();
    requestAnimationFrame(() => positionMenu());
  }

  function onLayoutChange() {
    if (menuOpen) positionMenu();
  }

  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (menuOpen) closeMenu();
    else openMenu();
  });

  menu.addEventListener("click", (ev) => {
    const row = ev.target.closest("[data-tz]");
    if (!row) return;
    onTimezoneChange(row.dataset.tz);
    updateLabel();
    closeMenu();
  });

  registerContextMenu({
    close: closeMenu,
    isOpen: () => menuOpen,
    contains: (node) => wrap.contains(node) || menu.contains(node),
  });

  window.addEventListener("resize", onLayoutChange);
  window.visualViewport?.addEventListener("resize", onLayoutChange);
  window.visualViewport?.addEventListener("scroll", onLayoutChange);

  const resizeObserver = new ResizeObserver(onLayoutChange);
  resizeObserver.observe(mountEl);
  resizeObserver.observe(btn);

  updateLabel();
  tickTimer = window.setInterval(updateLabel, 1000);

  return {
    update: updateLabel,
    destroy() {
      if (tickTimer) clearInterval(tickTimer);
      window.removeEventListener("resize", onLayoutChange);
      window.visualViewport?.removeEventListener("resize", onLayoutChange);
      window.visualViewport?.removeEventListener("scroll", onLayoutChange);
      resizeObserver.disconnect();
      closeMenu();
      menu.remove();
      wrap.remove();
    },
  };
}
