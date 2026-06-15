import { LINE_END_ARROW_ICON, LINE_END_NORMAL_ICON } from "../../tools/line/trendStyle.js";
import { isRegressionTrendTool } from "../../tools/regression/trend.js";
import { isPositionTool } from "../../tools/position/barrel.js";
import { isForecastTool } from "../../tools/forecast/index.js";
import { isMeasureTool } from "../../tools/measure/index.js";
import { supportsAnnotationStyleSettings } from "../../tools/annotation/style.js";
import { shapeHidesCoordsTab, shapeHidesTextTab } from "../../tools/shape/index.js";

export const MENU_CHEVRON = `<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3.92 7.83 9 12.29l5.08-4.46-1-1.13L9 10.29l-4.09-3.6-.99 1.14Z"/></svg>`;
export const CHECK_SVG = `<svg viewBox="0 0 18 18" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M7.5 12.5 3.5 8.5l1-1 3 3 7-7 1 1z"></path></svg>`;

export const VISIBILITY_KEYS = ["ticks", "seconds", "minutes", "hours", "days", "weeks", "months", "ranges"];

/** @param {HTMLElement} btn @param {boolean} on */
export function setTvCheck(btn, on) {
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.classList.toggle("tv-set__check--on", on);
  btn.setAttribute("aria-checked", on ? "true" : "false");
  const box = btn.querySelector(".tv-set__check-box");
  if (box instanceof HTMLElement) box.innerHTML = on ? CHECK_SVG : "";
}

/** @param {HTMLElement} dialogEl @param {HTMLElement} handleEl */
export function mountDialogDrag(dialogEl, handleEl) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  /** @param {MouseEvent} ev */
  function onMouseMove(ev) {
    if (!dragging) return;
    const x = originX + (ev.clientX - startX);
    const y = originY + (ev.clientY - startY);
    const maxX = Math.max(8, window.innerWidth - dialogEl.offsetWidth - 8);
    const maxY = Math.max(8, window.innerHeight - dialogEl.offsetHeight - 8);
    dialogEl.style.left = `${Math.min(maxX, Math.max(8, x))}px`;
    dialogEl.style.top = `${Math.min(maxY, Math.max(8, y))}px`;
  }

  function onMouseUp() {
    dragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  handleEl.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) return;
    const target = ev.target;
    if (target instanceof Element && target.closest("button, input, select, textarea, label")) return;
    dragging = true;
    const rect = dialogEl.getBoundingClientRect();
    startX = ev.clientX;
    startY = ev.clientY;
    originX = rect.left;
    originY = rect.top;
    dialogEl.style.position = "fixed";
    dialogEl.style.margin = "0";
    dialogEl.style.left = `${originX}px`;
    dialogEl.style.top = `${originY}px`;
    dialogEl.style.transform = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    ev.preventDefault();
  });
}

/** @param {HTMLElement} dialogEl */
export function centerDialogIfNeeded(dialogEl) {
  const pad = 16;
  if (!dialogEl.style.left) {
    dialogEl.style.position = "fixed";
    dialogEl.style.margin = "0";
    const w = dialogEl.offsetWidth || 380;
    const h = dialogEl.offsetHeight || 420;
    dialogEl.style.left = `${Math.max(pad, (window.innerWidth - w) / 2)}px`;
    dialogEl.style.top = `${Math.max(pad, (window.innerHeight - h) / 2)}px`;
  }

  const rect = dialogEl.getBoundingClientRect();
  const maxLeft = Math.max(pad, window.innerWidth - rect.width - pad);
  const maxTop = Math.max(pad, window.innerHeight - rect.height - pad);
  const left = Math.min(maxLeft, Math.max(pad, rect.left));
  const top = Math.min(maxTop, Math.max(pad, rect.top));
  dialogEl.style.left = `${left}px`;
  dialogEl.style.top = `${top}px`;
  dialogEl.style.transform = "none";
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function defaultVisibility(drawing) {
  return drawing.visibility ?? Object.fromEntries(VISIBILITY_KEYS.map((k) => [k, true]));
}

/**
 * @param {HTMLElement} root
 * @param {string} drawingType
 */
export function syncDrawingSettingsTabs(root, drawingType) {
  const isRegression = isRegressionTrendTool(drawingType);
  const isPosition = isPositionTool(drawingType);
  const isForecast = isForecastTool(drawingType);
  const isMeasure = isMeasureTool(drawingType);
  const isAnnotation = supportsAnnotationStyleSettings(drawingType);
  const hideShapeText = shapeHidesTextTab(drawingType);
  const hideShapeCoords = shapeHidesCoordsTab(drawingType);
  const tabs = {
    inputs: root.querySelector('[data-tab="inputs"]'),
    style: root.querySelector('[data-tab="style"]'),
    text: root.querySelector('[data-tab="text"]'),
    coordinates: root.querySelector('[data-tab="coordinates"]'),
    visibility: root.querySelector('[data-tab="visibility"]'),
  };
  if (tabs.inputs instanceof HTMLElement) tabs.inputs.hidden = !isRegression && !isPosition;
  if (tabs.text instanceof HTMLElement) {
    tabs.text.hidden =
      isRegression || isPosition || isForecast || isMeasure || isAnnotation || hideShapeText;
  }
  if (tabs.coordinates instanceof HTMLElement) {
    tabs.coordinates.hidden = isPosition || isAnnotation || hideShapeCoords;
  }
  if (tabs.style instanceof HTMLElement) tabs.style.hidden = false;
  if (tabs.visibility instanceof HTMLElement) tabs.visibility.hidden = false;
}

/**
 * @param {HTMLElement} root
 * @param {string} tab
 * @param {string} drawingType
 */
export function resolveSettingsTab(root, tab, drawingType) {
  const btn = root.querySelector(`[data-tab="${tab}"]`);
  if (btn instanceof HTMLElement && !btn.hidden) return tab;
  if (isRegressionTrendTool(drawingType) || isPositionTool(drawingType)) return "inputs";
  return "style";
}

/** @param {string} drawingType @param {Record<string, unknown>} drawing */
export function resolveDrawingExtendFlags(drawingType, drawing) {
  if (drawingType === "extended-line") {
    return {
      extendLeft: drawing.extendLeft !== false,
      extendRight: drawing.extendRight !== false,
    };
  }
  if (drawingType === "ray") {
    return {
      extendLeft: Boolean(drawing.extendLeft),
      extendRight: drawing.extendRight !== false,
    };
  }
  if (drawingType === "info-line") {
    const legacy =
      !drawing.statsFields && drawing.extendLeft === false && drawing.extendRight === false;
    if (legacy) {
      return { extendLeft: true, extendRight: true };
    }
    return {
      extendLeft: Boolean(drawing.extendLeft),
      extendRight: Boolean(drawing.extendRight),
    };
  }
  return {
    extendLeft: Boolean(drawing.extendLeft),
    extendRight: Boolean(drawing.extendRight),
  };
}

/** @param {string} endId @param {boolean} [flip] */
export function lineEndIconHtml(endId, flip = false) {
  const icon = endId === "arrow" ? LINE_END_ARROW_ICON : LINE_END_NORMAL_ICON;
  return flip ? icon.replace("<svg ", '<svg class="tv-drawing-settings__line-end-flip" ') : icon;
}
