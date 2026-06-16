import { createColorPicker, applyColorOpacity } from "../../../ui/color/picker.js";
import { loadEditToolbarPos, saveEditToolbarPos } from "../favorites/store.js";
import {
  applyFloatingToolbarPos,
  bindFloatingToolbarViewportGuard,
  isFloatingToolbarPosInViewport,
  readFloatingToolbarPos,
} from "../floating/position.js";
import { createTvMenu, LINE_WIDTH_MENU_ITEMS, LINE_STYLE_MENU_ITEMS } from "../../settings/menu/tv.js";
import { createDrawingSettingsDialog } from "../../settings/dialog/index.js";
import { wireToolbarHints, hideToolbarHint } from "../../settings/hint/tool.js";
import { isRegressionTrendTool } from "../../tools/regression/trend.js";
import { isChannelBackgroundTool } from "../../tools/channel/family.js";
import {
  clearLayoutScopedToolDefault,
  hasLayoutScopedToolDefault,
  loadLayoutScopedToolDefaults,
  saveLayoutScopedToolDefault,
} from "../defaults/layoutScope.js";
import { extractToolDefaults } from "../defaults/store.js";

const EDIT_TOOL_HINTS = {
  templates: "Templates",
  "line-tool-color": "Line tool colors",
  "background-color": "Background color",
  "text-color": "Text color",
  "line-tool-width": "Line width",
  style: "Line style",
  settings: "Settings",
  remove: "Remove",
};

const DRAG_HANDLE = `<svg viewBox="0 0 8 12" width="8" height="12" fill="currentColor" aria-hidden="true"><rect width="2" height="2" rx="1"/><rect width="2" height="2" rx="1" y="5"/><rect width="2" height="2" rx="1" y="10"/><rect width="2" height="2" rx="1" x="6"/><rect width="2" height="2" rx="1" x="6" y="5"/><rect width="2" height="2" rx="1" x="6" y="10"/></svg>`;

const ICONS = {
  templates: `<svg viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" d="M15.5 18.5h6m-3 3v-6"/><rect width="6" height="6" rx="1.5" x="6.5" y="6.5"/><rect width="6" height="6" rx="1.5" x="15.5" y="6.5"/><rect width="6" height="6" rx="1.5" x="6.5" y="15.5"/></svg>`,
  color: `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M10.62.72a2.47 2.47 0 0 1 3.5 0l1.16 1.16c.96.97.96 2.54 0 3.5l-.58.58-8.9 8.9-1 1-.14.14H0v-4.65l.14-.15 1-1 8.9-8.9.58-.58Zm2.8.7a1.48 1.48 0 0 0-2.1 0l-.23.23 3.26 3.26.23-.23c.58-.58.58-1.52 0-2.1l-1.16-1.16Zm.23 4.2-3.26-3.27-8.2 8.2 3.25 3.27 8.2-8.2Zm-8.9 8.9-3.27-3.26-.5.5V15h3.27l.5-.5Z"/></svg>`,
  backgroundColor: `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true"><path stroke="currentColor" d="M13.5 6.5l-3-3-7 7 7.59 7.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82L13.5 6.5zm0 0v-4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6"></path><path fill="currentColor" d="M0 16.5C0 15 2.5 12 2.5 12S5 15 5 16.5 4 19 2.5 19 0 18 0 16.5z"></path><circle fill="currentColor" cx="9.5" cy="9.5" r="1.5"></circle></svg>`,
  textColor: `<svg viewBox="0 0 13 15" width="13" height="15" fill="none" aria-hidden="true"><path stroke="currentColor" d="M4 14.5h2.5m2.5 0H6.5m0 0V.5m0 0h-5a1 1 0 0 0-1 1V4m6-3.5h5a1 1 0 0 1 1 1V4"/></svg>`,
  width: `<svg viewBox="0 0 18 2" width="18" height="2" aria-hidden="true"><rect width="18" height="2" fill="currentColor" rx="1"/></svg>`,
  style: `<svg width="28" height="28" aria-hidden="true"><path stroke="currentColor" d="M4 13.5h20"/></svg>`,
  settings: `<svg viewBox="0 0 28 28" width="28" height="28" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path fill-rule="evenodd" d="M8.5 5h11l5 9-5 9h-11l-5-9 5-9Zm-3.86 9L9.1 6h9.82l4.45 8-4.45 8H9.1l-4.45-8Z"/></svg>`,
  lock: `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M14 6a3 3 0 0 0-3 3v3h6V9a3 3 0 0 0-3-3zm4 6V9a4 4 0 0 0-8 0v3H8.5A2.5 2.5 0 0 0 6 14.5v7A2.5 2.5 0 0 0 8.5 24h11a2.5 2.5 0 0 0 2.5-2.5v-7a2.5 2.5 0 0 0-2.5-2.5H18zm-5 5a1 1 0 1 1 2 0v2a1 1 0 1 1-2 0v-2zm-6-2.5c0-.83.67-1.5 1.5-1.5h11c.83 0 1.5.67 1.5 1.5v7c0 .83-.67 1.5-1.5 1.5h-11A1.5 1.5 0 0 1 7 21.5v-7z"/></svg>`,
  unlock: `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M14 6a3 3 0 0 0-3 3v3h8.5a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 6 21.5v-7A2.5 2.5 0 0 1 8.5 12H10V9a4 4 0 0 1 8 0h-1a3 3 0 0 0-3-3zm-1 11a1 1 0 1 1 2 0v2a1 1 0 1 1-2 0v-2zm-6-2.5c0-.83.67-1.5 1.5-1.5h11c.83 0 1.5.67 1.5 1.5v7c0 .83-.67 1.5-1.5 1.5h-11A1.5 1.5 0 0 1 7 21.5v-7z"/></svg>`,
  remove: `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M18 7h5v1h-2.01l-1.33 14.64a1.5 1.5 0 0 1-1.5 1.36H9.84a1.5 1.5 0 0 1-1.49-1.36L7.01 8H5V7h5V6c0-1.1.9-2 2-2h4a2 2 0 0 1 2 2v1Zm-6-2a1 1 0 0 0-1 1v1h6V6a1 1 0 0 0-1-1h-4ZM8.02 8l1.32 14.54a.5.5 0 0 0 .5.46h8.33a.5.5 0 0 0 .5-.46L19.99 8H8.02Z"/></svg>`,
};

