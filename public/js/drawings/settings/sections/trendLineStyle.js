import { extendSummaryLabel, supportsExtendSettings } from "../../tools/line/extend.js";
import {
  supportsTrendLineStyleSettings,
  LINE_END_ITEMS,
  STATS_FIELD_ITEMS,
  STATS_POSITION_ITEMS,
  statsSummaryLabel,
  resolveStatsFields,
} from "../../tools/line/trendStyle.js";
import {
  axisLineShowsPriceLabelOption,
  axisLineShowsTimeLabelOption,
  supportsAxisLineStyleSettings,
} from "../../tools/axis/lines.js";
import { supportsChannelLineStyleSettings } from "../../tools/channel/family.js";
import { isPositionTool } from "../../registry/tools.js";
import { isForecastTool } from "../../tools/forecast/index.js";
import { isMeasureTool } from "../../tools/measure/index.js";
import {
  isBrushTool,
  isDirectionArrowMarkTool,
  isArrowMarkerTool,
  isHighlighterTool,
} from "../../tools/annotation/style.js";
import { isPathTool, isCurveTool } from "../../tools/shape/index.js";
import { EXTEND_CHECKBOX_ITEMS } from "../menu/tv.js";
import { lineEndIconHtml, setTvCheck } from "../dialog/utils.js";

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function syncAxisLineUi(root, draft) {
  const axisLineSection = root.querySelector("[data-axis-line-section]");
  const axisPriceLabelRow = root.querySelector("[data-axis-price-label-row]");
  const axisTimeLabelRow = root.querySelector("[data-axis-time-label-row]");
  const axisPriceLabelBtn = root.querySelector("[data-axis-price-label-btn]");
  const axisTimeLabelBtn = root.querySelector("[data-axis-time-label-btn]");
  const type = String(draft.drawingType ?? "");
  const show = supportsAxisLineStyleSettings(type);
  if (axisLineSection instanceof HTMLElement) axisLineSection.hidden = !show;
  if (!show) return;

  const showPrice = axisLineShowsPriceLabelOption(type);
  const showTime = axisLineShowsTimeLabelOption(type);
  if (axisPriceLabelRow instanceof HTMLElement) axisPriceLabelRow.hidden = !showPrice;
  if (axisTimeLabelRow instanceof HTMLElement) axisTimeLabelRow.hidden = !showTime;
  setTvCheck(axisPriceLabelBtn, Boolean(draft.showPriceLabels));
  setTvCheck(axisTimeLabelBtn, Boolean(draft.showTimeLabel));
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function syncTrendLineUi(root, draft) {
  const trendlineSections = root.querySelectorAll("[data-trendline-section]");
  const leftEndBtn = root.querySelector("[data-left-end-btn]");
  const rightEndBtn = root.querySelector("[data-right-end-btn]");
  const leftEndIcon = root.querySelector("[data-left-end-icon]");
  const rightEndIcon = root.querySelector("[data-right-end-icon]");
  const middlePointBtn = root.querySelector("[data-middle-point-btn]");
  const priceLabelsBtn = root.querySelector("[data-price-labels-btn]");
  const alwaysShowStatsBtn = root.querySelector("[data-always-show-stats-btn]");
  const statsLabel = root.querySelector("[data-stats-label]");
  const statsPositionLabel = root.querySelector("[data-stats-position-label]");

  const type = String(draft.drawingType ?? "");
  if (isPositionTool(type)) return;
  if (isForecastTool(type)) {
    trendlineSections.forEach((el) => {
      if (el instanceof HTMLElement) el.hidden = true;
    });
    if (leftEndBtn instanceof HTMLElement) leftEndBtn.hidden = true;
    if (rightEndBtn instanceof HTMLElement) rightEndBtn.hidden = true;
    return;
  }
  if (isMeasureTool(type)) {
    trendlineSections.forEach((el) => {
      if (el instanceof HTMLElement) el.hidden = true;
    });
    if (leftEndBtn instanceof HTMLElement) leftEndBtn.hidden = true;
    if (rightEndBtn instanceof HTMLElement) rightEndBtn.hidden = true;
    return;
  }
  if (isHighlighterTool(type)) {
    trendlineSections.forEach((el) => {
      if (el instanceof HTMLElement) el.hidden = true;
    });
    if (leftEndBtn instanceof HTMLElement) leftEndBtn.hidden = true;
    if (rightEndBtn instanceof HTMLElement) rightEndBtn.hidden = true;
    return;
  }
  if (isBrushTool(type)) {
    trendlineSections.forEach((el) => {
      if (el instanceof HTMLElement) el.hidden = true;
    });
    if (leftEndBtn instanceof HTMLElement) leftEndBtn.hidden = false;
    if (rightEndBtn instanceof HTMLElement) rightEndBtn.hidden = false;
    const leftEnd = String(draft.leftEnd ?? "normal");
    const rightEnd = String(draft.rightEnd ?? "normal");
    if (leftEndIcon instanceof HTMLElement) leftEndIcon.innerHTML = lineEndIconHtml(leftEnd, false);
    if (rightEndIcon instanceof HTMLElement) rightEndIcon.innerHTML = lineEndIconHtml(rightEnd, true);
    return;
  }
  if (isPathTool(type)) {
    trendlineSections.forEach((el) => {
      if (el instanceof HTMLElement) el.hidden = true;
    });
    if (leftEndBtn instanceof HTMLElement) leftEndBtn.hidden = false;
    if (rightEndBtn instanceof HTMLElement) rightEndBtn.hidden = false;
    const leftEnd = String(draft.leftEnd ?? "normal");
    const rightEnd = String(draft.rightEnd ?? "arrow");
    if (leftEndIcon instanceof HTMLElement) leftEndIcon.innerHTML = lineEndIconHtml(leftEnd, false);
    if (rightEndIcon instanceof HTMLElement) rightEndIcon.innerHTML = lineEndIconHtml(rightEnd, true);
    return;
  }
  if (isCurveTool(type)) {
    trendlineSections.forEach((el) => {
      if (el instanceof HTMLElement) el.hidden = true;
    });
    if (leftEndBtn instanceof HTMLElement) leftEndBtn.hidden = false;
    if (rightEndBtn instanceof HTMLElement) rightEndBtn.hidden = false;
    const leftEnd = String(draft.leftEnd ?? "normal");
    const rightEnd = String(draft.rightEnd ?? "normal");
    if (leftEndIcon instanceof HTMLElement) leftEndIcon.innerHTML = lineEndIconHtml(leftEnd, false);
    if (rightEndIcon instanceof HTMLElement) rightEndIcon.innerHTML = lineEndIconHtml(rightEnd, true);
    return;
  }
  if (isArrowMarkerTool(type) || isDirectionArrowMarkTool(type)) {
    trendlineSections.forEach((el) => {
      if (el instanceof HTMLElement) el.hidden = true;
    });
    if (leftEndBtn instanceof HTMLElement) leftEndBtn.hidden = true;
    if (rightEndBtn instanceof HTMLElement) rightEndBtn.hidden = true;
    return;
  }
  const showTrend = supportsTrendLineStyleSettings(type);
  const showChannelLine = supportsChannelLineStyleSettings(type);
  const showEnds = showTrend || showChannelLine;
  trendlineSections.forEach((el) => {
    if (el instanceof HTMLElement) el.hidden = !showTrend;
  });
  if (leftEndBtn instanceof HTMLElement) leftEndBtn.hidden = !showEnds;
  if (rightEndBtn instanceof HTMLElement) rightEndBtn.hidden = !showEnds;
  if (!showTrend && !showChannelLine) return;

  const leftEnd = String(draft.leftEnd ?? "normal");
  const rightEnd = String(draft.rightEnd ?? "normal");
  if (leftEndIcon instanceof HTMLElement) leftEndIcon.innerHTML = lineEndIconHtml(leftEnd, false);
  if (rightEndIcon instanceof HTMLElement) rightEndIcon.innerHTML = lineEndIconHtml(rightEnd, true);

  setTvCheck(middlePointBtn, Boolean(draft.showMiddlePoint));
  setTvCheck(priceLabelsBtn, Boolean(draft.showPriceLabels));
  setTvCheck(alwaysShowStatsBtn, Boolean(draft.alwaysShowStats));

  const statsFields = resolveStatsFields({ statsFields: draft.statsFields, statsMode: draft.statsMode });
  if (statsLabel) statsLabel.textContent = statsSummaryLabel(statsFields);
  const statsPosition =
    STATS_POSITION_ITEMS.find((i) => i.id === draft.statsPosition) ?? STATS_POSITION_ITEMS[3];
  if (statsPositionLabel) statsPositionLabel.textContent = statsPosition.label;
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function syncExtendUi(root, draft) {
  const extendSections = root.querySelectorAll("[data-extend-section]");
  const extendLabel = root.querySelector("[data-extend-label]");
  const show = supportsExtendSettings(String(draft.drawingType ?? ""));
  extendSections.forEach((el) => {
    if (el instanceof HTMLElement) el.hidden = !show;
  });
  if (extendLabel) {
    extendLabel.textContent = extendSummaryLabel(Boolean(draft.extendLeft), Boolean(draft.extendRight));
  }
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   getDraft: () => Record<string, unknown>,
 *   patchDrawing: (patch: Record<string, unknown>) => void,
 *   tvMenu: ReturnType<typeof import("../menu/tv.js").createTvMenu>,
 * }} ctx
 */
export function wireTrendLineStyleSettings(root, ctx) {
  const { getDraft, patchDrawing, tvMenu } = ctx;
  const extendBtn = root.querySelector("[data-extend-btn]");
  const leftEndBtn = root.querySelector("[data-left-end-btn]");
  const rightEndBtn = root.querySelector("[data-right-end-btn]");
  const statsBtn = root.querySelector("[data-stats-btn]");
  const statsPositionBtn = root.querySelector("[data-stats-position-btn]");
  const middlePointBtn = root.querySelector("[data-middle-point-btn]");
  const priceLabelsBtn = root.querySelector("[data-price-labels-btn]");
  const axisPriceLabelBtn = root.querySelector("[data-axis-price-label-btn]");
  const axisTimeLabelBtn = root.querySelector("[data-axis-time-label-btn]");
  const alwaysShowStatsBtn = root.querySelector("[data-always-show-stats-btn]");

  extendBtn?.addEventListener("click", () => {
    const draft = getDraft();
    if (!(extendBtn instanceof HTMLElement)) return;
    tvMenu.openCheckboxMenu(extendBtn, EXTEND_CHECKBOX_ITEMS, {
      checked: {
        left: Boolean(draft.extendLeft),
        right: Boolean(draft.extendRight),
      },
      onChange: (id, checked) => {
        if (id === "left") patchDrawing({ extendLeft: checked });
        else if (id === "right") patchDrawing({ extendRight: checked });
        syncExtendUi(root, getDraft());
      },
    });
  });

  leftEndBtn?.addEventListener("click", () => {
    const draft = getDraft();
    if (!(leftEndBtn instanceof HTMLElement)) return;
    tvMenu.open(leftEndBtn, LINE_END_ITEMS, {
      activeId: String(draft.leftEnd ?? "normal"),
      onSelect: (id) => {
        patchDrawing({ leftEnd: id });
        syncTrendLineUi(root, getDraft());
      },
    });
  });

  rightEndBtn?.addEventListener("click", () => {
    const draft = getDraft();
    if (!(rightEndBtn instanceof HTMLElement)) return;
    tvMenu.open(rightEndBtn, LINE_END_ITEMS, {
      activeId: String(draft.rightEnd ?? "normal"),
      onSelect: (id) => {
        patchDrawing({ rightEnd: id });
        syncTrendLineUi(root, getDraft());
      },
    });
  });

  statsBtn?.addEventListener("click", () => {
    const draft = getDraft();
    if (!(statsBtn instanceof HTMLElement)) return;
    const fields = resolveStatsFields({ statsFields: draft.statsFields, statsMode: draft.statsMode });
    tvMenu.openCheckboxMenu(statsBtn, STATS_FIELD_ITEMS, {
      checked: fields,
      onChange: (id, checked) => {
        const next = { ...resolveStatsFields({ statsFields: draft.statsFields }), [id]: checked };
        patchDrawing({ statsFields: next });
        syncTrendLineUi(root, getDraft());
      },
    });
  });

  statsPositionBtn?.addEventListener("click", () => {
    const draft = getDraft();
    if (!(statsPositionBtn instanceof HTMLElement)) return;
    tvMenu.open(statsPositionBtn, STATS_POSITION_ITEMS, {
      activeId: String(draft.statsPosition ?? "auto"),
      onSelect: (id) => {
        patchDrawing({ statsPosition: id });
        syncTrendLineUi(root, getDraft());
      },
    });
  });

  middlePointBtn?.addEventListener("click", () => {
    if (!(middlePointBtn instanceof HTMLButtonElement)) return;
    const next = !middlePointBtn.classList.contains("tv-set__check--on");
    setTvCheck(middlePointBtn, next);
    patchDrawing({ showMiddlePoint: next });
  });

  priceLabelsBtn?.addEventListener("click", () => {
    if (!(priceLabelsBtn instanceof HTMLButtonElement)) return;
    const next = !priceLabelsBtn.classList.contains("tv-set__check--on");
    setTvCheck(priceLabelsBtn, next);
    patchDrawing({ showPriceLabels: next });
  });

  axisPriceLabelBtn?.addEventListener("click", () => {
    if (!(axisPriceLabelBtn instanceof HTMLButtonElement)) return;
    const next = !axisPriceLabelBtn.classList.contains("tv-set__check--on");
    setTvCheck(axisPriceLabelBtn, next);
    patchDrawing({ showPriceLabels: next });
  });

  axisTimeLabelBtn?.addEventListener("click", () => {
    if (!(axisTimeLabelBtn instanceof HTMLButtonElement)) return;
    const next = !axisTimeLabelBtn.classList.contains("tv-set__check--on");
    setTvCheck(axisTimeLabelBtn, next);
    patchDrawing({ showTimeLabel: next });
  });

  alwaysShowStatsBtn?.addEventListener("click", () => {
    if (!(alwaysShowStatsBtn instanceof HTMLButtonElement)) return;
    const next = !alwaysShowStatsBtn.classList.contains("tv-set__check--on");
    setTvCheck(alwaysShowStatsBtn, next);
    patchDrawing({ alwaysShowStats: next });
  });
}
