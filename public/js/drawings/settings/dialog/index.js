import { createColorPicker, applyColorOpacity } from "../../../ui/color/picker.js";
import { createTvMenu, TEXT_ALIGN_V_ITEMS, TEXT_ALIGN_H_ITEMS } from "../menu/tv.js";
import { resolveTrendAngleDeg } from "../../tools/line/trendAngle.js";
import {
  axisLineShowsPriceLabelOption,
  axisLineShowsTimeLabelOption,
  supportsAxisLineStyleSettings,
} from "../../tools/axis/lines.js";
import {
  isParallelChannelTool,
  normalizeChannelLevels,
  resolvePriceOffset,
} from "../../tools/channel/parallel.js";
import { supportsChannelLineStyleSettings } from "../../tools/channel/family.js";
import { isRegressionTrendTool } from "../../tools/regression/trend.js";
import { isFibRetracementTool } from "../../tools/fib/retracement.js";
import { isGannTool } from "../../tools/gann/index.js";
import { isPatternTool } from "../../tools/pattern/index.js";
import { isCycleTool } from "../../tools/cycle/index.js";
import { resolveStatsFields, supportsTrendLineStyleSettings } from "../../tools/line/trendStyle.js";
import { TOOL_LABELS } from "../../catalog/tools.js";
import {
  readRegressionTrendDraftFromUi,
  regressionTrendDraftFromDrawing,
  syncRegressionTrendDialogUi,
  wireRegressionTrendSettings,
} from "../sections/regressionTrend.js";
import {
  fibRetracementDraftFromDrawing,
  readFibRetracementDraftFromUi,
  syncFibRetracementDialogUi,
  syncFibTextTabUi,
  wireFibRetracementSettings,
} from "../sections/fibRetracement.js";
import {
  gannDraftFromDrawing,
  readGannDraftFromUi,
  syncGannDialogUi,
  wireGannSettings,
} from "../sections/gann.js";
import {
  patternDraftFromDrawing,
  readPatternDraftFromUi,
  syncPatternDialogUi,
  wirePatternSettings,
} from "../sections/pattern.js";
import {
  cycleDraftFromDrawing,
  readCycleDraftFromUi,
  syncCycleDialogUi,
  wireCycleSettings,
} from "../sections/cycle.js";
import { isDisjointChannelTool } from "../../tools/channel/disjoint.js";
import { drawingSettingsDialogHtml } from "./markup.js";
import {
  CHECK_SVG,
  VISIBILITY_KEYS,
  centerDialogIfNeeded,
  defaultVisibility,
  mountDialogDrag,
  resolveDrawingExtendFlags,
  resolveSettingsTab,
  setTvCheck,
  syncDrawingSettingsTabs,
  syncLineStylePreview,
} from "./utils.js";
import { buildCoordsPanel, pointsFromDrawing, readCoordsFromUi } from "./coords/panel.js";
import {
  syncParallelChannelUi,
  wireParallelChannelSettings,
} from "../sections/parallelChannel.js";
import {
  syncChannelBackgroundUi,
  syncChannelLineStyleUi,
  wireChannelStyleSettings,
} from "../sections/channelStyle.js";
import {
  syncAxisLineUi,
  syncExtendUi,
  syncTrendLineUi,
  wireTrendLineStyleSettings,
} from "../sections/trendLineStyle.js";
import {
  readPositionDraftFromUi,
  positionDraftFromDrawing,
  syncPositionDialogUi,
  syncPositionInputsUi,
  wirePositionSettings,
} from "../sections/position.js";
import { isPositionTool, resolvePositionStatsFields } from "../../tools/position/barrel.js";
import { isMeasureTool } from "../../tools/measure/index.js";
import { isForecastTool } from "../../tools/forecast/index.js";
import {
  forecastDraftFromDrawing,
  readForecastDraftFromUi,
  syncForecastDialogUi,
  wireForecastSettings,
} from "../sections/forecast.js";
import {
  measureDraftFromDrawing,
  readMeasureDraftFromUi,
  syncMeasureDialogUi,
  wireMeasureSettings,
} from "../sections/measure.js";
import {
  annotationDraftFromDrawing,
  readAnnotationDraftFromUi,
  syncAnnotationDialogUi,
  wireAnnotationSettings,
} from "../sections/annotation.js";
import {
  shapeDraftFromDrawing,
  readShapeDraftFromUi,
  syncShapeDialogUi,
  wireShapeSettings,
} from "../sections/shape.js";
import {
  isArrowMarkerTool,
  isBrushTool,
  isDirectionArrowMarkTool,
  isHighlighterTool,
  supportsAnnotationStyleSettings,
} from "../../tools/annotation/style.js";
import { supportsShapeStyleSettings } from "../../tools/shape/index.js";

