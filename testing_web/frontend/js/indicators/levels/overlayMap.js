import { mapUtcTimeToChartTime } from "/js/indicators/math/barTimeMap.js";
import { buildReleasePlan, resolveNewsLevels } from "/js/news/events.js";
import { tickSizeFromSymbol } from "/js/indicators/symbol.js";
import { inputColorStr } from "/js/indicators/styleColor.js";
import {
  resolveSessionLevels,
  resolveTimeLevels,
} from "../ui/levelsLayersPanel.js";
import {
  debugLevelsEngineResult,
  debugLevelsOverlayStart,
  debugLevelsPriceSanity,
  debugLevelsReplayStep,
  debugLevelsTimeMapping,
} from "../math/levelsDebug.js";

/** @typedef {import("/js/indicators/script/liquidityMatrix.js").LiqLine} LiqLine */

/** @param {LiqLine[]} lines @param {object[]} utcBars @param {object[]} chartBars @param {object} style */
export function levelsToOverlayLines(lines, utcBars, chartBars, style) {
  const showLabels = style.graphicLabels !== false;
  const mapTime = (utc, chartTime) => chartTime ?? mapUtcTimeToChartTime(utc, utcBars, chartBars);

  return lines.map((lvl) => ({
    timeStart: mapTime(lvl.startTime, lvl.startChartTime),
    timeEnd: mapTime(
      lvl.endTime ?? lvl.startTime,
      lvl.endChartTime ?? lvl.sweepChartTime ?? lvl.startChartTime,
    ),
    priceStart: lvl.price,
    priceEnd: lvl.price,
    color: lvl.color,
    width: lvl.lineWidth ?? 2,
    swept: Boolean(lvl.swept),
    dash: lvl.swept ? [2, 3] : [],
    label: showLabels && lvl.label ? lvl.label : "",
    labelTextColor: lvl.color,
    labelAnchor: "right",
    kind: lvl.kind,
  }));
}

/** @param {object} inputs @param {object} style @param {object} ctx @param {object} engine @param {import("./htf.js").LevelsHtf} [levelsHtf] */
export function buildLevelsEngineOpts(inputs, style, ctx, engine, levelsHtf) {
  const newsMasterEnabled = ctx.isNewsEnabled?.() !== false;
  const newsIndicatorEnabled = inputs.newsEnabled !== false;
  const newsRows =
    newsMasterEnabled && newsIndicatorEnabled
      ? resolveNewsLevels(inputs).filter((r) => r.enabled !== false)
      : [];
  const newsByDay =
    newsMasterEnabled && newsIndicatorEnabled ? (ctx.getNewsByDay?.() ?? {}) : {};

  return {
    timeLayers: resolveTimeLevels(inputs),
    sessionLayers: resolveSessionLevels(inputs),
    newsRows,
    newsByDay,
    releasePlan: buildReleasePlan(newsByDay, newsRows),
    pivotLeftBars: inputs.pivotLeftBars,
    pivotRightBars: inputs.pivotRightBars,
    maxUnswept: inputs.maxUnswept,
    maxSwept: inputs.maxSwept,
    maxSessions: inputs.maxSessions,
    tickSize: tickSizeFromSymbol(ctx.symbolInfo),
    chartSec: ctx.barSec ?? 60,
    symbol: ctx.primarySymbol ?? ctx.symbol,
    maxBarsBack: Math.max(10, Number(inputs.maxBarsBack) || 300),
    htfBarsNeeded: levelsHtf?.requiredHtfBars(inputs) ?? Math.max(10, Number(inputs.maxBarsBack) || 300),
    getSecurityBars: ctx.getSecurityBars,
    getBars: ctx.getBars,
    getHtfBars: ctx.getHtfBars,
    requestSecurityBars: ctx.requestSecurityBars,
    requestBars: ctx.requestBars,
    requestHtfBars: ctx.requestHtfBars,
    showLabels: style.graphicLabels !== false,
    preferDatafeedHtf: Boolean(ctx.isReplayLocked?.()),
    replayHostControlled: Boolean(ctx.replayHostControlled),
    mergeConfluence: inputs.mergeConfluence !== false,
    confHiColor: inputColorStr(inputs.confHiColor, "#9400d3"),
    confLoColor: inputColorStr(inputs.confLoColor, "#ffaa00"),
    htfStyles: engine.htfStyles.all(),
    sessionDefs: engine.sessionDefs.all(),
  };
}

export {
  debugLevelsEngineResult,
  debugLevelsOverlayStart,
  debugLevelsPriceSanity,
  debugLevelsReplayStep,
  debugLevelsTimeMapping,
};
