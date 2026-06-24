import { ICON_CLEAR, ICON_CLOSE, ICON_DELETE, ICON_SEARCH } from "../../../indicators/ui/icons.js";
import { getLayoutDef } from "./definitions.js";
import { getLayoutIcon } from "./icons.js";
import { showLayoutConfirmDialog } from "./dialogs.js";

/** @typedef {import("./manager.js").SavedLayout} SavedLayout */

/** @param {object} opts
 *  @param {() => SavedLayout[]} opts.getLayouts
 *  @param {() => string} opts.getCurrentName
 *  @param {(item: SavedLayout) => void} opts.onLoad
 *  @param {(name: string) => void} opts.onDelete
 */
export function showOpenLayoutsDialog(opts) {
  const { getLayouts, getCurrentName, onLoad, onDelete } = opts;

  const modal = ensureModal();
  const searchInput = modal.querySelector("[data-layout-search]");
  const clearBtn = modal.querySelector("[data-clear]");
  const listEl = modal.querySelector("[data-layout-list]");

  if (!(searchInput instanceof HTMLInputElement) || !(listEl instanceof HTMLElement)) return;

  let query = "";

  function close() {
    modal.hidden = true;
    document.body.classList.remove("tv-layouts-modal-open");
    document.removeEventListener("keydown", onKey);
  }

  function open() {
    query = "";
    searchInput.value = "";
    if (clearBtn instanceof HTMLElement) clearBtn.hidden = true;
    renderList();
    modal.hidden = false;
    document.body.classList.add("tv-layouts-modal-open");
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => {
      searchInput.focus();
      searchInput.select();
    });
  }

  /** @param {KeyboardEvent} ev */
  function onKey(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  }

  function renderList() {
    const currentName = getCurrentName();
    const needle = query.trim().toLowerCase();
    const items = getLayouts()
      .filter((item) => !needle || item.name.toLowerCase().includes(needle))
      .sort((a, b) => layoutSortKey(b) - layoutSortKey(a));

    if (!items.length) {
      listEl.innerHTML = `<div class="tv-layouts-modal__empty">${
        needle ? "No layouts match your search" : "No saved layouts yet"
      }</div>`;
      return;
    }

    listEl.innerHTML = items
      .map((item) => {
        const active = item.name === currentName;
        const def = getLayoutDef(item.layoutId);
        const chartMeta = def.count === 1 ? "Single chart" : `${def.count} charts`;
        return `<div class="tv-layouts-modal__row${active ? " is-active" : ""}" data-layout-row>
          <button type="button" class="tv-layouts-modal__open" data-action="load" data-layout-name="${escapeAttr(item.name)}">
            <span class="tv-layouts-modal__icon" aria-hidden="true">${getLayoutIcon(item.layoutId)}</span>
            <span class="tv-layouts-modal__text">
              <span class="tv-layouts-modal__name">${escapeHtml(item.name)}</span>
              <span class="tv-layouts-modal__meta">${escapeHtml(chartMeta)}</span>
              <span class="tv-layouts-modal__times">
                <span>Last updated ${formatLayoutTime(item.updatedAt)}</span>
                <span class="tv-layouts-modal__times-sep" aria-hidden="true">·</span>
                <span>Last used ${formatLayoutTime(item.lastUsedAt)}</span>
              </span>
            </span>
            ${active ? `<span class="tv-layouts-modal__badge">Current</span>` : ""}
          </button>
          <button type="button" class="tv-layouts-modal__delete" data-action="delete" data-layout-name="${escapeAttr(item.name)}" aria-label="Delete layout ${escapeAttr(item.name)}" title="Delete layout">
            ${ICON_DELETE}
          </button>
        </div>`;
      })
      .join("");
  }

  if (!modal.dataset.wired) {
    modal.dataset.wired = "1";

    modal.querySelector("[data-backdrop]")?.addEventListener("click", close);
    modal.querySelector("[data-close]")?.addEventListener("click", close);

    searchInput.addEventListener("input", () => {
      query = searchInput.value;
      if (clearBtn instanceof HTMLElement) clearBtn.hidden = !query;
      renderList();
    });

    clearBtn?.addEventListener("click", () => {
      query = "";
      searchInput.value = "";
      if (clearBtn instanceof HTMLElement) clearBtn.hidden = true;
      searchInput.focus();
      renderList();
    });

    listEl.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-action]");
      if (!(btn instanceof HTMLElement)) return;
      const name = btn.dataset.layoutName;
      if (!name) return;

      if (btn.dataset.action === "load") {
        const item = getLayouts().find((s) => s.name === name);
        if (item) {
          onLoad(item);
          close();
        }
        return;
      }

      if (btn.dataset.action === "delete") {
        ev.stopPropagation();
        void (async () => {
          const currentName = getCurrentName();
          document.removeEventListener("keydown", onKey);
          const confirmed = await showLayoutConfirmDialog({
            title: "Delete layout",
            message:
              name === currentName
                ? `Delete "${name}" and reset to a new unsaved workspace?`
                : `Delete saved layout "${name}"?`,
            confirmLabel: "Delete",
            destructive: true,
          });
          if (!modal.hidden) document.addEventListener("keydown", onKey);
          if (!confirmed) return;
          onDelete(name);
          renderList();
        })();
      }
    });
  }

  open();
}

function ensureModal() {
  let modal = document.getElementById("layouts-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "layouts-modal";
  modal.className = "tv-layouts-modal";
  modal.hidden = true;
  modal.innerHTML = `<div class="tv-layouts-modal__backdrop" data-backdrop></div>
<div class="tv-layouts-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="layouts-modal-title">
  <div class="tv-layouts-modal__header">
    <h2 id="layouts-modal-title" class="tv-layouts-modal__title">Open layout</h2>
    <button type="button" class="tv-layouts-modal__close" data-close aria-label="Close">${ICON_CLOSE}</button>
  </div>
  <div class="tv-layouts-modal__search-wrap">
    <span class="tv-layouts-modal__search-icon">${ICON_SEARCH}</span>
    <input
      type="search"
      class="tv-layouts-modal__search"
      data-layout-search
      placeholder="Search layouts"
      autocomplete="off"
      spellcheck="false"
    />
    <div class="tv-layouts-modal__search-actions">
      <button type="button" class="tv-layouts-modal__clear" data-clear aria-label="Clear search" title="Clear" hidden>${ICON_CLEAR}</button>
    </div>
  </div>
  <div class="tv-layouts-modal__body">
    <div class="tv-layouts-modal__list" data-layout-list role="listbox" aria-label="Saved layouts"></div>
  </div>
</div>`;
  document.body.appendChild(modal);
  return modal;
}

/** @param {string} value */
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** @param {string} value */
function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

/** @param {SavedLayout} item */
function layoutSortKey(item) {
  return item.lastUsedAt ?? item.updatedAt ?? item.createdAt ?? 0;
}

/** @param {number | undefined} ts */
function formatLayoutTime(ts) {
  if (!ts || !Number.isFinite(ts)) return "Never";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return min === 1 ? "1 min ago" : `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? "1 hour ago" : `${hr} hours ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day} days ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ts));
}
