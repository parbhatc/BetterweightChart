/**
 * @typedef {{ id: string, label: string, icon?: string }} TvMenuItem
 */

export function createTvMenu() {
  const root = document.createElement("div");
  root.className = "tv-menu-popover";
  root.hidden = true;
  root.innerHTML = `<div class="tv-menu-popover__inner" data-menu-inner role="menu"></div>`;
  document.body.appendChild(root);

  const inner = root.querySelector("[data-menu-inner]");
  if (!inner) throw new Error("TV menu mount failed");

  /** @type {((id: string) => void) | null} */
  let onSelect = null;
  /** @type {((id: string, checked: boolean) => void) | null} */
  let onCheckboxChange = null;

  function close() {
    root.hidden = true;
    onSelect = null;
    onCheckboxChange = null;
    inner.innerHTML = "";
  }

  /**
   * @param {HTMLElement} anchor
   * @param {TvMenuItem[]} items
   * @param {{ activeId?: string, onSelect: (id: string) => void }} opts
   */
  function open(anchor, items, opts) {
    onCheckboxChange = null;
    onSelect = opts.onSelect;
    inner.className = "tv-menu-popover__inner";
    inner.innerHTML = items
      .map(
        (item) => `<button type="button" class="tv-menu-popover__item${opts.activeId === item.id ? " is-active" : ""}" data-menu-id="${item.id}" role="menuitem">
        ${item.icon ? `<span class="tv-menu-popover__icon">${item.icon}</span>` : ""}
        <span class="tv-menu-popover__label-row"><span class="tv-menu-popover__label">${item.label}</span></span>
      </button>`,
      )
      .join("");

    root.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    let left = rect.left;
    let top = rect.bottom + 4;
    const menuRect = root.getBoundingClientRect();
    if (left + menuRect.width > window.innerWidth - pad) {
      left = window.innerWidth - menuRect.width - pad;
    }
    if (top + menuRect.height > window.innerHeight - pad) {
      top = rect.top - menuRect.height - 4;
    }
    root.style.left = `${Math.max(pad, left)}px`;
    root.style.top = `${Math.max(pad, top)}px`;
  }

  /**
   * @param {HTMLElement} anchor
   * @param {TvMenuItem[]} items
   * @param {{ checked?: Record<string, boolean>, onChange: (id: string, checked: boolean) => void }} opts
   */
  function openCheckboxMenu(anchor, items, opts) {
    onSelect = null;
    onCheckboxChange = opts.onChange;
    inner.className = "tv-menu-popover__inner tv-menu-popover__inner--checks";
    inner.innerHTML = items
      .map(
        (item) => `<label class="tv-menu-popover__check">
          <input type="checkbox" data-check-id="${item.id}"${opts.checked?.[item.id] ? " checked" : ""} />
          <span class="tv-menu-popover__check-label">${item.label}</span>
        </label>`,
      )
      .join("");

    root.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    let left = rect.left;
    let top = rect.bottom + 4;
    const menuRect = root.getBoundingClientRect();
    if (left + menuRect.width > window.innerWidth - pad) {
      left = window.innerWidth - menuRect.width - pad;
    }
    if (top + menuRect.height > window.innerHeight - pad) {
      top = rect.top - menuRect.height - 4;
    }
    root.style.left = `${Math.max(pad, left)}px`;
    root.style.top = `${Math.max(pad, top)}px`;
  }

  inner.addEventListener("change", (ev) => {
    const input = ev.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
    const id = input.dataset.checkId;
    if (!id || !onCheckboxChange) return;
    onCheckboxChange(id, input.checked);
  });

  inner.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-menu-id]");
    if (!(btn instanceof HTMLElement)) return;
    const id = btn.dataset.menuId;
    if (!id) return;
    onSelect?.(id);
    close();
  });

  document.addEventListener(
    "mousedown",
    (ev) => {
      if (root.hidden) return;
      const t = ev.target;
      if (!(t instanceof Node)) return;
      if (root.contains(t)) return;
      close();
    },
    true,
  );

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !root.hidden) close();
  });

  return { open, openCheckboxMenu, close, isOpen: () => !root.hidden };
}

export const LINE_WIDTH_MENU_ITEMS = [1, 2, 3, 4].map((w) => ({
  id: String(w),
  label: `${w}px`,
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 ${w}" width="18" height="${w}"><rect width="18" height="${w}" fill="currentColor" rx="${w <= 1 ? 0.5 : 1}"/></svg>`,
}));

export const LINE_STYLE_MENU_ITEMS = [
  {
    id: "0",
    label: "Line",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path stroke="currentColor" d="M4 13.5h20"/></svg>`,
  },
  {
    id: "2",
    label: "Dashed line",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path fill="currentColor" d="M4 13h5v1H4v-1zM12 13h5v1h-5v-1zM20 13h5v1h-5v-1z"/></svg>`,
  },
  {
    id: "1",
    label: "Dotted line",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><path fill="currentColor" d="M3 13h2v2H3v-2Zm5 0h2v2H8v-2Zm7 0h-2v2h2v-2Zm3 0h2v2h-2v-2Zm7 0h-2v2h2v-2Z"/></svg>`,
  },
];

export const TEXT_ALIGN_V_ITEMS = [
  { id: "top", label: "Top" },
  { id: "middle", label: "Middle" },
  { id: "bottom", label: "Bottom" },
];

export const TEXT_ALIGN_H_ITEMS = [
  { id: "left", label: "Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Right" },
];

export const EXTEND_CHECKBOX_ITEMS = [
  { id: "left", label: "Extend left line" },
  { id: "right", label: "Extend right line" },
];
