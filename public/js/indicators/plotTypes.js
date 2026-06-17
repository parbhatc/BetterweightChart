import { LineType } from "lightweight-charts";
import { applyColorOpacity } from "../ui/color/picker.js";

/** @typedef {'line' | 'area' | 'histogram'} IndicatorSeriesKind */

/** @param {string} plotType @param {string} [fallbackKind] */
export function seriesKindForPlotType(plotType, fallbackKind = "line") {
  if (plotType === "area" || plotType === "area_breaks") return "area";
  if (plotType === "histogram" || plotType === "columns") return "histogram";
  if (fallbackKind === "histogram" && (plotType === "line" || plotType === "line_breaks")) {
    return "line";
  }
  return "line";
}

/** @param {string} plotType */
export function plotTypeUsesBreaks(plotType) {
  return plotType === "line_breaks" || plotType === "step_breaks" || plotType === "area_breaks";
}

/**
 * @param {string} plotType
 * @param {string} color
 * @param {number} width
 * @param {number} lineStyle
 * @param {import("lightweight-charts").LineStyle[]} lineStyles
 */
export function lineOptionsForPlotType(plotType, color, width, lineStyle, lineStyles) {
  const style = lineStyles[lineStyle] ?? lineStyles[0];
  /** @type {Record<string, unknown>} */
  const base = {
    color,
    lineWidth: width,
    lineStyle: style,
    crosshairMarkerVisible: false,
  };

  switch (plotType) {
    case "line_breaks":
      return {
        ...base,
        lineType: LineType.Simple,
        lineVisible: true,
        pointMarkersVisible: true,
        pointMarkersRadius: 2,
      };
    case "step":
      return { ...base, lineType: LineType.WithSteps, lineVisible: true, pointMarkersVisible: false };
    case "step_breaks":
      return {
        ...base,
        lineType: LineType.WithSteps,
        lineVisible: true,
        pointMarkersVisible: true,
        pointMarkersRadius: 2,
      };
    case "step_diamonds":
      return {
        ...base,
        lineType: LineType.WithSteps,
        lineVisible: true,
        pointMarkersVisible: true,
        pointMarkersRadius: 3,
      };
    case "cross":
      return {
        ...base,
        lineType: LineType.Simple,
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 4,
      };
    case "circles":
      return {
        ...base,
        lineType: LineType.Simple,
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 3,
      };
    case "line":
    default:
      return { ...base, lineType: LineType.Simple, lineVisible: true, pointMarkersVisible: false };
  }
}

/**
 * @param {string} plotType
 * @param {string} color
 * @param {number} width
 * @param {number} lineStyle
 * @param {import("lightweight-charts").LineStyle[]} lineStyles
 */
export function areaOptionsForPlotType(plotType, color, width, lineStyle, lineStyles) {
  const style = lineStyles[lineStyle] ?? lineStyles[0];
  const stepped = plotType === "area_breaks";
  return {
    lineColor: color,
    topColor: applyColorOpacity(color, 38),
    bottomColor: applyColorOpacity(color, 4),
    lineWidth: width,
    lineStyle: style,
    lineType: stepped ? LineType.WithSteps : LineType.Simple,
    lineVisible: true,
    pointMarkersVisible: stepped,
    pointMarkersRadius: stepped ? 2 : undefined,
    crosshairMarkerVisible: false,
  };
}

/**
 * @param {Array<number | null>} values
 * @param {{ time: number }[]} chartBars
 * @param {string} plotType
 * @returns {{ time: number, value: number, color?: string }[]}
 */
export function buildNumericPlotPoints(values, chartBars, plotType) {
  /** @type {{ time: number, value: number }[]} */
  const points = [];
  for (let i = 0; i < chartBars.length; i++) {
    const val = values[i];
    if (val == null || !Number.isFinite(val)) continue;
    points.push({ time: chartBars[i].time, value: val });
  }
  void plotTypeUsesBreaks(plotType);
  return points;
}
