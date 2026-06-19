import {
  CHEVRON_DOWN,
  COPY_IMAGE,
  COPY_LINK,
  DOWNLOAD_IMAGE,
  FULLSCREEN,
  OPEN_NEW_TAB,
  SCREENSHOT,
  SETTINGS,
} from "../icons.js";
import { mountFullscreenMode } from "../fullscreen/mode.js";
import { createChartSnapshot } from "../snapshot/chart.js";
import { getLayoutDef, getLayoutGroupsForViewport } from "../layout/definitions.js";
import { getLayoutIcon } from "../layout/icons.js";
import { loadSavedLayouts, removeLayoutFromLibrary } from "../layout/manager.js";
import { showLayoutConfirmDialog, showLayoutNameDialog } from "../layout/dialogs.js";

/**
 * @param {object} opts
 * @param {HTMLElement} opts.mountEl
 * @param {() => import("lightweight-charts").IChartApi | null} opts.getChart
 * @param {() => string} [opts.getShareUrl]
 * @param {import("../layout/manager.js").ReturnType<typeof import("../layout/manager.js").createLayoutManager>} opts.layoutManager
 * @param {() => void} [opts.onSaveLayout]
 * @param {(entry: import("../layout/manager.js").SavedLayout) => void} [opts.onLoadLayout]
 * @param {() => void} [opts.onLayoutChange]
 * @param {() => void} [opts.onCreateLayout]
 * @param {() => void} [opts.onDuplicateLayout]
 * @param {(name: string) => void} [opts.onDeleteLayout]
 */
