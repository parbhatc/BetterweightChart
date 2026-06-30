import { drawToolIcon } from "../../catalog/icons.js";
import { SUPPORTED_DRAW_TOOLS, TOOL_GROUPS, TOOL_LABELS } from "../../catalog/tools.js";
import { CURSOR_TOOLS } from "../../registry/tools.js";
import {
  isFavoriteTool,
  loadFavoriteTools,
  loadFavoriteToolbarVisible,
  saveFavoriteToolbarVisible,
  toggleFavoriteTool,
} from "../favorites/store.js";
import { createFavoriteToolbar } from "../favorite/index.js";
import { FAV_STAR_FILLED, FAV_STAR_OUTLINE, FAV_TOOLBAR_TOGGLE } from "../constants.js";
import { createFlyoutHost } from "../flyout/host.js";
import { createDrawingToolbarCollapse, NARROW_DRAW_TOOLBAR_MQ } from "../collapse.js";
import { mountMobilePlacementBar } from "../../placement/mobileBar.js";
import { createToolbarBuilders } from "../builders.js";
import { loadToolbarGroupTools, saveToolbarGroupTool } from "../selection/store.js";

/**
 * @param {object} opts
 * @param {ReturnType<import("../../controller/index.js").createDrawingController>} opts.controller
 * @param {HTMLElement} opts.toolbarEl
 */
