import { CHEVRON_RIGHT, drawToolIcon } from "../catalog/icons.js";
import {
  CURSOR_ICON,
  SUPPORTED_DRAW_TOOLS,
  TOOL_GROUPS,
  TOOL_LABELS,
  TOOL_SHORTCUTS,
} from "../catalog/tools.js";
import { createUtilityToolbarUi } from "./utility/index.js";

/**
 * @param {object} ctx
 * @param {HTMLElement} ctx.toolbarEl
 * @param {ReturnType<import("../controller/index.js").createDrawingController>} ctx.controller
 * @param {Record<string, string>} ctx.groupSelection
 * @param {() => string} ctx.getCursorSelection
 * @param {(type: string) => void} ctx.selectCursorTool
 * @param {(type: string, groupId?: string) => void} ctx.selectTool
 * @param {() => void} ctx.clearActiveUi
 * @param {() => void} ctx.closeAllFlyouts
 * @param {import("./flyout/host.js").createFlyoutHost} ctx.flyout
 * @param {(actionsEl: HTMLElement, toolType: string) => void} ctx.attachFavoriteButton
 */
export function createToolbarBuilders(ctx) {
  const {
    toolbarEl,
    controller,
    groupSelection,
    getCursorSelection,
    selectCursorTool,
    selectTool,
    clearActiveUi,
    closeAllFlyouts,
    flyout,
    attachFavoriteButton,
  } = ctx;

  const { attachFlyoutToggle } = flyout;

  function buildFlyoutRow(toolType, group) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "draw-tools__flyout-item";
    if (!SUPPORTED_DRAW_TOOLS.has(toolType)) item.classList.add("draw-tools__flyout-item--soon");
    item.dataset.drawTool = toolType;
    item.setAttribute("role", "menuitem");
    item.title = TOOL_LABELS[toolType] ?? toolType;
    item.setAttribute("aria-label", TOOL_LABELS[toolType] ?? toolType);
    if (groupSelection[group.id] === toolType) item.classList.add("draw-tools__flyout-item--active");

    const shortcut = TOOL_SHORTCUTS[toolType];
    item.innerHTML = `<span class="draw-tools__flyout-item-main">
      ${drawToolIcon(toolType, group.icon)}
      <span class="draw-tools__flyout-label">${TOOL_LABELS[toolType] ?? toolType}</span>
    </span>
    <span class="draw-tools__flyout-item-actions">
      ${shortcut ? `<span class="draw-tools__flyout-shortcut">${shortcut}</span>` : ""}
    </span>`;

    const actionsEl = item.querySelector(".draw-tools__flyout-item-actions");
    if (actionsEl) attachFavoriteButton(actionsEl, toolType);

    item.addEventListener("click", () => selectTool(toolType, group.id));
    return item;
  }

  function updateCursorPrimaryButton() {
    const mainBtn = toolbarEl.querySelector('[data-tool-group="cursors"] [data-draw-tool].draw-tools__tool--primary');
    if (!mainBtn) return;
    const cursorSelection = getCursorSelection();
    const icon = CURSOR_ICON[cursorSelection] ?? "cross";
    const label = TOOL_LABELS[cursorSelection] ?? "Cross";
    mainBtn.dataset.drawTool = cursorSelection;
    mainBtn.title = label;
    mainBtn.setAttribute("aria-label", label);
    mainBtn.innerHTML = drawToolIcon(icon);
  }

  function syncCursorFlyout() {
    const cursorSelection = getCursorSelection();
    document.querySelectorAll("#draw-flyout-cursors [data-draw-tool]").forEach((el) => {
      el.classList.toggle("draw-tools__flyout-item--active", el.dataset.drawTool === cursorSelection);
    });
    const toggle = document.querySelector('[data-cursor-toggle="values-tooltip"]');
    if (toggle) {
      toggle.classList.toggle("draw-tools__switch--on", controller.getValuesTooltipOnLongPress());
    }
  }

  function buildCursorFlyout(cluster, control) {
    cluster.classList.add("draw-tools__cluster--has-menu", "draw-tools__cluster--cursors");

    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "draw-tools__expand";
    expandBtn.setAttribute("aria-label", "Cursors");
    expandBtn.setAttribute("aria-expanded", "false");
    expandBtn.title = "Cursors";
    expandBtn.innerHTML = CHEVRON_RIGHT;

    const flyoutEl = document.createElement("div");
    flyoutEl.className = "draw-tools__flyout draw-tools__flyout--cursor";
    flyoutEl.id = "draw-flyout-cursors";
    flyoutEl.hidden = true;
    flyoutEl.setAttribute("role", "menu");

    for (const toolType of TOOL_GROUPS[0].tools) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "draw-tools__flyout-item";
      item.dataset.drawTool = toolType;
      item.setAttribute("role", "menuitem");
      item.title = TOOL_LABELS[toolType] ?? toolType;
      item.innerHTML = `${drawToolIcon(CURSOR_ICON[toolType] ?? "cross")}<span class="draw-tools__flyout-label">${TOOL_LABELS[toolType] ?? toolType}</span>`;
      item.addEventListener("click", () => selectCursorTool(toolType));
      flyoutEl.appendChild(item);
    }

    const divider = document.createElement("div");
    divider.className = "draw-tools__flyout-divider";
    flyoutEl.appendChild(divider);

    const toggleRow = document.createElement("button");
    toggleRow.type = "button";
    toggleRow.className = "draw-tools__flyout-item draw-tools__flyout-item--toggle";
    toggleRow.innerHTML = `<span class="draw-tools__flyout-label">Values tooltip on long press</span><span class="draw-tools__switch" data-cursor-toggle="values-tooltip" aria-hidden="true"><span class="draw-tools__switch-track"></span><span class="draw-tools__switch-thumb"></span></span>`;
    toggleRow.addEventListener("click", (ev) => {
      ev.stopPropagation();
      controller.setValuesTooltipOnLongPress(!controller.getValuesTooltipOnLongPress());
      syncCursorFlyout();
    });
    flyoutEl.appendChild(toggleRow);

    attachFlyoutToggle(cluster, expandBtn, flyoutEl);
    control.appendChild(expandBtn);
  }

  function buildToolFlyout(cluster, group, control) {
    cluster.classList.add("draw-tools__cluster--has-menu");

    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "draw-tools__expand";
    expandBtn.setAttribute("aria-label", group.label);
    expandBtn.setAttribute("aria-expanded", "false");
    expandBtn.title = group.label;
    expandBtn.innerHTML = CHEVRON_RIGHT;

    const flyoutEl = document.createElement("div");
    flyoutEl.className = "draw-tools__flyout";
    if (group.flyoutSections?.length) flyoutEl.classList.add("draw-tools__flyout--mega");
    flyoutEl.id = `draw-flyout-${group.id}`;
    flyoutEl.hidden = true;
    flyoutEl.setAttribute("role", "menu");

    const sections = group.flyoutSections?.length
      ? group.flyoutSections
      : [{ title: null, tools: group.tools }];

    sections.forEach((section, index) => {
      if (index > 0) {
        const divider = document.createElement("div");
        divider.className = "draw-tools__flyout-divider";
        divider.setAttribute("role", "separator");
        flyoutEl.appendChild(divider);
      }
      if (section.title) {
        const heading = document.createElement("div");
        heading.className = "draw-tools__flyout-section-title";
        heading.textContent = section.title;
        flyoutEl.appendChild(heading);
      }
      for (const toolType of section.tools) {
        flyoutEl.appendChild(buildFlyoutRow(toolType, group));
      }
    });

    attachFlyoutToggle(cluster, expandBtn, flyoutEl);
    control.appendChild(expandBtn);
  }

  function buildToolGroup(group) {
    const cluster = document.createElement("div");
    cluster.className = "draw-tools__cluster";
    cluster.dataset.toolGroup = group.id;

    const control = document.createElement("div");
    control.className = "draw-tools__control";

    const mainBtn = document.createElement("button");
    mainBtn.type = "button";
    mainBtn.className = "draw-tools__tool draw-tools__tool--primary";
    const cursorSelection = getCursorSelection();
    const sel = group.isCursor ? cursorSelection : (groupSelection[group.id] ?? group.defaultTool);
    mainBtn.dataset.drawTool = sel;
    mainBtn.title = TOOL_LABELS[sel] ?? group.label;
    mainBtn.setAttribute("aria-label", TOOL_LABELS[sel] ?? group.label);
    if (group.isCursor) mainBtn.classList.add("draw-tools__tool--active");
    mainBtn.innerHTML = drawToolIcon(
      group.isCursor ? (CURSOR_ICON[cursorSelection] ?? "cross") : (groupSelection[group.id] ?? group.icon),
      group.icon,
    );
    mainBtn.addEventListener("click", () => {
      if (group.isCursor) selectCursorTool(cursorSelection);
      else selectTool(groupSelection[group.id] ?? group.defaultTool, group.id);
    });
    control.appendChild(mainBtn);
    cluster.appendChild(control);

    if (group.isCursor) buildCursorFlyout(cluster, control);
    else if (group.tools.length > 1) buildToolFlyout(cluster, group, control);

    return cluster;
  }

  const utility = createUtilityToolbarUi({
    toolbarEl,
    controller,
    closeAllFlyouts,
    flyout,
    selectCursorTool,
  });

  return {
    buildToolGroup,
    ...utility,
    syncCursorFlyout,
    updateCursorPrimaryButton,
  };
}