export function mountHeaderToolbar(opts) {
  const {
    mountEl,
    getChart,
    getShareUrl,
    layoutManager,
    onSaveLayout,
    onLoadLayout,
    onLayoutChange,
    onCreateLayout,
    onDuplicateLayout,
    onDeleteLayout,
  } = opts;

  const root = document.createElement("div");
  root.className = "tv-header-tools";
  root.innerHTML = `
    <button type="button" class="tv-header-tools__btn" id="header-toolbar-layouts" aria-label="Layout setup" data-tooltip="Layout setup" title="Layout setup" aria-haspopup="menu">
      <span class="tv-header-tools__icon tv-header-tools__icon--layout" data-layout-icon aria-hidden="true"></span>
    </button>
    <div class="tv-header-tools__save-wrap" data-save-wrap>
      <button type="button" class="tv-header-tools__save-btn" id="header-toolbar-save-load" aria-label="All changes saved" data-tooltip="All changes saved" title="All changes saved">
        <span class="tv-header-tools__save-stack">
          <span class="tv-header-tools__save-text" data-layout-name>Unnamed</span>
          <span class="tv-header-tools__save-action" data-dirty-save-label hidden aria-hidden="true">Save</span>
        </span>
      </button>
      <button type="button" class="tv-header-tools__save-menu-btn" data-name="save-load-menu" aria-label="Manage layouts" data-tooltip="Manage layouts" title="Manage layouts" aria-haspopup="menu">
        <span class="tv-header-tools__chev">${CHEVRON_DOWN}</span>
      </button>
    </div>
    <button type="button" class="tv-header-tools__btn" id="header-toolbar-fullscreen" aria-label="Fullscreen mode" data-tooltip="Fullscreen mode" title="Fullscreen mode (Shift+F)">
      <span class="tv-header-tools__icon" data-fullscreen-icon>${FULLSCREEN}</span>
    </button>
    <button type="button" class="tv-header-tools__btn tv-header-tools__btn--menu" id="header-toolbar-screenshot" aria-label="Take a snapshot" data-tooltip="Take a snapshot" title="Take a snapshot" aria-haspopup="menu">
      <span class="tv-header-tools__icon">${SCREENSHOT}</span>
    </button>
    <div class="tv-header-tools__sep" aria-hidden="true"></div>
    <button type="button" class="tv-header-tools__btn" id="settings-btn" aria-label="Settings" data-tooltip="Settings" title="Settings">
      <span class="tv-header-tools__icon">${SETTINGS}</span>
    </button>
  `;
  mountEl.prepend(root);

  const appEl = document.querySelector(".tv-app");
  const fullscreenBtn = root.querySelector("#header-toolbar-fullscreen");
  const fullscreenIcon = root.querySelector("[data-fullscreen-icon]");
  /** @type {ReturnType<typeof mountFullscreenMode> | null} */
  let fullscreen = null;
  if (appEl && fullscreenBtn instanceof HTMLButtonElement && fullscreenIcon instanceof HTMLElement) {
    fullscreen = mountFullscreenMode({ appEl, toggleBtn: fullscreenBtn, iconEl: fullscreenIcon });
  }

  const snapshot = createChartSnapshot(getChart, undefined, getShareUrl);
  const screenshotBtn = root.querySelector("#header-toolbar-screenshot");
  const layoutBtn = root.querySelector("#header-toolbar-layouts");
  const layoutIconEl = root.querySelector("[data-layout-icon]");
  const saveBtn = root.querySelector("#header-toolbar-save-load");
  const saveWrap = root.querySelector("[data-save-wrap]");
  const saveMenuBtn = root.querySelector("[data-name=save-load-menu]");
  const layoutNameEl = root.querySelector("[data-layout-name]");
  const saveActionEl = root.querySelector("[data-dirty-save-label]");

  function performSave() {
    const inLibrary = savedLayoutsInclude(layoutManager.getLayoutName());
    if (!layoutManager.isDirty() && inLibrary) return;
    onSaveLayout?.();
    layoutManager.markSaved();
    updateSaveState();
  }

  /** @type {HTMLElement | null} */
  let openMenu = null;

  function closeMenu() {
    if (openMenu) {
      openMenu.remove();
      openMenu = null;
    }
  }

  /** @param {HTMLElement} anchor @param {HTMLElement} menu */
  function positionMenu(anchor, menu) {
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    let left = rect.left;
    let top = rect.bottom + 4;
    const menuRect = menu.getBoundingClientRect();
    if (left + menuRect.width > window.innerWidth - pad) {
      left = window.innerWidth - menuRect.width - pad;
    }
    if (top + menuRect.height > window.innerHeight - pad) {
      top = rect.top - menuRect.height - 4;
    }
    menu.style.left = `${Math.max(pad, left)}px`;
    menu.style.top = `${Math.max(pad, top)}px`;
    openMenu = menu;
  }

  function updateSaveState() {
    if (!(saveBtn instanceof HTMLButtonElement) || !(layoutNameEl instanceof HTMLElement)) return;
    const dirty = layoutManager.isDirty();
    const autoSave = layoutManager.getAutoSave();
    const showDirty = dirty && !autoSave;
    const inLibrary = savedLayoutsInclude(layoutManager.getLayoutName());
    layoutNameEl.textContent = layoutManager.getLayoutName();
    saveWrap?.classList.toggle("tv-header-tools__save-wrap--autosave", autoSave);
    saveWrap?.classList.toggle("tv-header-tools__save-wrap--dirty", showDirty);
    saveBtn.classList.toggle("tv-header-tools__save-btn--dirty", showDirty);
    if (saveActionEl instanceof HTMLElement) {
      saveActionEl.hidden = !showDirty;
      saveActionEl.setAttribute("aria-hidden", showDirty ? "false" : "true");
    }
    const savedLabel = autoSave
      ? "Auto-saving layout"
      : dirty
        ? "Save layout"
        : inLibrary
          ? "All changes saved"
          : "Unsaved layout";
    const tooltip = showDirty ? "Save layout" : savedLabel;
    saveBtn.dataset.tooltip = tooltip;
    saveBtn.title = tooltip;
    saveBtn.setAttribute("aria-label", tooltip);
  }

  function savedLayoutsInclude(name) {
    return loadSavedLayouts().some((s) => s.name === name);
  }

  function updateLayoutIcon() {
    if (layoutIconEl instanceof HTMLElement) {
      layoutIconEl.innerHTML = getLayoutIcon(layoutManager.getLayoutId());
    }
  }

  function markLayoutDirty() {
    updateSaveState();
    onLayoutChange?.();
  }

  layoutManager.setLayout = ((orig) => (id, opts) => {
    orig(id, opts);
    updateLayoutIcon();
    if (!opts?.silent) markLayoutDirty();
  })(layoutManager.setLayout.bind(layoutManager));

  layoutManager.setSync = ((orig) => (next) => {
    orig(next);
    markLayoutDirty();
  })(layoutManager.setSync.bind(layoutManager));

  function openSnapshotMenu() {
    closeMenu();
    if (!(screenshotBtn instanceof HTMLElement)) return;
    const menu = document.createElement("div");
    menu.className = "tv-header-menu";
    menu.innerHTML = `
      <div class="tv-header-menu__title">Chart snapshot</div>
      <button type="button" class="tv-header-menu__item" data-action="download">
        <span class="tv-header-menu__icon">${DOWNLOAD_IMAGE}</span>
        <span class="tv-header-menu__label">Download image</span>
        <span class="tv-header-menu__hotkey">Ctrl + Alt + S</span>
      </button>
      <button type="button" class="tv-header-menu__item" data-action="copy">
        <span class="tv-header-menu__icon">${COPY_IMAGE}</span>
        <span class="tv-header-menu__label">Copy image</span>
        <span class="tv-header-menu__hotkey">Ctrl + Shift + S</span>
      </button>
      <button type="button" class="tv-header-menu__item" data-action="link">
        <span class="tv-header-menu__icon">${COPY_LINK}</span>
        <span class="tv-header-menu__label">Copy link</span>
        <span class="tv-header-menu__hotkey">Alt + S</span>
      </button>
      <button type="button" class="tv-header-menu__item" data-action="tab">
        <span class="tv-header-menu__icon">${OPEN_NEW_TAB}</span>
        <span class="tv-header-menu__label">Open in new tab</span>
      </button>
    `;
    menu.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-action]");
      if (!(btn instanceof HTMLElement)) return;
      const action = btn.dataset.action;
      closeMenu();
      if (action === "download") await snapshot.downloadImage();
      if (action === "copy") await snapshot.copyImage();
      if (action === "link") await snapshot.copyLink();
      if (action === "tab") await snapshot.openInNewTab();
    });
    positionMenu(screenshotBtn, menu);
  }

  function openLayoutMenu() {
    closeMenu();
    if (!(layoutBtn instanceof HTMLElement)) return;
    const activeId = layoutManager.getLayoutId();
    const sync = layoutManager.getSync();
    const paneCount = getLayoutDef(activeId).count;

    const menu = document.createElement("div");
    menu.className = "tv-header-menu tv-header-menu--layouts";
    menu.innerHTML = `
      <div class="tv-header-layouts" data-name="layouts-list">
        ${getLayoutGroupsForViewport().map(
          (group) => `
          <div class="tv-header-layouts__row">
            <div class="tv-header-layouts__label">${group.label}</div>
            <div class="tv-header-layouts__buttons">
              ${group.ids
                .map(
                  (id) => `
                <button type="button" class="tv-header-layouts__btn${id === activeId ? " is-active" : ""}" data-layout-id="${id}" aria-label="${id}" aria-checked="${id === activeId}">
                  ${getLayoutIcon(id)}
                </button>`,
                )
                .join("")}
            </div>
          </div>`,
        ).join("")}
      </div>
      <div class="tv-header-menu__sep"></div>
      <div class="tv-header-menu__title tv-header-menu__title--sync">Sync in layout</div>
      <div class="tv-header-sync">
        ${syncRow("symbol", "Symbol", "Symbol changes on all charts within the layout", sync.symbol, paneCount < 2)}
        ${syncRow("interval", "Interval", "Interval changes on all charts within the layout", sync.interval, paneCount < 2)}
        ${syncRow("crosshair", "Crosshair", "Crosshair is synced across all charts within the layout", sync.crosshair, paneCount < 2)}
        ${syncRow("time", "Time", "When a chart is clicked, all charts display the same point of time", sync.time, paneCount < 2)}
        ${syncRow("dateRange", "Date range", "Date range changes on all charts within the layout", sync.dateRange, paneCount < 2)}
        ${syncRow("drawings", "Drawings", "Drawings are synced across all charts within the layout", sync.drawings, paneCount < 2)}
      </div>
    `;

    menu.addEventListener("click", (ev) => {
      const layoutItem = ev.target.closest("[data-layout-id]");
      if (layoutItem instanceof HTMLElement && layoutItem.dataset.layoutId) {
        layoutManager.setLayout(layoutItem.dataset.layoutId);
        closeMenu();
        return;
      }
    });

    menu.addEventListener("change", (ev) => {
      const input = ev.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
      const key = input.dataset.syncKey;
      if (!key) return;
      layoutManager.setSync({ [key]: input.checked });
      markLayoutDirty();
    });

    positionMenu(layoutBtn, menu);
  }

  function openSaveMenu() {
    closeMenu();
    if (!(saveMenuBtn instanceof HTMLElement)) return;
    const saved = loadSavedLayouts();
    const currentName = layoutManager.getLayoutName();
    const menu = document.createElement("div");
    menu.className = "tv-header-menu tv-header-menu--save";
    menu.innerHTML = `
      <label class="tv-header-menu__item tv-header-menu__item--switch">
        <span class="tv-header-menu__label">Auto-save</span>
        <span class="tv-header-switch"><input type="checkbox" role="switch" data-save-action="autosave"${layoutManager.getAutoSave() ? " checked" : ""} /></span>
      </label>
      <div class="tv-header-menu__sep"></div>
      <button type="button" class="tv-header-menu__item" data-save-action="create">Create new layout…</button>
      <button type="button" class="tv-header-menu__item" data-save-action="duplicate">Make a copy…</button>
      <button type="button" class="tv-header-menu__item" data-save-action="save">Save layout</button>
      <button type="button" class="tv-header-menu__item" data-save-action="rename">Rename layout…</button>
      <div class="tv-header-menu__sep"></div>
      <div class="tv-header-menu__title">Saved layouts</div>
      ${
        saved.length
          ? saved
              .map(
                (item) =>
                  `<div class="tv-header-menu__row">
                    <button type="button" class="tv-header-menu__item tv-header-menu__item--grow${item.name === currentName ? " is-active" : ""}" data-save-action="load" data-save-name="${escapeAttr(item.name)}">${escapeHtml(item.name)}</button>
                    <button type="button" class="tv-header-menu__item tv-header-menu__item--icon" data-save-action="delete-layout" data-save-name="${escapeAttr(item.name)}" aria-label="Delete layout ${escapeAttr(item.name)}" title="Delete">×</button>
                  </div>`,
              )
              .join("")
          : `<div class="tv-header-menu__empty">No saved layouts</div>`
      }
    `;
    menu.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-save-action]");
      if (!(btn instanceof HTMLElement)) return;
      const action = btn.dataset.saveAction;
      if (action === "autosave") return;
      if (action === "create") {
        closeMenu();
        onCreateLayout?.();
        updateSaveState();
        return;
      }
      if (action === "duplicate") {
        closeMenu();
        onDuplicateLayout?.();
        updateSaveState();
        return;
      }
      if (action === "save") {
        performSave();
        closeMenu();
        return;
      }
      if (action === "rename") {
        closeMenu();
        void (async () => {
          const name = await showLayoutNameDialog({
            title: "Rename layout",
            value: layoutManager.getLayoutName(),
            confirmLabel: "Rename",
          });
          if (!name) return;
          layoutManager.setLayoutName(name);
          updateSaveState();
          onLayoutChange?.();
        })();
        return;
      }
      if (action === "load" && btn.dataset.saveName) {
        const item = saved.find((s) => s.name === btn.dataset.saveName);
        if (item) {
          layoutManager.setLayout(item.layoutId);
          layoutManager.setSync(item.sync);
          layoutManager.setLayoutName(item.name);
          onLoadLayout?.(item);
          layoutManager.markSaved();
          updateSaveState();
        }
        closeMenu();
        return;
      }
      if (action === "delete-layout" && btn.dataset.saveName) {
        const name = btn.dataset.saveName;
        closeMenu();
        void (async () => {
          const confirmed = await showLayoutConfirmDialog({
            title: "Delete layout",
            message:
              name === currentName
                ? `Delete "${name}" and reset to a new unsaved workspace?`
                : `Delete saved layout "${name}"?`,
            confirmLabel: "Delete",
            destructive: true,
          });
          if (!confirmed) {
            openSaveMenu();
            return;
          }
          onDeleteLayout?.(name);
          updateSaveState();
          openSaveMenu();
        })();
      }
    });
    menu.addEventListener("change", (ev) => {
      const input = ev.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
      if (input.dataset.saveAction !== "autosave") return;
      layoutManager.setAutoSave(input.checked);
      updateSaveState();
      if (input.checked && layoutManager.isDirty()) {
        performSave();
      }
      onLayoutChange?.();
    });
    positionMenu(saveMenuBtn, menu);
  }

  screenshotBtn?.addEventListener("click", () => {
    if (openMenu) closeMenu();
    else openSnapshotMenu();
  });
  layoutBtn?.addEventListener("click", () => {
    if (openMenu) closeMenu();
    else openLayoutMenu();
  });
  saveMenuBtn?.addEventListener("click", () => {
    if (openMenu) closeMenu();
    else openSaveMenu();
  });
  saveBtn?.addEventListener("click", () => {
    performSave();
  });

  document.addEventListener("mousedown", (ev) => {
    if (!openMenu) return;
    const t = ev.target;
    if (!(t instanceof Node)) return;
    if (openMenu.contains(t)) return;
    if (screenshotBtn?.contains(t) || layoutBtn?.contains(t) || saveMenuBtn?.contains(t)) return;
    closeMenu();
  });

  document.addEventListener("keydown", async (ev) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
    if (ev.ctrlKey && ev.altKey && ev.key.toLowerCase() === "s") {
      ev.preventDefault();
      await snapshot.downloadImage();
    }
    if (ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === "s") {
      ev.preventDefault();
      await snapshot.copyImage();
    }
    if (ev.altKey && !ev.ctrlKey && !ev.shiftKey && ev.key.toLowerCase() === "s") {
      ev.preventDefault();
      await snapshot.copyLink();
    }
  });

  updateSaveState();
  updateLayoutIcon();

  return { updateSaveState, updateLayoutIcon, closeMenu, fullscreen };
}

/** @param {string} key @param {string} label @param {string} tip @param {boolean} checked @param {boolean} disabled */
function syncRow(key, label, tip, checked, disabled) {
  return `<label class="tv-header-sync__row" title="${tip}">
    <span class="tv-header-sync__label">${label}</span>
    <span class="tv-header-switch"><input type="checkbox" role="switch" data-sync-key="${key}"${checked ? " checked" : ""}${disabled ? " disabled" : ""} /></span>
  </label>`;
}

/** @param {string} value */
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** @param {string} value */
function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