export function mountMainToolbar(opts) {
  const { controller, toolbarEl } = opts;

  /** @type {Record<string, string>} */
  const groupSelection = Object.fromEntries(
    TOOL_GROUPS.filter((g) => g.defaultTool && !g.isCursor).map((g) => [g.id, g.defaultTool]),
  );
  Object.assign(groupSelection, loadToolbarGroupTools());
  let cursorSelection = "cursor";
  /** @type {string[]} */
  let favoriteTools = loadFavoriteTools();
  let favoriteToolbarVisible = loadFavoriteToolbarVisible();

  const flyout = createFlyoutHost(toolbarEl);
  const toolbarCollapse = createDrawingToolbarCollapse({ toolbarEl, flyout });

  function maybeExpandToolbar(opts = {}) {
    if (opts.skipExpand) return;
    if (NARROW_DRAW_TOOLBAR_MQ.matches && toolbarCollapse.isCollapsed()) {
      toolbarCollapse.expand();
    }
  }

  function findGroupForTool(type) {
    return TOOL_GROUPS.find((g) => {
      if (g.isCursor) return false;
      if (g.tools?.includes(type)) return true;
      return g.flyoutSections?.some((section) => section.tools.includes(type)) ?? false;
    });
  }

  function syncFavoriteButtons() {
    document.querySelectorAll(".draw-tools__fav-btn[data-fav-toggle-tool]").forEach((btn) => {
      const tool = btn.dataset.favToggleTool;
      if (!tool) return;
      const fav = isFavoriteTool(favoriteTools, tool);
      btn.classList.toggle("is-fav", fav);
      btn.innerHTML = fav ? FAV_STAR_FILLED : FAV_STAR_OUTLINE;
      btn.title = fav ? "Remove from favorites" : "Add to favorites";
      btn.setAttribute("aria-label", btn.title);
    });
  }

  function attachFavoriteButton(actionsEl, toolType) {
    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "draw-tools__fav-btn";
    favBtn.dataset.favToggleTool = toolType;
    const toggleFavorite = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const adding = !isFavoriteTool(favoriteTools, toolType);
      favoriteTools = toggleFavoriteTool(favoriteTools, toolType);
      if (adding && favoriteTools.includes(toolType)) {
        setFavoriteToolbarVisible(true);
      }
      syncFavoriteButtons();
      favoriteToolbar.render();
    };
    favBtn.addEventListener("click", toggleFavorite);
    favBtn.addEventListener("pointerup", (ev) => {
      if (ev.pointerType === "mouse") return;
      ev.preventDefault();
      toggleFavorite(ev);
    });
    actionsEl.appendChild(favBtn);
    syncFavoriteButtons();
  }

  function syncFavoriteToggleButton(btn) {
    btn.classList.toggle("draw-tools__tool--favorites-toggle", true);
    btn.classList.toggle("is-on", favoriteToolbarVisible);
    btn.setAttribute("aria-pressed", String(favoriteToolbarVisible));
  }

  const favoriteToolbar = createFavoriteToolbar({
    getFavorites: () => favoriteTools,
    getActiveTool: () => controller.getActiveTool(),
    onSelectTool: (type) => {
      controller.armChartPlacementSuppress?.();
      const group = findGroupForTool(type);
      if (group) selectTool(type, group.id, { skipExpand: true });
      else if (CURSOR_TOOLS.has(type)) selectCursorTool(type, { skipExpand: true });
    },
  });

  function setFavoriteToolbarVisible(visible) {
    favoriteToolbarVisible = visible;
    saveFavoriteToolbarVisible(visible);
    favoriteToolbar.setVisible(visible);
    const toggleBtn = toolbarEl.querySelector("[data-favorites-toggle]");
    if (toggleBtn) syncFavoriteToggleButton(toggleBtn);
  }

  setFavoriteToolbarVisible(favoriteToolbarVisible);

  function clearActiveUi() {
    toolbarEl.querySelectorAll(".draw-tools__tool--active, .draw-tools__flyout-item--active").forEach((el) => {
      el.classList.remove("draw-tools__tool--active", "draw-tools__flyout-item--active");
    });
  }

  let builders;

  function syncGroupPrimaryButton(groupId) {
    const group = TOOL_GROUPS.find((g) => g.id === groupId);
    if (!group || group.isCursor) return;
    const type = groupSelection[groupId] ?? group.defaultTool ?? "trend-line";
    const mainBtn = toolbarEl.querySelector(
      `[data-tool-group="${groupId}"] [data-draw-tool].draw-tools__tool--primary`,
    );
    if (!mainBtn) return;
    mainBtn.dataset.drawTool = type;
    mainBtn.title = TOOL_LABELS[type] ?? type;
    mainBtn.setAttribute("aria-label", TOOL_LABELS[type] ?? type);
    mainBtn.innerHTML = drawToolIcon(type, group.icon ?? "trend-line");
  }

  function syncAllGroupPrimaryButtons() {
    for (const group of TOOL_GROUPS) {
      if (!group.isCursor) syncGroupPrimaryButton(group.id);
    }
  }

  function syncActiveToolUi(type) {
    if (CURSOR_TOOLS.has(type)) {
      cursorSelection = type;
      clearActiveUi();
      toolbarEl
        .querySelector('[data-tool-group="cursors"] [data-draw-tool].draw-tools__tool--primary')
        ?.classList.add("draw-tools__tool--active");
      builders.updateCursorPrimaryButton();
      builders.syncCursorFlyout();
      favoriteToolbar.syncActive();
      return;
    }

    const group = findGroupForTool(type);
    if (!group) return;

    groupSelection[group.id] = type;
    saveToolbarGroupTool(group.id, type);
    clearActiveUi();
    syncGroupPrimaryButton(group.id);

    const mainBtn = toolbarEl.querySelector(
      `[data-tool-group="${group.id}"] [data-draw-tool].draw-tools__tool--primary`,
    );
    mainBtn?.classList.add("draw-tools__tool--active");

    document.querySelectorAll(`#draw-flyout-${group.id} [data-draw-tool]`).forEach((el) => {
      el.classList.toggle("draw-tools__flyout-item--active", el.dataset.drawTool === type);
    });
    favoriteToolbar.syncActive();
  }

  function selectCursorTool(type, opts = {}) {
    if (!CURSOR_TOOLS.has(type)) return;
    maybeExpandToolbar(opts);
    cursorSelection = type;
    controller.setActiveTool(type);
    clearActiveUi();
    toolbarEl
      .querySelector('[data-tool-group="cursors"] [data-draw-tool].draw-tools__tool--primary')
      ?.classList.add("draw-tools__tool--active");
    builders.updateCursorPrimaryButton();
    builders.syncCursorFlyout();
    flyout.closeAllFlyouts();
    favoriteToolbar.syncActive();
  }

  function selectTool(type, groupId, opts = {}) {
    if (!type || CURSOR_TOOLS.has(type)) {
      selectCursorTool(type || "cursor", opts);
      return;
    }

    if (controller.getActiveTool() === type) {
      selectCursorTool("cursor", opts);
      return;
    }

    maybeExpandToolbar(opts);

    if (SUPPORTED_DRAW_TOOLS.has(type)) {
      controller.setActiveTool(type);
    } else {
      controller.setActiveTool("cursor");
    }

    if (groupId) {
      groupSelection[groupId] = type;
      saveToolbarGroupTool(groupId, type);
    }
    clearActiveUi();

    if (groupId) {
      const group = TOOL_GROUPS.find((g) => g.id === groupId);
      syncGroupPrimaryButton(groupId);
      const mainBtn = toolbarEl.querySelector(
        `[data-tool-group="${groupId}"] [data-draw-tool].draw-tools__tool--primary`,
      );
      mainBtn?.classList.add("draw-tools__tool--active");
      document.querySelectorAll(`#draw-flyout-${groupId} [data-draw-tool]`).forEach((el) => {
        el.classList.toggle("draw-tools__flyout-item--active", el.dataset.drawTool === type);
      });
    }

    flyout.closeAllFlyouts();
    favoriteToolbar.syncActive();
  }

  builders = createToolbarBuilders({
    toolbarEl,
    controller,
    groupSelection,
    getCursorSelection: () => cursorSelection,
    selectCursorTool,
    selectTool,
    clearActiveUi,
    closeAllFlyouts: () => flyout.closeAllFlyouts(),
    flyout,
    attachFavoriteButton,
    maybeExpandToolbar,
  });

  const {
    buildToolGroup,
    buildUtilityCluster,
    buildMagnetFlyout,
    buildHideFlyout,
    buildRemoveFlyout,
    syncUtilityUi,
    syncCursorFlyout,
  } = builders;

  toolbarEl.innerHTML = "";
  toolbarEl.className = "drawing-toolbar";
  toolbarEl.setAttribute("role", "toolbar");
  toolbarEl.setAttribute("aria-orientation", "vertical");

  const root = document.createElement("div");
  root.className = "draw-tools";
  const scroll = document.createElement("div");
  scroll.className = "draw-tools__scroll";
  const inner = document.createElement("div");
  inner.className = "draw-tools__inner";

  const toolsSection = document.createElement("div");
  toolsSection.className = "draw-tools__section";
  for (const g of TOOL_GROUPS) toolsSection.appendChild(buildToolGroup(g));
  inner.appendChild(toolsSection);

  const utilsSection = document.createElement("div");
  utilsSection.className = "draw-tools__section";
  utilsSection.append(
    buildUtilityCluster({
      id: "measure",
      label: "Measure",
      icon: "measure",
      onPrimaryClick: () => {
        controller.setMeasureMode(!controller.getMeasureMode());
        syncUtilityUi();
      },
    }),
    buildUtilityCluster({
      id: "magnet",
      label: "Magnet Mode",
      icon: "magnet",
      withFlyout: buildMagnetFlyout,
      onPrimaryClick: () => {
        const mode = controller.getMagnetMode();
        controller.setMagnetMode(mode === "off" ? "weak" : "off");
        syncUtilityUi();
      },
    }),
    buildUtilityCluster({
      id: "stay-draw",
      label: "Stay in drawing mode",
      icon: "stay-draw-unlocked",
      onPrimaryClick: () => {
        controller.setStayInDrawingMode(!controller.getStayInDrawingMode());
        syncUtilityUi();
      },
    }),
    buildUtilityCluster({
      id: "lock",
      label: "Lock all drawings",
      icon: "unlock",
      onPrimaryClick: () => {
        controller.setLockAllDrawings(!controller.getLockAllDrawings());
        syncUtilityUi();
      },
    }),
    buildUtilityCluster({
      id: "hide",
      label: "Hide drawings",
      icon: "hide",
      withFlyout: buildHideFlyout,
      primaryOpensFlyout: true,
    }),
  );
  inner.appendChild(utilsSection);

  const clearSection = document.createElement("div");
  clearSection.className = "draw-tools__section";
  clearSection.append(
    buildUtilityCluster({
      id: "remove",
      label: "Remove drawings",
      icon: "remove",
      withFlyout: buildRemoveFlyout,
      primaryOpensFlyout: true,
    }),
  );
  inner.appendChild(clearSection);

  inner.appendChild(document.createElement("div")).className = "draw-tools__spacer";
  scroll.appendChild(inner);
  root.appendChild(scroll);

  const footer = document.createElement("div");
  footer.className = "draw-tools__footer";
  const favToggle = document.createElement("button");
  favToggle.type = "button";
  favToggle.className = "draw-tools__tool draw-tools__tool--action draw-tools__tool--favorites-toggle";
  favToggle.dataset.favoritesToggle = "true";
  favToggle.title = "Show Favorite Drawing Tools Toolbar";
  favToggle.setAttribute("aria-label", "Show Favorite Drawing Tools Toolbar");
  favToggle.innerHTML = `<span class="draw-tools__icon" role="img">${FAV_TOOLBAR_TOGGLE}</span>`;
  syncFavoriteToggleButton(favToggle);
  favToggle.addEventListener("click", () => setFavoriteToolbarVisible(!favoriteToolbarVisible));
  footer.appendChild(favToggle);
  root.appendChild(footer);

  toolbarEl.appendChild(root);
  toolbarCollapse.mountBottomToggle();
  syncAllGroupPrimaryButtons();
  syncCursorFlyout();
  syncUtilityUi();

  controller.on("change", syncUtilityUi);
  controller.on("utilityChange", syncUtilityUi);

  controller.on("toolChange", () => {
    const tool = controller.getActiveTool();
    syncActiveToolUi(tool);
  });

  function dismissDrawFlyoutsUnlessInside(ev) {
    if (ev.target.closest(".draw-tools__flyout")) return;
    if (ev.target.closest(".draw-tools__expand")) return;
    if (ev.target.closest(".tv-draw-toolbar-toggle")) return;
    if (ev.target.closest(".tv-floating-toolbar")) return;
    if (toolbarEl.contains(ev.target)) return;
    const hadOpenFlyout = toolbarEl.querySelector(".draw-tools__cluster--open") != null;
    flyout.closeAllFlyouts();
    if (hadOpenFlyout) controller.armChartPlacementSuppress(350);
  }

  document.addEventListener("click", dismissDrawFlyoutsUnlessInside);
  document.addEventListener("pointerdown", dismissDrawFlyoutsUnlessInside, true);
  document.addEventListener("touchstart", dismissDrawFlyoutsUnlessInside, { capture: true, passive: true });

  const stage = toolbarEl.closest(".tv-stage") ?? toolbarEl.closest(".tv-workspace");
  mountMobilePlacementBar(controller, stage);

  const onResizeRepositionFlyouts = () => flyout.repositionOpenFlyouts();
  window.addEventListener("resize", onResizeRepositionFlyouts);

  function destroy() {
    favoriteToolbar.destroy?.();
    document.removeEventListener("click", dismissDrawFlyoutsUnlessInside);
    document.removeEventListener("pointerdown", dismissDrawFlyoutsUnlessInside, true);
    document.removeEventListener("touchstart", dismissDrawFlyoutsUnlessInside, { capture: true });
    window.removeEventListener("resize", onResizeRepositionFlyouts);
  }

  return { selectCursorTool, selectTool, toolbarCollapse, destroy };
}

export const mountDrawingToolbar = mountMainToolbar;
export const mountDrawingTools = mountMainToolbar;