/**
 * @param {object} opts
 * @param {ReturnType<typeof import("../../controller/index.js").createDrawingController>} opts.controller
 * @param {() => { bars: { time: number }[], barSec?: number, precision?: number }} opts.getContext
 */
export function createDrawingSettingsDialog(opts) {
  const { controller, getContext } = opts;
  const colorPicker = createColorPicker();
  const tvMenu = createTvMenu();

  const root = document.createElement("div");
  root.className = "tv-drawing-settings";
  root.hidden = true;
  root.innerHTML = drawingSettingsDialogHtml();
  document.body.appendChild(root);

  const dialog = root.querySelector(".tv-drawing-settings__dialog");
  const titleEl = root.querySelector("[data-dialog-title]");
  const tabUnderline = root.querySelector("[data-tab-underline]");
  const styleSwatch = root.querySelector("[data-style-swatch]");
  const styleLine = root.querySelector("[data-style-line]");
  const styleLineBtn = root.querySelector("[data-style-line-btn]");
  const textSwatch = root.querySelector("[data-text-swatch]");
  const textInput = root.querySelector("[data-text-input]");
  const coordsPanel = root.querySelector("[data-coords-panel]");
  const visibilityList = root.querySelector("[data-visibility-list]");
  const fontSizeEl = root.querySelector("[data-font-size]");
  const alignVBtn = root.querySelector("[data-align-v-btn]");
  const alignHBtn = root.querySelector("[data-align-h-btn]");
  const alignVLabel = root.querySelector("[data-align-v-label]");
  const alignHLabel = root.querySelector("[data-align-h-label]");

  if (
    !dialog ||
    !titleEl ||
    !tabUnderline ||
    !styleSwatch ||
    !styleLine ||
    !textSwatch ||
    !textInput ||
    !coordsPanel ||
    !visibilityList
  ) {
    throw new Error("Drawing settings dialog mount failed");
  }

  const dragHandle = root.querySelector("[data-drag-handle]");
  if (dragHandle instanceof HTMLElement) {
    mountDialogDrag(dialog, dragHandle);
  }

  visibilityList.innerHTML = VISIBILITY_KEYS.map(
    (key) => `<div class="tv-set__check-row" data-vis-row="${key}">
      <button type="button" class="tv-set__check tv-set__check--on" data-vis-btn="${key}" role="checkbox" aria-checked="true" aria-label="${key}">
        <span class="tv-set__check-box">${CHECK_SVG}</span>
      </button>
      <span class="tv-set__check-label">${key.charAt(0).toUpperCase() + key.slice(1)}</span>
    </div>`,
  ).join("");

  /** @type {string | null} */
  let drawingId = null;
  /** @type {Record<string, unknown>} */
  let draft = {};
  let activeTab = "style";

  const wireCtx = {
    getDraft: () => draft,
    patchDrawing,
    colorPicker,
    tvMenu,
    syncColorUi,
    syncUi: () => {
      syncGannDialogUi(root, draft);
      syncFibRetracementDialogUi(root, draft);
      syncPatternDialogUi(root, draft);
      syncCycleDialogUi(root, draft);
      syncColorUi();
    },
  };

  function setTab(tab) {
    const drawingType = String(draft.drawingType ?? "");
    syncDrawingSettingsTabs(root, drawingType);
    activeTab = resolveSettingsTab(root, tab, drawingType);
    root.querySelectorAll("[data-tab]").forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      const on = btn.dataset.tab === activeTab;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    root.querySelectorAll("[data-panel]").forEach((panel) => {
      if (!(panel instanceof HTMLElement)) return;
      panel.hidden = panel.dataset.panel !== activeTab;
    });
    const activeBtn = root.querySelector(`[data-tab="${activeTab}"]`);
    if (activeBtn instanceof HTMLElement) {
      const tabsRect = activeBtn.parentElement?.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      if (tabsRect) {
        tabUnderline.style.width = `${btnRect.width}px`;
        tabUnderline.style.transform = `translateX(${btnRect.left - tabsRect.left}px)`;
      }
    }
    requestAnimationFrame(() => centerDialogIfNeeded(dialog));
  }

  function syncAlignLabels() {
    const isFib = isFibRetracementTool(String(draft.drawingType ?? ""));
    const vId = isFib ? String(draft.fibLabelAlignV ?? "middle") : String(draft.textAlignV ?? "top");
    const hId = isFib ? String(draft.fibLabelAlignH ?? "left") : String(draft.textAlignH ?? "center");
    const v = TEXT_ALIGN_V_ITEMS.find((i) => i.id === vId) ?? TEXT_ALIGN_V_ITEMS[0];
    const h = TEXT_ALIGN_H_ITEMS.find((i) => i.id === hId) ?? TEXT_ALIGN_H_ITEMS[1];
    if (alignVLabel) alignVLabel.textContent = v.label;
    if (alignHLabel) alignHLabel.textContent = h.label;
  }

  function patchDrawing(patch) {
    if (!drawingId) return;
    Object.assign(draft, patch);
    controller.updateDrawing(drawingId, patch);
  }

  function syncLineRowControls() {
    const type = String(draft.drawingType ?? "");
    const colorOnly =
      isDirectionArrowMarkTool(type) ||
      isArrowMarkerTool(type) ||
      isBrushTool(type) ||
      isHighlighterTool(type);
    if (styleLineBtn instanceof HTMLElement) styleLineBtn.hidden = colorOnly;
  }

  function syncColorUi() {
    const color = draft.color ?? "#2962FF";
    const opacity = draft.colorOpacity ?? 100;
    const textColor = draft.textColor ?? color;
    const textOpacity = draft.textColorOpacity ?? 100;
    const width = draft.lineWidth ?? 2;
    const style = Number(draft.lineStyle ?? 0);
    if (styleSwatch instanceof HTMLElement) {
      styleSwatch.style.backgroundColor = applyColorOpacity(color, opacity);
    }
    const variant = isHighlighterTool(String(draft.drawingType ?? "")) ? "highlighter" : "default";
    syncLineStylePreview(styleLine, { color, opacity, width, style, variant });
    if (textSwatch instanceof HTMLElement) {
      textSwatch.style.backgroundColor = applyColorOpacity(textColor, textOpacity);
    }
    syncLineRowControls();
  }

  function syncAllUi() {
    syncDrawingSettingsTabs(root, String(draft.drawingType ?? ""));
    buildCoordsPanel(coordsPanel, draft.drawingType, draft.points, draft.angle, draft.priceOffset, getContext);
    syncAlignLabels();
    syncExtendUi(root, draft);
    syncTrendLineUi(root, draft);
    syncAxisLineUi(root, draft);
    syncParallelChannelUi(root, draft);
    syncChannelBackgroundUi(root, draft);
    syncChannelLineStyleUi(root, draft);
    syncFibRetracementDialogUi(root, draft);
    syncFibTextTabUi(root, draft);
    syncGannDialogUi(root, draft);
    syncPatternDialogUi(root, draft);
    syncCycleDialogUi(root, draft);
    syncRegressionTrendDialogUi(root, draft);
    syncPositionDialogUi(root, draft);
    syncForecastDialogUi(root, draft);
    syncMeasureDialogUi(root, draft);
    syncAnnotationDialogUi(root, draft);
    syncShapeDialogUi(root, draft);
    syncColorUi();
    activeTab = resolveSettingsTab(root, activeTab, String(draft.drawingType ?? ""));
  }

  function readDraftFromUi() {
    const coords = readCoordsFromUi(coordsPanel, visibilityList, draft, getContext);
    const drawingType = String(draft.drawingType ?? "");
    const channelLine = supportsChannelLineStyleSettings(drawingType);
    const channelPricesFontSize = root.querySelector("[data-channel-prices-font-size]");
    const middlePointBtn = root.querySelector("[data-middle-point-btn]");
    const priceLabelsBtn = root.querySelector("[data-price-labels-btn]");
    const channelPricesBtn = root.querySelector("[data-channel-prices-btn]");
    const axisPriceLabelBtn = root.querySelector("[data-axis-price-label-btn]");
    const axisTimeLabelBtn = root.querySelector("[data-axis-time-label-btn]");
    const alwaysShowStatsBtn = root.querySelector("[data-always-show-stats-btn]");

    const extend = resolveDrawingExtendFlags(drawingType, draft);
    const isTrend = supportsTrendLineStyleSettings(drawingType);
    const isAxis = supportsAxisLineStyleSettings(drawingType);

    let showPriceLabels = draft.showPriceLabels;
    if (isTrend) {
      showPriceLabels = priceLabelsBtn?.classList.contains("tv-set__check--on") ?? draft.showPriceLabels;
    } else if (channelLine) {
      showPriceLabels = channelPricesBtn?.classList.contains("tv-set__check--on") ?? draft.showPriceLabels;
    } else if (isAxis) {
      showPriceLabels = axisPriceLabelBtn?.classList.contains("tv-set__check--on") ?? draft.showPriceLabels;
    }

    let showTimeLabel = draft.showTimeLabel;
    if (isAxis) {
      showTimeLabel = axisTimeLabelBtn?.classList.contains("tv-set__check--on") ?? draft.showTimeLabel;
    }

    const positionPatch = readPositionDraftFromUi(root, draft, getContext().precision ?? 2);

    return {
      ...draft,
      ...coords,
      ...readRegressionTrendDraftFromUi(root, draft),
      ...readFibRetracementDraftFromUi(root, draft),
      ...readGannDraftFromUi(root, draft),
      ...readPatternDraftFromUi(root, draft),
      ...readCycleDraftFromUi(root, draft),
      ...positionPatch,
      ...readForecastDraftFromUi(root, draft),
      ...readMeasureDraftFromUi(root, draft),
      ...readAnnotationDraftFromUi(root, draft),
      ...readShapeDraftFromUi(root, draft),
      label: textInput instanceof HTMLTextAreaElement ? textInput.value : draft.label,
      fontSize:
        channelLine && channelPricesFontSize instanceof HTMLSelectElement
          ? Number(channelPricesFontSize.value) || 12
          : fontSizeEl instanceof HTMLSelectElement
            ? Number(fontSizeEl.value)
            : draft.fontSize,
      ...(isFibRetracementTool(drawingType)
        ? {
            fibLabelAlignH: draft.fibLabelAlignH ?? "left",
            fibLabelAlignV: draft.fibLabelAlignV ?? "middle",
          }
        : {
            textAlignV: draft.textAlignV,
            textAlignH: draft.textAlignH,
          }),
      extendLeft: extend.extendLeft,
      extendRight: extend.extendRight,
      showMiddlePoint: middlePointBtn?.classList.contains("tv-set__check--on") ?? draft.showMiddlePoint,
      showPriceLabels,
      showTimeLabel,
      ...(isPositionTool(drawingType)
        ? {}
        : {
            alwaysShowStats:
              alwaysShowStatsBtn?.classList.contains("tv-set__check--on") ?? draft.alwaysShowStats,
          }),
    };
  }

  function openForDrawing(drawing) {
    drawingId = drawing.id;
    const extend = resolveDrawingExtendFlags(drawing.type, drawing);
    draft = {
      drawingType: drawing.type,
      color: drawing.color,
      colorOpacity: drawing.colorOpacity ?? 100,
      textColor: drawing.textColor,
      textColorOpacity: drawing.textColorOpacity ?? 100,
      lineWidth: drawing.lineWidth,
      lineStyle: drawing.lineStyle,
      points: pointsFromDrawing(drawing, getContext),
      angle: resolveTrendAngleDeg(drawing),
      label: drawing.label ?? "",
      fontSize:
        drawing.fontSize ??
        (isFibRetracementTool(drawing.type)
          ? 12
          : isGannTool(drawing.type)
            ? 12
            : isPatternTool(drawing.type)
              ? 12
              : isCycleTool(drawing.type)
                ? 12
                : supportsChannelLineStyleSettings(drawing.type)
              ? 12
              : 14),
      textAlignV: drawing.textAlignV ?? "top",
      textAlignH: drawing.textAlignH ?? "center",
      extendLeft: extend.extendLeft,
      extendRight: extend.extendRight,
      leftEnd: drawing.leftEnd ?? "normal",
      rightEnd: drawing.rightEnd ?? "normal",
      showMiddlePoint: Boolean(drawing.showMiddlePoint),
      showPriceLabels:
        drawing.showPriceLabels ??
        (supportsAxisLineStyleSettings(drawing.type) && axisLineShowsPriceLabelOption(drawing.type)),
      showTimeLabel:
        drawing.showTimeLabel ??
        (supportsAxisLineStyleSettings(drawing.type) && axisLineShowsTimeLabelOption(drawing.type)),
      statsFields: isPositionTool(drawing.type)
        ? resolvePositionStatsFields(drawing)
        : resolveStatsFields(drawing),
      statsPosition: drawing.statsPosition ?? "auto",
      alwaysShowStats: Boolean(drawing.alwaysShowStats),
      channelLevels: normalizeChannelLevels(drawing.channelLevels),
      showChannelBackground: drawing.showChannelBackground ?? true,
      channelBackgroundColor:
        drawing.channelBackgroundColor ??
        drawing.color ??
        (supportsChannelLineStyleSettings(drawing.type) ? "#ff9800" : "#2962FF"),
      channelBackgroundOpacity: drawing.channelBackgroundOpacity ?? 20,
      priceOffset: resolvePriceOffset(drawing),
      visibility: defaultVisibility(drawing),
      ...regressionTrendDraftFromDrawing(drawing),
      ...fibRetracementDraftFromDrawing(drawing),
      ...gannDraftFromDrawing(drawing),
      ...patternDraftFromDrawing(drawing),
      ...(isCycleTool(drawing.type) ? cycleDraftFromDrawing(drawing) : {}),
      ...(isPositionTool(drawing.type)
        ? positionDraftFromDrawing(drawing, getContext().precision ?? 2)
        : {}),
      ...(isForecastTool(drawing.type) ? forecastDraftFromDrawing(drawing) : {}),
      ...(isMeasureTool(drawing.type) ? measureDraftFromDrawing(drawing) : {}),
      ...(supportsAnnotationStyleSettings(drawing.type) ? annotationDraftFromDrawing(drawing) : {}),
      ...(supportsShapeStyleSettings(drawing.type) ? shapeDraftFromDrawing(drawing) : {}),
    };
    titleEl.textContent = TOOL_LABELS[drawing.type] ?? drawing.type;
    activeTab =
      isRegressionTrendTool(drawing.type) || isPositionTool(drawing.type) ? "inputs" : "style";
    if (textInput instanceof HTMLTextAreaElement) textInput.value = String(draft.label ?? "");
    if (fontSizeEl instanceof HTMLSelectElement) fontSizeEl.value = String(draft.fontSize ?? 14);
    visibilityList.querySelectorAll("[data-vis-btn]").forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      const key = btn.dataset.visBtn;
      if (key) setTvCheck(btn, Boolean(draft.visibility?.[key]));
    });
    syncAllUi();
    setTab(activeTab);
    root.hidden = false;
    requestAnimationFrame(() => centerDialogIfNeeded(dialog));
  }

  function close() {
    root.hidden = true;
    drawingId = null;
    draft = {};
    colorPicker.close();
    tvMenu.close();
    dialog.style.left = "";
    dialog.style.top = "";
    dialog.style.transform = "";
  }

  function submit() {
    if (!drawingId) return;
    controller.updateDrawing(drawingId, readDraftFromUi());
    close();
  }

  function refreshContext() {
    if (root.hidden || !drawingId) return;
    const drawing = controller.getDrawings().find((d) => d.id === drawingId);
    if (!drawing) return;
    draft.points = pointsFromDrawing(drawing, getContext);
    draft.angle = resolveTrendAngleDeg(drawing);
    if (isParallelChannelTool(drawing.type)) {
      draft.priceOffset = resolvePriceOffset(drawing);
      draft.channelLevels = normalizeChannelLevels(drawing.channelLevels);
    }
    if (isFibRetracementTool(drawing.type)) {
      Object.assign(draft, fibRetracementDraftFromDrawing(drawing));
    }
    if (isGannTool(drawing.type)) {
      Object.assign(draft, gannDraftFromDrawing(drawing));
    }
    if (isPatternTool(drawing.type)) {
      Object.assign(draft, patternDraftFromDrawing(drawing));
    }
    if (isCycleTool(drawing.type)) {
      Object.assign(draft, cycleDraftFromDrawing(drawing));
    }
    if (isPositionTool(drawing.type)) {
      Object.assign(draft, positionDraftFromDrawing(drawing, getContext().precision ?? 2));
      draft.alwaysShowStats = Boolean(drawing.alwaysShowStats);
      draft.showPriceLabels = drawing.showPriceLabels !== false;
      syncPositionDialogUi(root, draft);
    }
    syncFibTextTabUi(root, draft);
    if (isDisjointChannelTool(drawing.type)) {
      draft.points = pointsFromDrawing(drawing, getContext);
    }
    buildCoordsPanel(coordsPanel, draft.drawingType, draft.points, draft.angle, draft.priceOffset, getContext);
    syncFibRetracementDialogUi(root, draft);
    syncGannDialogUi(root, draft);
    syncPatternDialogUi(root, draft);
    syncCycleDialogUi(root, draft);
  }

  root.querySelector("[data-backdrop]")?.addEventListener("click", close);
  root.querySelector("[data-close]")?.addEventListener("click", close);
  root.querySelector("[data-cancel]")?.addEventListener("click", close);
  root.querySelector("[data-submit]")?.addEventListener("click", submit);

  root.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn instanceof HTMLElement && btn.dataset.tab) setTab(btn.dataset.tab);
    });
  });

  if (textInput instanceof HTMLTextAreaElement) {
    textInput.addEventListener("input", () => {
      if (!drawingId) return;
      patchDrawing({ label: textInput.value });
    });
  }

  fontSizeEl?.addEventListener("change", () => {
    if (!drawingId || !(fontSizeEl instanceof HTMLSelectElement)) return;
    const size = Number(fontSizeEl.value) || (isFibRetracementTool(String(draft.drawingType ?? "")) ? 12 : 14);
    patchDrawing({ fontSize: size });
  });

  visibilityList.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-vis-btn]");
    if (!(btn instanceof HTMLButtonElement)) return;
    setTvCheck(btn, !btn.classList.contains("tv-set__check--on"));
  });

  alignVBtn?.addEventListener("click", () => {
    if (!(alignVBtn instanceof HTMLElement)) return;
    const drawingType = String(draft.drawingType ?? "");
    const isFib = isFibRetracementTool(drawingType);
    tvMenu.open(alignVBtn, TEXT_ALIGN_V_ITEMS, {
      activeId: isFib ? String(draft.fibLabelAlignV ?? "middle") : String(draft.textAlignV ?? "top"),
      onSelect: (id) => {
        patchDrawing(isFib ? { fibLabelAlignV: id } : { textAlignV: id });
        syncAlignLabels();
      },
    });
  });

  alignHBtn?.addEventListener("click", () => {
    if (!(alignHBtn instanceof HTMLElement)) return;
    const drawingType = String(draft.drawingType ?? "");
    const isFib = isFibRetracementTool(drawingType);
    tvMenu.open(alignHBtn, TEXT_ALIGN_H_ITEMS, {
      activeId: isFib ? String(draft.fibLabelAlignH ?? "left") : String(draft.textAlignH ?? "center"),
      onSelect: (id) => {
        patchDrawing(isFib ? { fibLabelAlignH: id } : { textAlignH: id });
        syncAlignLabels();
      },
    });
  });

  root.querySelector("[data-style-color]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    colorPicker.openSwatch(
      btn,
      { color: draft.color ?? "#2962FF", opacity: draft.colorOpacity ?? 100 },
      {
        onChange: (value) => {
          draft.color = value.color;
          draft.colorOpacity = value.opacity;
          patchDrawing({ color: value.color, colorOpacity: value.opacity });
          syncColorUi();
        },
      },
    );
  });

  styleLineBtn?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement) || btn.hidden) return;
    colorPicker.openLine(
      btn,
      {
        color: draft.color ?? "#2962FF",
        width: draft.lineWidth ?? 2,
        opacity: draft.colorOpacity ?? 100,
        style: Number(draft.lineStyle ?? 0),
      },
      {
        showOpacity: true,
        showLineStyle: true,
        onChange: (value) => {
          draft.color = value.color;
          draft.colorOpacity = value.opacity;
          draft.lineWidth = value.width;
          draft.lineStyle = value.style;
          patchDrawing({
            color: value.color,
            colorOpacity: value.opacity,
            lineWidth: value.width,
            lineStyle: value.style,
          });
          syncColorUi();
        },
      },
    );
  });

  root.querySelector("[data-text-color]")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    colorPicker.openSwatch(
      btn,
      {
        color: draft.textColor ?? draft.color ?? "#2962FF",
        opacity: draft.textColorOpacity ?? 100,
      },
      {
        onChange: (value) => {
          draft.textColor = value.color;
          draft.textColorOpacity = value.opacity;
          syncColorUi();
          if (drawingId) {
            controller.updateDrawing(drawingId, {
              textColor: value.color,
              textColorOpacity: value.opacity,
            });
          }
        },
      },
    );
  });

  wireTrendLineStyleSettings(root, wireCtx);
  wireParallelChannelSettings(root, wireCtx);
  wireChannelStyleSettings(root, wireCtx);
  wireFibRetracementSettings(root, wireCtx);
  wireGannSettings(root, wireCtx);
  wirePatternSettings(root, wireCtx);
  wireCycleSettings(root, wireCtx);
  wireRegressionTrendSettings(root, wireCtx);
  wirePositionSettings(root, { ...wireCtx, getPrecision: () => getContext().precision ?? 2 });
  wireForecastSettings(root, wireCtx);
  wireMeasureSettings(root, wireCtx);
  wireAnnotationSettings(root, wireCtx);
  wireShapeSettings(root, wireCtx);

  controller.on("change", () => {
    if (root.hidden || !drawingId) return;
    if (coordsPanel.contains(document.activeElement)) return;
    refreshContext();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !root.hidden) close();
  });

  return {
    open(drawing, options = {}) {
      if (!drawing) return;
      openForDrawing(drawing);
      if (options.tab) setTab(options.tab);
    },
    refreshContext,
    close,
    destroy() {
      root.remove();
    },
  };
}
