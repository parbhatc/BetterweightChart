import { drawToolIcon } from "../../catalog/icons.js";
import { TOOL_LABELS } from "../../catalog/tools.js";
import { loadFavoriteToolbarPos, saveFavoriteToolbarPos } from "../favorites/store.js";

const DRAG_HANDLE = `<svg viewBox="0 0 8 12" width="8" height="12" fill="currentColor" aria-hidden="true"><rect width="2" height="2" rx="1"/><rect width="2" height="2" rx="1" y="5"/><rect width="2" height="2" rx="1" y="10"/><rect width="2" height="2" rx="1" x="6"/><rect width="2" height="2" rx="1" x="6" y="5"/><rect width="2" height="2" rx="1" x="6" y="10"/></svg>`;

/**
 * @param {object} opts
 * @param {(tool: string) => void} opts.onSelectTool
 * @param {() => string} opts.getActiveTool
 * @param {() => string[]} opts.getFavorites
 */
export function createFavoriteToolbar(opts) {
  const { onSelectTool, getActiveTool, getFavorites } = opts;

  const root = document.createElement("div");
  root.className = "tv-floating-toolbar";
  root.hidden = true;
  root.style.zIndex = "20";
  root.innerHTML = `<div class="tv-floating-toolbar__widget-wrapper">
    <div class="tv-floating-toolbar__drag" data-fav-drag>${DRAG_HANDLE}</div>
    <div class="tv-floating-toolbar__content" data-fav-content></div>
  </div>`;
  document.body.appendChild(root);

  const content = root.querySelector("[data-fav-content]");
  const dragHandle = root.querySelector("[data-fav-drag]");
  if (!content || !dragHandle) throw new Error("Favorite toolbar mount failed");

  function defaultPosition() {
    const toolbar = document.getElementById("drawing-toolbar");
    const rect = toolbar?.getBoundingClientRect();
    const left = rect ? rect.right + 8 : 66;
    const top = rect ? Math.max(8, rect.bottom - 160) : Math.max(8, window.innerHeight - 200);
    return { left, top };
  }

  function applyPosition(pos) {
    const pad = 8;
    const maxLeft = window.innerWidth - root.offsetWidth - pad;
    const maxTop = window.innerHeight - root.offsetHeight - pad;
    root.style.left = `${Math.min(Math.max(pad, pos.left), Math.max(pad, maxLeft))}px`;
    root.style.top = `${Math.min(Math.max(pad, pos.top), Math.max(pad, maxTop))}px`;
  }

  function ensurePosition() {
    const saved = loadFavoriteToolbarPos();
    applyPosition(saved ?? defaultPosition());
  }

  function render() {
    const favorites = getFavorites();
    const active = getActiveTool();
    content.innerHTML = favorites
      .map((tool) => {
        const label = TOOL_LABELS[tool] ?? tool;
        const activeCls = active === tool ? " is-active" : "";
        return `<div class="tv-floating-toolbar__widget">
          <button type="button" class="tv-favorited-drawings-toolbar__widget${activeCls}" data-fav-tool="${tool}" title="${label}" aria-label="${label}">
            ${drawToolIcon(tool)}
          </button>
        </div>`;
      })
      .join("");
  }

  function syncActive() {
    const active = getActiveTool();
    content.querySelectorAll("[data-fav-tool]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.favTool === active);
    });
  }

  function setVisible(visible) {
    root.hidden = !visible;
    if (visible) {
      render();
      ensurePosition();
      syncActive();
    }
  }

  content.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-fav-tool]");
    if (!btn?.dataset.favTool) return;
    ev.preventDefault();
    ev.stopPropagation();
    onSelectTool(btn.dataset.favTool);
    syncActive();
  });

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  dragHandle.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    dragging = true;
    root.classList.add("is-dragging");
    startX = ev.clientX;
    startY = ev.clientY;
    originLeft = root.offsetLeft;
    originTop = root.offsetTop;
    dragHandle.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });

  const endDrag = (ev) => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("is-dragging");
    if (ev?.pointerId != null) dragHandle.releasePointerCapture(ev.pointerId);
    saveFavoriteToolbarPos({ left: root.offsetLeft, top: root.offsetTop });
  };

  dragHandle.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    applyPosition({
      left: originLeft + ev.clientX - startX,
      top: originTop + ev.clientY - startY,
    });
  });

  dragHandle.addEventListener("pointerup", endDrag);
  dragHandle.addEventListener("pointercancel", endDrag);

  window.addEventListener("resize", () => {
    if (root.hidden) return;
    applyPosition({ left: root.offsetLeft, top: root.offsetTop });
  });

  return { root, render, syncActive, setVisible, ensurePosition };
}