/**
 * @param {object} opts
 * @param {ReturnType<typeof import("../../controller/index.js").createDrawingController>} opts.controller
 * @param {import("lightweight-charts").IChartApi} [opts.chart]
 * @param {() => import("lightweight-charts").IChartApi | null} [opts.getChart]
 * @param {() => object} [opts.getContext]
 */
export function mountEditToolbar(opts) {
  const { controller, chart: chartOpt, getChart, getContext = () => ({ bars: [] }) } = opts;
  const resolveChart = () => getChart?.() ?? chartOpt ?? null;
  const colorPicker = createColorPicker();
  const tvMenu = createTvMenu();
  const settingsDialog = createDrawingSettingsDialog({ controller, getContext });

  const root = document.createElement("div");
  root.className = "tv-floating-toolbar tv-drawing-edit-toolbar";
  root.hidden = true;
  root.style.zIndex = "25";
  root.innerHTML = `<div class="tv-floating-toolbar__widget-wrapper">
    <div class="tv-floating-toolbar__drag" data-edit-drag>${DRAG_HANDLE}</div>
    <div class="tv-floating-toolbar__content">
      <div class="floating-toolbar-react-widgets" data-edit-widgets></div>
    </div>
  </div>`;
  document.body.appendChild(root);

  const widgets = root.querySelector("[data-edit-widgets]");
  const dragHandle = root.querySelector("[data-edit-drag]");
  if (!widgets || !dragHandle) throw new Error("Drawing edit toolbar mount failed");

  widgets.innerHTML = `
    <button type="button" class="floating-toolbar-react-widgets__button" data-name="templates" aria-label="Templates">${ICONS.templates}</button>
    <button type="button" class="floating-toolbar-react-widgets__button" data-name="line-tool-color" aria-label="Line tool colors">
      <span class="drawing-edit-toolbar__color-wrap">
        <span class="drawing-edit-toolbar__color-icon">${ICONS.color}</span>
        <span class="drawing-edit-toolbar__color-swatch" data-color-swatch></span>
      </span>
    </button>
    <button type="button" class="floating-toolbar-react-widgets__button" data-name="background-color" aria-label="Background color" hidden>
      <span class="drawing-edit-toolbar__color-wrap">
        <span class="drawing-edit-toolbar__color-icon">${ICONS.backgroundColor}</span>
        <span class="drawing-edit-toolbar__color-swatch" data-background-swatch></span>
      </span>
    </button>
    <button type="button" class="floating-toolbar-react-widgets__button" data-name="text-color" aria-label="Text color">
      <span class="drawing-edit-toolbar__color-wrap">
        <span class="drawing-edit-toolbar__color-icon">${ICONS.textColor}</span>
        <span class="drawing-edit-toolbar__color-swatch drawing-edit-toolbar__color-swatch--text" data-text-swatch></span>
      </span>
    </button>
    <button type="button" class="floating-toolbar-react-widgets__button" data-name="line-tool-width" aria-label="Line width">
      <span class="drawing-edit-toolbar__width-wrap">
        ${ICONS.width}
        <span class="drawing-edit-toolbar__width-label" data-width-label>2px</span>
      </span>
    </button>
    <button type="button" class="floating-toolbar-react-widgets__button" data-name="style" aria-label="Line style">${ICONS.style}</button>
    <button type="button" class="floating-toolbar-react-widgets__button" data-name="settings" aria-label="Settings">${ICONS.settings}</button>
    <button type="button" class="floating-toolbar-react-widgets__button" data-name="lock" aria-label="Lock" aria-pressed="false">${ICONS.unlock}</button>
    <button type="button" class="floating-toolbar-react-widgets__button" data-name="remove" aria-label="Remove">${ICONS.remove}</button>
  `;

  const colorSwatch = widgets.querySelector("[data-color-swatch]");
  const templatesBtn = widgets.querySelector('[data-name="templates"]');
  const lineColorBtn = widgets.querySelector('[data-name="line-tool-color"]');
  const backgroundColorBtn = widgets.querySelector('[data-name="background-color"]');
  const backgroundSwatch = widgets.querySelector("[data-background-swatch]");
  const textColorBtn = widgets.querySelector('[data-name="text-color"]');
  const widthBtn = widgets.querySelector('[data-name="line-tool-width"]');
  const styleBtn = widgets.querySelector('[data-name="style"]');
  const textSwatch = widgets.querySelector("[data-text-swatch]");
  const widthLabel = widgets.querySelector("[data-width-label]");
  const lockBtn = widgets.querySelector('[data-name="lock"]');

  let manualPosition = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  function applyFixedPosition(pos) {
    return applyFloatingToolbarPos(root, pos);
  }

  function applyPosition(pos) {
    const pad = 8;
    const w = root.offsetWidth || 320;
    const h = root.offsetHeight || 40;
    const left = pos.left - w / 2;
    const top = pos.top - h - 12;
    return applyFloatingToolbarPos(root, { left, top }, pad);
  }

  function clampManualPosition(save = false) {
    if (root.hidden || !manualPosition) return;
    const clamped = applyFixedPosition(readFloatingToolbarPos(root));
    if (save) saveEditToolbarPos(clamped);
  }

  function syncFromDrawing() {
    const drawing = controller.getSelectedDrawing();
    if (!drawing) return;
    const color = drawing.color ?? "#2962FF";
    const textColor = drawing.textColor ?? color;
    const colorOpacity = drawing.colorOpacity ?? 100;
    const textOpacity = drawing.textColorOpacity ?? 100;
    const width = drawing.lineWidth ?? 2;
    const channelBackground = isChannelBackgroundTool(drawing.type);
    const regressionTrend = isRegressionTrendTool(drawing.type);
    if (templatesBtn instanceof HTMLElement) {
      templatesBtn.hidden = regressionTrend;
      templatesBtn.classList.toggle("has-template", hasLayoutScopedToolDefault(drawing.type));
    }
    if (lineColorBtn instanceof HTMLElement) lineColorBtn.hidden = regressionTrend;
    if (backgroundColorBtn instanceof HTMLElement) backgroundColorBtn.hidden = !channelBackground;
    if (textColorBtn instanceof HTMLElement) textColorBtn.hidden = regressionTrend;
    if (styleBtn instanceof HTMLElement) styleBtn.hidden = regressionTrend;
    if (widthBtn instanceof HTMLElement) widthBtn.hidden = false;
    if (colorSwatch instanceof HTMLElement) {
      colorSwatch.style.backgroundColor = applyColorOpacity(color, colorOpacity);
    }
    if (channelBackground && backgroundSwatch instanceof HTMLElement) {
      const bgColor = drawing.channelBackgroundColor ?? drawing.color ?? "#2962FF";
      const bgOpacity = drawing.channelBackgroundOpacity ?? 20;
      backgroundSwatch.style.backgroundColor = applyColorOpacity(bgColor, bgOpacity);
    }
    if (textSwatch instanceof HTMLElement) {
      textSwatch.style.backgroundColor = applyColorOpacity(textColor, textOpacity);
    }
    if (widthLabel) widthLabel.textContent = `${width}px`;
    if (lockBtn instanceof HTMLButtonElement) {
      const locked = Boolean(drawing.locked);
      lockBtn.setAttribute("aria-pressed", locked ? "true" : "false");
      lockBtn.classList.toggle("is-pressed", locked);
      lockBtn.setAttribute("aria-label", locked ? "Unlock" : "Lock");
      lockBtn.innerHTML = locked ? ICONS.lock : ICONS.unlock;
    }
  }

  function repositionToDrawing() {
    if (manualPosition || root.hidden || controller.isDraggingDrawing()) return;
    const drawing = controller.getSelectedDrawing();
    if (!drawing) return;
    const anchor = controller.getDrawingScreenAnchor(drawing);
    if (anchor) applyPosition(anchor);
  }

  function ensureSavedPosition() {
    const saved = loadEditToolbarPos();
    if (!saved) return false;
    const size = { width: root.offsetWidth || 320, height: root.offsetHeight || 40 };
    if (!isFloatingToolbarPosInViewport(saved, size)) {
      manualPosition = false;
      return false;
    }
    manualPosition = true;
    const clamped = applyFixedPosition(saved);
    saveEditToolbarPos(clamped);
    return true;
  }

  function show() {
    if (controller.isDraggingDrawing()) return;
    root.hidden = false;
    syncFromDrawing();
    if (manualPosition) clampManualPosition(true);
    else repositionToDrawing();
  }

  function hide() {
    root.hidden = true;
    colorPicker.close();
    tvMenu.close();
    hideToolbarHint();
  }

  function syncVisibility() {
    if (controller.isDraggingDrawing()) {
      hide();
      return;
    }
    if (controller.getSelectedDrawing()) show();
    else hide();
  }

  function openLineColorPicker(anchor) {
    const drawing = controller.getSelectedDrawing();
    if (!drawing) return;
    colorPicker.openSwatch(
      anchor,
      { color: drawing.color ?? "#2962FF", opacity: drawing.colorOpacity ?? 100 },
      {
        onChange: (value) => {
          controller.updateDrawing(drawing.id, {
            color: value.color,
            colorOpacity: value.opacity,
          });
          syncFromDrawing();
        },
      },
    );
  }

  function openBackgroundColorPicker(anchor) {
    const drawing = controller.getSelectedDrawing();
    if (!drawing || !isChannelBackgroundTool(drawing.type)) return;
    colorPicker.openSwatch(
      anchor,
      {
        color: drawing.channelBackgroundColor ?? drawing.color ?? "#2962FF",
        opacity: drawing.channelBackgroundOpacity ?? 20,
      },
      {
        onChange: (value) => {
          controller.updateDrawing(drawing.id, {
            channelBackgroundColor: value.color,
            channelBackgroundOpacity: value.opacity,
            showChannelBackground: true,
          });
          syncFromDrawing();
        },
      },
    );
  }

  function openTextColorPicker(anchor) {
    const drawing = controller.getSelectedDrawing();
    if (!drawing) return;
    colorPicker.openSwatch(
      anchor,
      {
        color: drawing.textColor ?? drawing.color ?? "#2962FF",
        opacity: drawing.textColorOpacity ?? 100,
      },
      {
        onChange: (value) => {
          controller.updateDrawing(drawing.id, {
            textColor: value.color,
            textColorOpacity: value.opacity,
          });
          syncFromDrawing();
        },
      },
    );
  }

  function openWidthMenu(anchor) {
    const drawing = controller.getSelectedDrawing();
    if (!drawing) return;
    tvMenu.open(anchor, LINE_WIDTH_MENU_ITEMS, {
      activeId: String(drawing.lineWidth ?? 2),
      onSelect: (id) => {
        const patch = { lineWidth: Number(id) };
        if (isRegressionTrendTool(drawing.type)) {
          patch.regressionBaseWidth = Number(id);
          patch.regressionUpWidth = Number(id);
          patch.regressionDownWidth = Number(id);
        }
        controller.updateDrawing(drawing.id, patch);
        syncFromDrawing();
      },
    });
  }

  function openStyleMenu(anchor) {
    const drawing = controller.getSelectedDrawing();
    if (!drawing) return;
    tvMenu.open(anchor, LINE_STYLE_MENU_ITEMS, {
      activeId: String(drawing.lineStyle ?? 0),
      onSelect: (id) => {
        controller.updateDrawing(drawing.id, { lineStyle: Number(id) });
        syncFromDrawing();
      },
    });
  }

  function openTemplatesMenu(anchor) {
    const drawing = controller.getSelectedDrawing();
    if (!drawing) return;
    const toolType = drawing.type;
    const hasTemplate = hasLayoutScopedToolDefault(toolType);
    tvMenu.open(
      anchor,
      [
        { id: "save", label: "Save as template" },
        { id: "apply", label: "Apply template" },
        { id: "reset", label: "Reset template" },
      ],
      {
        onSelect: (id) => {
          if (id === "save") {
            saveLayoutScopedToolDefault(toolType, extractToolDefaults(drawing));
            syncFromDrawing();
            return;
          }
          if (id === "apply") {
            if (!hasTemplate) return;
            controller.updateDrawing(drawing.id, loadLayoutScopedToolDefaults(toolType));
            syncFromDrawing();
            return;
          }
          if (id === "reset") {
            clearLayoutScopedToolDefault(toolType);
            syncFromDrawing();
          }
        },
      },
    );
  }

  widgets.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-name]");
    if (!(btn instanceof HTMLElement)) return;
    const name = btn.dataset.name;
    const drawing = controller.getSelectedDrawing();
    if (!drawing) return;

    ev.preventDefault();
    ev.stopPropagation();

    if (name === "templates") {
      openTemplatesMenu(btn);
      return;
    }
    if (name === "line-tool-color") {
      openLineColorPicker(btn);
      return;
    }
    if (name === "background-color") {
      openBackgroundColorPicker(btn);
      return;
    }
    if (name === "text-color") {
      openTextColorPicker(btn);
      return;
    }
    if (name === "line-tool-width") {
      openWidthMenu(btn);
      return;
    }
    if (name === "style" && !isRegressionTrendTool(drawing.type)) {
      openStyleMenu(btn);
      return;
    }
    if (name === "settings") {
      settingsDialog.open(drawing);
      return;
    }
    if (name === "lock") {
      controller.updateDrawing(drawing.id, { locked: !drawing.locked });
      syncFromDrawing();
      return;
    }
    if (name === "remove") {
      controller.removeDrawingById(drawing.id);
      return;
    }
  });

  dragHandle.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    dragging = true;
    manualPosition = true;
    root.classList.add("is-dragging");
    startX = ev.clientX;
    startY = ev.clientY;
    const rect = root.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    dragHandle.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });

  const endDrag = (ev) => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("is-dragging");
    if (ev?.pointerId != null) dragHandle.releasePointerCapture(ev.pointerId);
    clampManualPosition(true);
  };

  dragHandle.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    applyFixedPosition({
      left: originLeft + ev.clientX - startX,
      top: originTop + ev.clientY - startY,
    });
  });
  dragHandle.addEventListener("pointerup", endDrag);
  dragHandle.addEventListener("pointercancel", endDrag);

  controller.on("selectionChange", syncVisibility);
  controller.on("dragChange", syncVisibility);
  controller.on("editText", (drawing) => {
    settingsDialog.open(drawing);
  });
  controller.on("change", () => {
    syncFromDrawing();
    repositionToDrawing();
  });

  ensureSavedPosition();

  wireToolbarHints(root, "[data-name]", (el) => {
    const name = el.dataset.name;
    if (name === "lock") {
      return controller.getSelectedDrawing()?.locked ? "Unlock" : "Lock";
    }
    return EDIT_TOOL_HINTS[name] ?? el.getAttribute("aria-label");
  });

  const onRange = () => repositionToDrawing();
  /** @type {import("lightweight-charts").IChartApi | null} */
  let rangeChart = null;

  function bindRangeChart() {
    const next = resolveChart();
    if (next === rangeChart) return;
    if (rangeChart) rangeChart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
    rangeChart = next;
    rangeChart?.timeScale().subscribeVisibleLogicalRangeChange(onRange);
  }

  bindRangeChart();
  controller.on("toolChange", bindRangeChart);

  const unbindViewportGuard = bindFloatingToolbarViewportGuard(root, {
    onGuard: () => {
      if (manualPosition) clampManualPosition(true);
      else repositionToDrawing();
    },
  });

  syncVisibility();

  return {
    root,
    syncVisibility,
    refreshSettingsContext: () => settingsDialog.refreshContext(),
    destroy() {
      unbindViewportGuard();
      rangeChart?.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      settingsDialog.destroy();
      root.remove();
    },
  };
}

export const mountDrawingEditToolbar = mountEditToolbar;
